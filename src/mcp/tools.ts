import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';

export interface MemoryRow {
  id: string;
  user_id: string;
  content: string;
  memory_type: 'general' | 'preference' | 'fact' | 'instruction' | 'conversation';
  importance: number;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  similarity?: number;
}

export async function saveMemory(p: {
  userId: string;
  content: string;
  type?: MemoryRow['memory_type'];
  tags?: string[];
  importance?: number;
  metadata?: Record<string, unknown>;
}): Promise<MemoryRow> {
  const { data, error } = await supabase
    .from('memories')
    .insert({
      user_id: p.userId,
      content: p.content,
      memory_type: p.type ?? 'general',
      tags: p.tags ?? [],
      importance: p.importance ?? 0.5,
      metadata: p.metadata ?? {},
    })
    .select()
    .single();
  if (error) throw new Error(`saveMemory: ${error.message}`);
  return data as MemoryRow;
}

export async function searchMemories(p: {
  userId: string;
  query: string;
  limit?: number;
  type?: string;
}): Promise<MemoryRow[]> {
  const limit = p.limit ?? 5;

  const embedding = await generateEmbedding(p.query);
  if (embedding) {
    const { data, error } = await supabase.rpc('search_memories_vector', {
      p_user_id: p.userId,
      query_embedding: embedding,
      match_count: limit,
      match_threshold: 0.6,
    });
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
  if (p.type) q = q.eq('memory_type', p.type);

  const { data, error } = await q;
  if (error) throw new Error(`searchMemories: ${error.message}`);
  return (data ?? []) as MemoryRow[];
}

export async function listMemories(p: {
  userId: string;
  limit?: number;
  type?: string;
}): Promise<MemoryRow[]> {
  let q = supabase
    .from('memories')
    .select('*')
    .eq('user_id', p.userId)
    .order('created_at', { ascending: false })
    .limit(p.limit ?? 10);
  if (p.type) q = q.eq('memory_type', p.type);

  const { data, error } = await q;
  if (error) throw new Error(`listMemories: ${error.message}`);
  return (data ?? []) as MemoryRow[];
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
): Promise<{ total: number; byType: Record<string, number> }> {
  const { data, error } = await supabase
    .from('memories')
    .select('memory_type')
    .eq('user_id', userId);
  if (error) throw new Error(`getStats: ${error.message}`);
  const rows = data ?? [];
  const byType: Record<string, number> = {};
  for (const row of rows) byType[row.memory_type] = (byType[row.memory_type] ?? 0) + 1;
  return { total: rows.length, byType };
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
