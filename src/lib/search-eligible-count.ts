import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyActiveMemoryFilter,
  applyMemoryListFilter,
  buildAccessibleVectorRpcParams,
  type MemoryScopeValue,
  type VisibilityFilter,
} from './memory-access.js';
import { filterRowsByTextContent, type MemoryRowMinimal } from './memory-crypto.js';
import { shouldSkipContentIlike } from './memory-persistence.js';
import { resolveMinSimilarity, applyTextSearchOr } from './memory-search.js';
import { applyScopeToQuery, type MemoryScopeFilters } from './memory-scope.js';

export type EligibleCountParams = {
  supabase: SupabaseClient;
  userId: string;
  workforceWorkspaceId?: string;
  query: string;
  embedding: number[] | null;
  scope: MemoryScopeFilters;
  visibility?: VisibilityFilter;
  memoryScope?: MemoryScopeValue;
  groupId?: string;
  minSimilarity?: number;
};

/** Count memories eligible for ranking (post-threshold, pre-LIMIT). */
export async function countEligibleMemories(p: EligibleCountParams): Promise<number> {
  const memoryScope: MemoryScopeValue =
    p.visibility === 'private' ? 'personal' : p.visibility === 'shared' ? 'group' : 'all';
  const threshold = resolveMinSimilarity(p.scope, p.minSimilarity);

  if (p.embedding) {
    const rpcParams = await buildAccessibleVectorRpcParams(
      p.userId,
      p.embedding,
      1,
      threshold,
      p.scope,
      {
        workforceWorkspaceId: p.workforceWorkspaceId,
        visibility: p.visibility ?? 'all',
        memoryScope,
        groupId: p.groupId,
      },
    );
    const countParams = {
      p_user_id: rpcParams.p_user_id,
      query_embedding: rpcParams.query_embedding,
      match_threshold: rpcParams.match_threshold,
      p_group_ids: rpcParams.p_group_ids,
      p_workforce_workspace_ids: rpcParams.p_workforce_workspace_ids,
      p_include_personal: rpcParams.p_include_personal,
      p_collection: rpcParams.p_collection,
      p_memory_type: rpcParams.p_memory_type,
      p_tags: rpcParams.p_tags,
    };
    const { data, error } = await p.supabase.rpc('count_memories_accessible', countParams);
    if (!error && typeof data === 'number') return data;
  }

  const q = p.supabase.from('memories').select('id, content');
  const accessResult = await applyMemoryListFilter(q, {
    userId: p.userId,
    workforceWorkspaceId: p.workforceWorkspaceId,
    memoryScope,
    visibility: p.visibility ?? 'all',
    groupId: p.groupId,
  });
  if (accessResult.error) return 0;

  let filtered = applyActiveMemoryFilter(accessResult.query);
  filtered = applyScopeToQuery(filtered, p.scope);
  filtered = applyTextSearchOr(filtered, p.query, { skipContentIlike: shouldSkipContentIlike() });

  const { data, error } = await filtered;
  if (error || !data) return 0;

  let rows = data as Array<{ id: string; content?: string }>;
  if (shouldSkipContentIlike() && p.query.trim()) {
    rows = filterRowsByTextContent(rows as MemoryRowMinimal[], p.query) as typeof rows;
  }
  return rows.length;
}
