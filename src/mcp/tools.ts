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
    })
    .select()
    .single();
  if (error) throw new Error(`saveMemory: ${error.message}`);
  return data as MemoryRow;
}

export async function appendToMemory(p: {
  userId: string;
  memoryId: string;
  newContent: string;
}): Promise<MemoryRow> {
  const { data: existing, error: fetchError } = await supabase
    .from('memories')
    .select('*')
    .eq('id', p.memoryId)
    .eq('user_id', p.userId)
    .single();

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

  const { data, error } = await supabase
    .from('memories')
    .update(updates)
    .eq('id', p.memoryId)
    .eq('user_id', p.userId)
    .select()
    .single();

  if (error) throw new Error(`appendToMemory: ${error.message}`);
  return data as MemoryRow;
}

export async function searchMemories(p: {
  userId: string;
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

  let q = supabase
    .from('memories')
    .select('*')
    .eq('user_id', p.userId)
    .ilike('content', `%${p.query}%`)
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

  let q = supabase
    .from('memories')
    .select('*')
    .eq('user_id', p.userId)
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

export async function deleteMemory(p: { userId: string; memoryId: string }): Promise<void> {
  const { error } = await supabase
    .from('memories')
    .delete()
    .eq('id', p.memoryId)
    .eq('user_id', p.userId);
  if (error) throw new Error(`deleteMemory: ${error.message}`);
}

export async function getStats(
  userId: string
): Promise<{ total: number; byType: Record<string, number>; byCollection: Record<string, number> }> {
  const { data, error } = await supabase
    .from('memories')
    .select('memory_type, collection')
    .eq('user_id', userId);
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
