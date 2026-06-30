import { supabase } from '../lib/supabase.js';
import { getPlan, type PlanDefinition } from '../lib/plans.js';
import { resolveListLimit, resolveSearchLimit, loadUserPlan, assertWriteStorageAllowed } from '../lib/plan-enforcement.js';
import {
  estimateMemoryPayloadBytes,
  getStorageBytesUsed,
} from '../lib/storage-bytes.js';
import { enrichRowsWithGroupNames } from '../lib/memory-public.js';
import {
  applyMemoryListFilter,
  buildAccessibleStatsRpcParams,
  buildAccessibleVectorRpcParams,
  canDeleteMemory,
  canReadMemory,
  fetchGroupNameMap,
  resolveMemoryWriteTarget,
  type AccessibleStatsRpcParams,
  type MemoryRow as AccessMemoryRow,
  type MemoryQueryBuilder,
  type MemoryScopeValue,
  type VisibilityFilter,
} from '../lib/memory-access.js';
import {
  applyTextSearchOr,
  resolveMinSimilarity,
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
  shouldUseStrictProjectScope,
} from '../lib/memory-scope.js';
import { appendToMemory } from '../lib/memory-append.js';
import {
  prepareContentForStorage,
  decryptMemoryRow,
  decryptMemoryRows,
  filterRowsByTextContent,
  type MemoryRowMinimal,
} from '../lib/memory-crypto.js';
import { shouldSkipContentIlike } from '../lib/memory-persistence.js';
import { scheduleEmbeddingUpdate } from '../lib/embedding-background.js';
import { generateEmbedding } from '../lib/embedding.js';
import { logPerfPhase } from '../lib/mcp-perf.js';
import type { MemoryRow } from './memory-types.js';

export type { MemoryRow } from './memory-types.js';

export type TenantFilter = {
  userId: string;
  workforceWorkspaceId?: string;
  memoryScope?: MemoryScopeValue;
  visibility?: VisibilityFilter;
  groupId?: string;
};

export { appendToMemory } from '../lib/memory-append.js';

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

  await assertWriteStorageAllowed(
    p.userId,
    estimateMemoryPayloadBytes(p.content, p.metadata ?? {})
  );

  const saveStartedAt = Date.now();

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
  scheduleEmbeddingUpdate(row.id, p.content);

  const dec = await decryptMemoryRow(row as unknown as MemoryRowMinimal, p.userId);
  if (!dec) throw new Error('Memory not found');
  logPerfPhase('remember_save', Date.now() - saveStartedAt, {
    memoryId: row.id,
    collection,
    embedding: 'async',
  });
  return dec as unknown as MemoryRow;
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
  min_similarity?: number;
}): Promise<MemoryRow[]> {
  const searchStartedAt = Date.now();
  const limit = resolveSearchLimit(resolveLimits(p.planLimits), p.limit);
  const baseScope: MemoryScopeFilters = {
    collection: normalizeCollectionSlug(p.collection ?? undefined) ?? undefined,
    tags: p.tags?.length ? normalizeTags(p.tags) : undefined,
    type: p.type,
  };
  const rawCollection = p.collection ?? null;
  const shouldResolveCollectionHints = Boolean(rawCollection?.trim());
  const collectionsPromise = shouldResolveCollectionHints
    ? listCollections(p.userId).catch(() => [] as Awaited<ReturnType<typeof listCollections>>)
    : Promise.resolve([] as Awaited<ReturnType<typeof listCollections>>);
  const embeddingPromise = generateEmbedding(p.query);
  const prepStartedAt = Date.now();
  const [collections, embedding] = await Promise.all([collectionsPromise, embeddingPromise]);
  logPerfPhase('search_prepare', Date.now() - prepStartedAt, {
    hasCollectionHint: shouldResolveCollectionHints,
    collectionsCount: collections.length,
    hasEmbedding: Boolean(embedding),
  });
  const memoryScope: MemoryScopeValue =
    p.visibility === 'private' ? 'personal' : p.visibility === 'shared' ? 'group' : 'all';
  const searchDbStartedAt = Date.now();
  const results = await searchMemoriesWithScopeRetry<Record<string, unknown>>({
    query: p.query,
    baseScope,
    rawCollection,
    collections,
    strictScope: shouldUseStrictProjectScope(rawCollection, baseScope),
    generateEmbedding: async () => embedding,
    vectorSearch: async (queryEmbedding, scope) => {
      if (!queryEmbedding) return [];
      const threshold = resolveMinSimilarity(scope, p.min_similarity);
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
  logPerfPhase('search_db', Date.now() - searchDbStartedAt, {
    resultCount: results.length,
    encryptedSearch: shouldSkipContentIlike(),
  });

  // Decrypt all search results
  const decryptStartedAt = Date.now();
  const decrypted = await decryptMemoryRows(
    results as unknown as MemoryRowMinimal[],
    p.userId
  );
  logPerfPhase('search_decrypt', Date.now() - decryptStartedAt, {
    resultCount: results.length,
    decryptedCount: decrypted.length,
  });

  // Post-decrypt keyword filter when content.ilike was skipped
  let filtered = decrypted as unknown as Record<string, unknown>[];
  if (shouldSkipContentIlike() && p.query.trim()) {
    const postFilterStartedAt = Date.now();
    filtered = filterRowsByTextContent(
      decrypted,
      p.query
    ) as unknown as Record<string, unknown>[];
    logPerfPhase('search_post_filter', Date.now() - postFilterStartedAt, {
      filteredCount: filtered.length,
    });
  }

  const enrichStartedAt = Date.now();
  const enriched = await enrichRowsWithGroupNames(filtered, fetchGroupNameMap);
  logPerfPhase('search_enrich', Date.now() - enrichStartedAt, {
    enrichedCount: enriched.length,
  });
  logPerfPhase('search_total', Date.now() - searchStartedAt, {
    finalCount: enriched.length,
    visibility: p.visibility ?? 'all',
  });
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
): Promise<{
  total: number;
  byType: Record<string, number>;
  byCollection: Record<string, number>;
  storageBytesUsed?: number;
  storageBytesLimit?: number;
}> {
  const statsStartedAt = Date.now();

  let stats: {
    total: number;
    byType: Record<string, number>;
    byCollection: Record<string, number>;
  };

  try {
    const rpcParams = await buildAccessibleStatsRpcParams(userId, {
      workforceWorkspaceId,
      memoryScope: 'all',
      visibility: 'all',
    });
    const rpcStats = await fetchStatsViaRpc(rpcParams);
    if (rpcStats) {
      logPerfPhase('stats_query', Date.now() - statsStartedAt, { via: 'rpc' });
      stats = rpcStats;
    } else {
      stats = await fetchStatsFallback(userId, workforceWorkspaceId);
      logPerfPhase('stats_query', Date.now() - statsStartedAt, { via: 'fallback' });
    }
  } catch {
    stats = await fetchStatsFallback(userId, workforceWorkspaceId);
    logPerfPhase('stats_query', Date.now() - statsStartedAt, { via: 'fallback' });
  }

  const planCtx = await loadUserPlan(userId);
  const limits = planCtx?.limits ?? getPlan('free').limits;
  const storageBytesUsed = await getStorageBytesUsed(userId, limits);

  return {
    ...stats,
    storageBytesUsed,
    storageBytesLimit: limits.storageBytes,
  };
}

function parseStatsRpcPayload(data: unknown): {
  total: number;
  byType: Record<string, number>;
  byCollection: Record<string, number>;
} | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  const total = Number(payload.total);
  if (!Number.isFinite(total)) return null;

  const byType =
    payload.by_type && typeof payload.by_type === 'object'
      ? (payload.by_type as Record<string, number>)
      : payload.byType && typeof payload.byType === 'object'
        ? (payload.byType as Record<string, number>)
        : {};

  const byCollection =
    payload.by_collection && typeof payload.by_collection === 'object'
      ? (payload.by_collection as Record<string, number>)
      : payload.byCollection && typeof payload.byCollection === 'object'
        ? (payload.byCollection as Record<string, number>)
        : {};

  return { total, byType, byCollection };
}

async function fetchStatsViaRpc(
  params: AccessibleStatsRpcParams
): Promise<{ total: number; byType: Record<string, number>; byCollection: Record<string, number> } | null> {
  const { data, error } = await supabase.rpc('get_accessible_memory_stats', params);
  if (error || data == null) return null;
  return parseStatsRpcPayload(data);
}

async function fetchStatsFallback(
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

export { hasScopedSearch };
