import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';
import { getPlan, type PlanDefinition } from '../lib/plans.js';
import { resolveListLimit, resolveSearchLimit } from '../lib/plan-enforcement.js';
import { enrichRowsWithGroupNames } from '../lib/memory-public.js';
import {
  applyMemoryListFilter,
  buildAccessibleVectorRpcParams,
  canDeleteMemory,
  canReadMemory,
  canUpdateMemory,
  fetchGroupNameMap,
  resolveMemoryWriteTarget,
  type MemoryRow as AccessMemoryRow,
  type MemoryQueryBuilder,
  type MemoryScopeValue,
  type VisibilityFilter,
} from '../lib/memory-access.js';
import {
  applyTextSearchOr,
  resolveVectorThreshold,
} from '../lib/memory-search.js';
import { searchMemoriesWithScopeRetry } from '../lib/memory-search-run.js';
import {
  applyScopeToQuery,
  buildVectorRpcParams,
  hasScopedSearch,
  normalizeCollectionSlug,
  normalizeTags,
  resolveCollection,
  ensureMemoryCollectionRegistered,
  mergeCollectionLists,
  MemoryScopeFilters,
  MAX_MEMORY_CONTENT_LENGTH,
  APPEND_SEPARATOR,
} from '../lib/memory-scope.js';
import {
  prepareContentForStorage,
  decryptMemoryRow,
  decryptMemoryRows,
  filterRowsByTextContent,
  type MemoryRowMinimal,
} from '../lib/memory-crypto.js';
import { shouldSkipContentIlike } from '../lib/memory-persistence.js';

export type TenantFilter = {
  userId: string;
  workforceWorkspaceId?: string;
  memoryScope?: MemoryScopeValue;
  visibility?: VisibilityFilter;
  groupId?: string;
};

export interface MemoryRow {
  id: string;
  user_id: string;
  content: string;
  memory_type: 'general' | 'preference' | 'fact' | 'instruction' | 'conversation';
  importance: number;
  tags: string[];
  collection: string | null;
  thread_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  similarity?: number;
}

export interface RevisionEntry {
  content: string;
  appended_at: string;
}

export async function saveMemory(p: {
  userId: string;
  workforceWorkspaceId?: string;
  content: string;
  type?: MemoryRow['memory_type'];
  tags?: string[];
  collection?: string | null;
  importance?: number;
  metadata?: Record<string, unknown>;
  thread_id?: string | null;
  append_to?: string;
  visibility?: VisibilityFilter;
  group_id?: string;
  group_name?: string;
}): Promise<MemoryRow> {
  if (p.append_to) {
    return appendToMemory({
      userId: p.userId,
      workforceWorkspaceId: p.workforceWorkspaceId,
      memoryId: p.append_to,
      newContent: p.content,
    });
  }

  const tags = normalizeTags(p.tags);
  const collection = resolveCollection({
    collection: p.collection,
    tags,
    memory_type: p.type ?? 'general',
  });

  await ensureMemoryCollectionRegistered(supabase, {
    userId: p.userId,
    slug: collection,
    defaultMemoryType: p.type ?? 'general',
  });

  const writeTarget = await resolveMemoryWriteTarget(
    p.userId,
    {
      visibility: p.visibility ?? 'private',
      groupId: p.group_id,
      groupName: p.group_name,
      workforceWorkspaceId: p.workforceWorkspaceId,
    },
    p.workforceWorkspaceId
  );
  if ('error' in writeTarget) {
    throw new Error(writeTarget.error);
  }

  const memoryScope = writeTarget.scope;

  const scopeInfo = {
    user_id: p.userId,
    scope: memoryScope,
    group_id: memoryScope === 'group' ? writeTarget.groupId : null,
    workforce_workspace_id: memoryScope === 'workforce' ? writeTarget.workforceWorkspaceId : null,
  };

  // Encrypt content + metadata for storage (embedding generated from plaintext)
  const { content: encContent, metadata: encMeta } = await prepareContentForStorage(
    p.content,
    p.metadata ?? {},
    scopeInfo
  );

  const { data, error } = await supabase
    .from('memories')
    .insert({
      user_id: p.userId,
      content: encContent,
      memory_type: p.type ?? 'general',
      tags,
      collection,
      thread_id: p.thread_id ?? null,
      importance: p.importance ?? 0.5,
      metadata: encMeta,
      scope: memoryScope,
      group_id: scopeInfo.group_id ?? null,
      workforce_workspace_id: scopeInfo.workforce_workspace_id ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`saveMemory: ${error.message}`);

  const row = data as MemoryRow;
  const embedding = await generateEmbedding(p.content);
  if (embedding) {
    const { data: updated, error: embedError } = await supabase
      .from('memories')
      .update({ embedding })
      .eq('id', row.id)
      .select()
      .single();
    if (!embedError && updated) {
      const dec = await decryptMemoryRow(updated as unknown as MemoryRowMinimal, p.userId);
      return (dec ?? updated) as unknown as MemoryRow;
    }
  }

  const dec = await decryptMemoryRow(row as unknown as MemoryRowMinimal, p.userId);
  return (dec ?? row) as unknown as MemoryRow;
}

export async function appendToMemory(p: {
  userId: string;
  workforceWorkspaceId?: string;
  memoryId: string;
  newContent: string;
}): Promise<MemoryRow> {
  const { data: existing, error: fetchError } = await supabase
    .from('memories')
    .select('*')
    .eq('id', p.memoryId)
    .single();

  if (fetchError || !existing) throw new Error('Memory not found');

  const canUpdate = await canUpdateMemory(p.userId, existing as AccessMemoryRow);
  if (!canUpdate) throw new Error('Not authorized to append to this memory');

  // Decrypt existing content before merge
  const decrypted = await decryptMemoryRow(existing as unknown as MemoryRowMinimal, p.userId);
  if (!decrypted) throw new Error('Memory not found');

  const existingContent = decrypted.content as string;
  const merged = `${existingContent}${APPEND_SEPARATOR}${p.newContent.trim()}`;
  if (merged.length > MAX_MEMORY_CONTENT_LENGTH) {
    throw new Error(
      `Merged content exceeds ${MAX_MEMORY_CONTENT_LENGTH} chars. Create a new memory in the same collection instead.`
    );
  }

  const metadata = (decrypted.metadata as Record<string, unknown>) || {};
  const revisions = Array.isArray(metadata.revisions)
    ? [...(metadata.revisions as RevisionEntry[])]
    : [];
  revisions.push({ content: existingContent, appended_at: new Date().toISOString() });

  const newMetadata = { ...metadata, revisions };

  // Embedding from plaintext
  const embedding = await generateEmbedding(merged);

  // Encrypt for storage
  const { content: encContent, metadata: encMeta } = await prepareContentForStorage(
    merged,
    newMetadata,
    {
      user_id: existing.user_id,
      scope: existing.scope,
      group_id: existing.group_id,
      workforce_workspace_id: existing.workforce_workspace_id,
    }
  );

  const updates: Record<string, unknown> = {
    content: encContent,
    metadata: encMeta,
    updated_at: new Date().toISOString(),
  };
  if (embedding) updates.embedding = embedding;

  const { data, error } = await supabase
    .from('memories')
    .update(updates)
    .eq('id', p.memoryId)
    .select()
    .single();

  if (error) throw new Error(`appendToMemory: ${error.message}`);

  const dec = await decryptMemoryRow(data as unknown as MemoryRowMinimal, p.userId);
  return (dec ?? data) as unknown as MemoryRow;
}

function resolveLimits(planLimits?: PlanDefinition['limits']): PlanDefinition['limits'] {
  return planLimits ?? getPlan('free').limits;
}

export async function searchMemories(p: {
  userId: string;
  workforceWorkspaceId?: string;
  query: string;
  limit?: number;
  planLimits?: PlanDefinition['limits'];
  type?: string;
  collection?: string | null;
  tags?: string[];
  visibility?: VisibilityFilter;
  group_id?: string;
  group_name?: string;
}): Promise<MemoryRow[]> {
  const limit = resolveSearchLimit(resolveLimits(p.planLimits), p.limit);
  const baseScope: MemoryScopeFilters = {
    collection: normalizeCollectionSlug(p.collection ?? undefined) ?? undefined,
    tags: p.tags?.length ? normalizeTags(p.tags) : undefined,
    type: p.type,
  };
  const rawCollection = p.collection ?? null;

  let collections: Awaited<ReturnType<typeof listCollections>> = [];
  try {
    collections = await listCollections(p.userId);
  } catch {
    // continue without fuzzy collection resolution
  }

  const embedding = await generateEmbedding(p.query);
  const memoryScope: MemoryScopeValue =
    p.visibility === 'private' ? 'personal' : p.visibility === 'shared' ? 'group' : 'all';

  const results = await searchMemoriesWithScopeRetry<Record<string, unknown>>({
    query: p.query,
    baseScope,
    rawCollection,
    collections,
    generateEmbedding: async () => embedding,
    vectorSearch: async (queryEmbedding, scope) => {
      if (!queryEmbedding) return [];
      const threshold = resolveVectorThreshold(scope);
      const rpcParams = await buildAccessibleVectorRpcParams(
        p.userId,
        queryEmbedding,
        limit,
        threshold,
        scope,
        {
          workforceWorkspaceId: p.workforceWorkspaceId,
          visibility: p.visibility ?? 'all',
          memoryScope,
          groupId: p.group_id,
        }
      );
      const { data, error } = await supabase.rpc('search_memories_accessible', rpcParams);
      if (error || !data?.length) {
        const legacyParams = buildVectorRpcParams(p.userId, queryEmbedding, limit, threshold, scope);
        const legacy = await supabase.rpc('search_memories_vector', legacyParams);
        if (legacy.error || !legacy.data?.length) return [];
        return legacy.data as Record<string, unknown>[];
      }
      return data as Record<string, unknown>[];
    },
    textSearch: async (scope) => {
      let q: MemoryQueryBuilder = supabase.from('memories').select('*');
      const accessResult = await applyMemoryListFilter(q, {
        userId: p.userId,
        workforceWorkspaceId: p.workforceWorkspaceId,
        memoryScope,
        visibility: p.visibility ?? 'all',
        groupId: p.group_id,
      });
      if (accessResult.error) return [];
      q = accessResult.query
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      q = applyScopeToQuery(q, scope);
      q = applyTextSearchOr(q, p.query, { skipContentIlike: shouldSkipContentIlike() });

      const { data, error } = await q;
      if (error) throw new Error(`searchMemories: ${error.message}`);
      return (data ?? []) as Record<string, unknown>[];
    },
  });

  // Decrypt all search results
  const decrypted = await decryptMemoryRows(
    results as unknown as MemoryRowMinimal[],
    p.userId
  );

  // Post-decrypt keyword filter when content.ilike was skipped
  let filtered = decrypted as unknown as Record<string, unknown>[];
  if (shouldSkipContentIlike() && p.query.trim()) {
    filtered = filterRowsByTextContent(
      decrypted,
      p.query
    ) as unknown as Record<string, unknown>[];
  }

  const enriched = await enrichRowsWithGroupNames(filtered, fetchGroupNameMap);
  return enriched as unknown as MemoryRow[];
}

export async function getMemoryById(p: {
  userId: string;
  workforceWorkspaceId?: string;
  memoryId: string;
}): Promise<MemoryRow> {
  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .eq('id', p.memoryId)
    .single();
  if (error || !data) throw new Error('Memory not found');
  const allowed = await canReadMemory(
    p.userId,
    data as AccessMemoryRow,
    p.workforceWorkspaceId
  );
  if (!allowed) throw new Error('Memory not found');

  const dec = await decryptMemoryRow(data as unknown as MemoryRowMinimal, p.userId);
  if (!dec) throw new Error('Memory not found');

  const [row] = await enrichRowsWithGroupNames([dec as unknown as Record<string, unknown>], fetchGroupNameMap);
  return row as unknown as MemoryRow;
}

export async function listMemories(p: {
  userId: string;
  workforceWorkspaceId?: string;
  limit?: number;
  planLimits?: PlanDefinition['limits'];
  type?: string;
  collection?: string | null;
  tags?: string[];
  visibility?: VisibilityFilter;
  group_id?: string;
}): Promise<MemoryRow[]> {
  const listLimit = resolveListLimit(resolveLimits(p.planLimits), p.limit);
  const scope: MemoryScopeFilters = {
    collection: normalizeCollectionSlug(p.collection ?? undefined) ?? undefined,
    tags: p.tags?.length ? normalizeTags(p.tags) : undefined,
    type: p.type,
  };
  const memoryScope: MemoryScopeValue =
    p.visibility === 'private' ? 'personal' : p.visibility === 'shared' ? 'group' : 'all';

  let q: MemoryQueryBuilder = supabase.from('memories').select('*');
  const accessResult = await applyMemoryListFilter(q, {
    userId: p.userId,
    workforceWorkspaceId: p.workforceWorkspaceId,
    memoryScope,
    visibility: p.visibility ?? 'all',
    groupId: p.group_id,
  });
  if (accessResult.error) return [];
  q = accessResult.query.order('created_at', { ascending: false }).limit(listLimit);

  q = applyScopeToQuery(q, scope);

  const { data, error } = await q;
  if (error) throw new Error(`listMemories: ${error.message}`);

  const decrypted = await decryptMemoryRows(
    ((data ?? []) as unknown as MemoryRowMinimal[]),
    p.userId
  );

  const enriched = await enrichRowsWithGroupNames(
    decrypted as unknown as Record<string, unknown>[],
    fetchGroupNameMap
  );
  return enriched as unknown as MemoryRow[];
}

export async function listCollections(userId: string): Promise<
  Array<{ slug: string; name: string; description: string | null }>
> {
  const { data: registered, error: regError } = await supabase
    .from('memory_collections')
    .select('slug, name, description')
    .eq('user_id', userId)
    .order('name');

  if (regError) throw new Error(`listCollections: ${regError.message}`);

  const { data: memories, error: memError } = await supabase
    .from('memories')
    .select('collection')
    .eq('user_id', userId)
    .not('collection', 'is', null);

  if (memError) throw new Error(`listCollections: ${memError.message}`);

  const slugs = new Set<string>();
  for (const row of memories ?? []) {
    if (row.collection) slugs.add(row.collection);
  }

  return mergeCollectionLists(registered ?? [], slugs);
}

export async function deleteMemory(p: {
  userId: string;
  workforceWorkspaceId?: string;
  memoryId: string;
}): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('memories')
    .select('*')
    .eq('id', p.memoryId)
    .single();
  if (fetchError || !existing) throw new Error('Memory not found');
  const canDelete = await canDeleteMemory(p.userId, existing as AccessMemoryRow);
  if (!canDelete) throw new Error('Not authorized to delete this memory');
  const { error } = await supabase.from('memories').delete().eq('id', p.memoryId);
  if (error) throw new Error(`deleteMemory: ${error.message}`);
}

export async function getStats(
  userId: string,
  workforceWorkspaceId?: string
): Promise<{ total: number; byType: Record<string, number>; byCollection: Record<string, number> }> {
  let countQ = supabase.from('memories').select('*', { count: 'exact', head: true });
  const countAccess = await applyMemoryListFilter(countQ, {
    userId,
    workforceWorkspaceId,
    memoryScope: 'all',
    visibility: 'all',
  });
  countQ = countAccess.error
    ? countQ.eq('user_id', userId).eq('scope', 'personal')
    : countAccess.query;
  const { count, error: countError } = await countQ;
  if (countError) throw new Error(`getStats: ${countError.message}`);

  let rowsQ = supabase.from('memories').select('memory_type, collection');
  const rowsAccess = await applyMemoryListFilter(rowsQ, {
    userId,
    workforceWorkspaceId,
    memoryScope: 'all',
    visibility: 'all',
  });
  rowsQ = rowsAccess.error
    ? rowsQ.eq('user_id', userId).eq('scope', 'personal')
    : rowsAccess.query;
  const { data, error } = await rowsQ;
  if (error) throw new Error(`getStats: ${error.message}`);
  const rows = data ?? [];
  const byType: Record<string, number> = {};
  const byCollection: Record<string, number> = {};
  for (const row of rows) {
    byType[row.memory_type] = (byType[row.memory_type] ?? 0) + 1;
    const coll = row.collection || '(uncategorized)';
    byCollection[coll] = (byCollection[coll] ?? 0) + 1;
  }
  return { total: count ?? rows.length, byType, byCollection };
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!config.OPENAI_API_KEY) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: 'text-embedding-ada-002', input: text }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

export { hasScopedSearch };
