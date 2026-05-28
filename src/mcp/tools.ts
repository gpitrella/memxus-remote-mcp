import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';
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

export type TenantFilter = {
  userId: string;
  workforceWorkspaceId?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyTenantToQuery(query: any, tenant: TenantFilter): any {
  if (tenant.workforceWorkspaceId) {
    return query
      .eq('scope', 'workforce')
      .eq('workforce_workspace_id', tenant.workforceWorkspaceId);
  }
  return query.eq('user_id', tenant.userId).eq('scope', 'personal');
}

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

  const memoryScope = p.workforceWorkspaceId ? 'workforce' : 'personal';

  const { data, error } = await supabase
    .from('memories')
    .insert({
      user_id: p.userId,
      content: p.content,
      memory_type: p.type ?? 'general',
      tags,
      collection,
      thread_id: p.thread_id ?? null,
      importance: p.importance ?? 0.5,
      metadata: p.metadata ?? {},
      scope: memoryScope,
      workforce_workspace_id: p.workforceWorkspaceId ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`saveMemory: ${error.message}`);
  return data as MemoryRow;
}

export async function appendToMemory(p: {
  userId: string;
  workforceWorkspaceId?: string;
  memoryId: string;
  newContent: string;
}): Promise<MemoryRow> {
  let fetchQ = supabase.from('memories').select('*').eq('id', p.memoryId);
  fetchQ = applyTenantToQuery(fetchQ, {
    userId: p.userId,
    workforceWorkspaceId: p.workforceWorkspaceId,
  });
  const { data: existing, error: fetchError } = await fetchQ.single();

  if (fetchError || !existing) throw new Error('Memory not found');

  const merged = `${existing.content}${APPEND_SEPARATOR}${p.newContent.trim()}`;
  if (merged.length > MAX_MEMORY_CONTENT_LENGTH) {
    throw new Error(
      `Merged content exceeds ${MAX_MEMORY_CONTENT_LENGTH} chars. Create a new memory in the same collection instead.`
    );
  }

  const metadata = (existing.metadata as Record<string, unknown>) || {};
  const revisions = Array.isArray(metadata.revisions)
    ? [...(metadata.revisions as RevisionEntry[])]
    : [];
  revisions.push({ content: existing.content, appended_at: new Date().toISOString() });

  const updates: Record<string, unknown> = {
    content: merged,
    metadata: { ...metadata, revisions },
    updated_at: new Date().toISOString(),
  };

  const embedding = await generateEmbedding(merged);
  if (embedding) updates.embedding = embedding;

  let updateQ = supabase.from('memories').update(updates).eq('id', p.memoryId);
  updateQ = applyTenantToQuery(updateQ, {
    userId: p.userId,
    workforceWorkspaceId: p.workforceWorkspaceId,
  });
  const { data, error } = await updateQ.select().single();

  if (error) throw new Error(`appendToMemory: ${error.message}`);
  return data as MemoryRow;
}

export async function searchMemories(p: {
  userId: string;
  workforceWorkspaceId?: string;
  query: string;
  limit?: number;
  type?: string;
  collection?: string | null;
  tags?: string[];
}): Promise<MemoryRow[]> {
  const limit = p.limit ?? 5;
  const scope: MemoryScopeFilters = {
    collection: normalizeCollectionSlug(p.collection ?? undefined) ?? undefined,
    tags: p.tags?.length ? normalizeTags(p.tags) : undefined,
    type: p.type,
  };

  const embedding = await generateEmbedding(p.query);
  if (embedding) {
    const rpcParams = buildVectorRpcParams(p.userId, embedding, limit, 0.6, scope);
    const { data, error } = await supabase.rpc('search_memories_vector', rpcParams);
    if (!error && data?.length) return data as MemoryRow[];
  }

  let q = applyTenantToQuery(supabase.from('memories').select('*'), {
    userId: p.userId,
    workforceWorkspaceId: p.workforceWorkspaceId,
  }).ilike('content', `%${p.query}%`)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  q = applyScopeToQuery(q, scope);

  const { data, error } = await q;
  if (error) throw new Error(`searchMemories: ${error.message}`);
  return (data ?? []) as MemoryRow[];
}

export async function listMemories(p: {
  userId: string;
  workforceWorkspaceId?: string;
  limit?: number;
  type?: string;
  collection?: string | null;
  tags?: string[];
}): Promise<MemoryRow[]> {
  const scope: MemoryScopeFilters = {
    collection: normalizeCollectionSlug(p.collection ?? undefined) ?? undefined,
    tags: p.tags?.length ? normalizeTags(p.tags) : undefined,
    type: p.type,
  };

  let q = applyTenantToQuery(supabase.from('memories').select('*'), {
    userId: p.userId,
    workforceWorkspaceId: p.workforceWorkspaceId,
  })
    .order('created_at', { ascending: false })
    .limit(p.limit ?? 10);

  q = applyScopeToQuery(q, scope);

  const { data, error } = await q;
  if (error) throw new Error(`listMemories: ${error.message}`);
  return (data ?? []) as MemoryRow[];
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
  let q = supabase.from('memories').delete().eq('id', p.memoryId);
  q = applyTenantToQuery(q, {
    userId: p.userId,
    workforceWorkspaceId: p.workforceWorkspaceId,
  });
  const { error } = await q;
  if (error) throw new Error(`deleteMemory: ${error.message}`);
}

export async function getStats(
  userId: string,
  workforceWorkspaceId?: string
): Promise<{ total: number; byType: Record<string, number>; byCollection: Record<string, number> }> {
  const q = applyTenantToQuery(supabase.from('memories').select('memory_type, collection'), {
    userId,
    workforceWorkspaceId,
  });
  const { data, error } = await q;
  if (error) throw new Error(`getStats: ${error.message}`);
  const rows = data ?? [];
  const byType: Record<string, number> = {};
  const byCollection: Record<string, number> = {};
  for (const row of rows) {
    byType[row.memory_type] = (byType[row.memory_type] ?? 0) + 1;
    const coll = row.collection || '(uncategorized)';
    byCollection[coll] = (byCollection[coll] ?? 0) + 1;
  }
  return { total: rows.length, byType, byCollection };
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
