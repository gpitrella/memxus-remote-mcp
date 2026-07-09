import { supabase } from '../lib/supabase.js';
import { getPlan, type PlanDefinition } from '../lib/plans.js';
import {
  DEFAULT_SEARCH_RESULTS,
  resolveListLimit,
  resolveSearchLimit,
  loadUserPlan,
  assertWriteStorageAllowed,
} from '../lib/plan-enforcement.js';
import {
  estimateMemoryPayloadBytes,
  getStorageBytesUsed,
} from '../lib/storage-bytes.js';
import { enrichRowsWithGroupNames } from '../lib/memory-public.js';
import {
  applyMemoryListFilter,
  applyActiveMemoryFilter,
  buildAccessibleStatsRpcParams,
  buildAccessibleVectorRpcParams,
  canDeleteMemory,
  fetchGroupNameMap,
  getMemoryForAccess,
  resolveGroupIdFromName,
  resolveMemoryWriteTarget,
  type AccessibleStatsRpcParams,
  type MemoryRow as AccessMemoryRow,
  type MemoryQueryBuilder,
  type MemoryScopeValue,
  type VisibilityFilter,
} from '../lib/memory-access.js';
import { assertWorkspaceReadsAllowed } from '../lib/workforce-billing-state.js';
import {
  assertWorkforceMemoryCreate,
  assertWorkforceMemoryMutation,
} from '../lib/workforce-memory-gate.js';
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
import { fetchCollectionsDecrypted } from '../lib/collection-persistence.js';
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
import { countEligibleMemories } from '../lib/search-eligible-count.js';
import { resolveSearchTotal } from '../lib/search-total.js';
import type { MemoryRow } from './memory-types.js';

export type SearchMemoriesResult = {
  memories: MemoryRow[];
  total: number;
};

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

  await ensureMemoryCollectionRegistered({
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

  if (memoryScope === 'workforce' && writeTarget.workforceWorkspaceId) {
    const readBilling = await assertWorkspaceReadsAllowed(writeTarget.workforceWorkspaceId);
    if (!readBilling.ok) {
      throw new Error(readBilling.message);
    }
    const createGate = await assertWorkforceMemoryCreate(
      p.userId,
      writeTarget.workforceWorkspaceId,
      p.workforceWorkspaceId
    );
    if (!createGate.ok) {
      throw new Error(createGate.message);
    }
  }

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
  exclude_memory_ids?: string[];
}): Promise<SearchMemoriesResult> {
  if (p.workforceWorkspaceId) {
    const readBilling = await assertWorkspaceReadsAllowed(p.workforceWorkspaceId);
    if (!readBilling.ok) {
      throw new Error(readBilling.message);
    }
  }

  const searchStartedAt = Date.now();
  const planLimits = resolveLimits(p.planLimits);
  const limit = resolveSearchLimit(planLimits, p.limit);
  const baseScope: MemoryScopeFilters = {
    collection: normalizeCollectionSlug(p.collection ?? undefined) ?? undefined,
    tags: p.tags?.length ? normalizeTags(p.tags) : undefined,
    type: p.type,
  };
  const rawCollection = p.collection ?? null;
  const shouldResolveCollectionHints = Boolean(rawCollection?.trim());
  const collectionsPromise = shouldResolveCollectionHints
    ? listCollections(p.userId, p.workforceWorkspaceId).catch(
        () => [] as Awaited<ReturnType<typeof listCollections>>
      )
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
  const excludeSet = p.exclude_memory_ids?.length
    ? new Set(p.exclude_memory_ids.map(String))
    : null;
  const excludeSize = excludeSet?.size ?? 0;
  const needed = excludeSize > 0 ? limit + excludeSize : limit;
  const fetchLimit = resolveSearchLimit(
    planLimits,
    Math.max(needed, DEFAULT_SEARCH_RESULTS),
  );

  const searchDbStartedAt = Date.now();
  const { results, winningScope } = await searchMemoriesWithScopeRetry<Record<string, unknown>>({
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
        fetchLimit,
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
        if (p.workforceWorkspaceId) {
          return [];
        }
        const legacyParams = buildVectorRpcParams(p.userId, queryEmbedding, fetchLimit, threshold, scope);
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
      q = applyActiveMemoryFilter(accessResult.query)
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(fetchLimit);

      q = applyScopeToQuery(q, scope);
      q = applyTextSearchOr(q, p.query, { skipContentIlike: shouldSkipContentIlike() });

      const { data, error } = await q;
      if (error) throw new Error(`searchMemories: ${error.message}`);
      return (data ?? []) as Record<string, unknown>[];
    },
  });
  logPerfPhase('search_db', Date.now() - searchDbStartedAt, {
    resultCount: results.length,
    fetchLimit,
    excludeSize,
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
  if (excludeSet) {
    filtered = filtered.filter((row) => !excludeSet.has(String(row.id)));
  }
  if (shouldSkipContentIlike() && p.query.trim()) {
    const postFilterStartedAt = Date.now();
    filtered = filterRowsByTextContent(
      filtered as unknown as MemoryRowMinimal[],
      p.query
    ) as unknown as Record<string, unknown>[];
    logPerfPhase('search_post_filter', Date.now() - postFilterStartedAt, {
      filteredCount: filtered.length,
    });
  }

  const candidateFloor = filtered.length;
  filtered = filtered.slice(0, limit);

  const enrichStartedAt = Date.now();
  const enriched = await enrichRowsWithGroupNames(filtered, fetchGroupNameMap);
  logPerfPhase('search_enrich', Date.now() - enrichStartedAt, {
    enrichedCount: enriched.length,
  });
  logPerfPhase('search_total', Date.now() - searchStartedAt, {
    finalCount: enriched.length,
    visibility: p.visibility ?? 'all',
  });

  const countScope = winningScope ?? baseScope;
  const countResult = await countEligibleMemories({
    supabase,
    userId: p.userId,
    workforceWorkspaceId: p.workforceWorkspaceId,
    query: p.query,
    embedding,
    scope: countScope,
    visibility: p.visibility ?? 'all',
    memoryScope,
    groupId: p.group_id,
    minSimilarity: p.min_similarity,
    hadVectorHits: results.length > 0,
  });
  const total = resolveSearchTotal(countResult, enriched.length, { candidateFloor });

  return { memories: enriched as unknown as MemoryRow[], total };
}

export async function getMemoryById(p: {
  userId: string;
  workforceWorkspaceId?: string;
  memoryId: string;
}): Promise<MemoryRow> {
  const access = await getMemoryForAccess(p.memoryId, {
    userId: p.userId,
    workforceWorkspaceId: p.workforceWorkspaceId,
  });
  if (!access.ok) throw new Error('Memory not found');

  const dec = await decryptMemoryRow(access.memory as unknown as MemoryRowMinimal, p.userId);
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
  group_name?: string;
}): Promise<MemoryRow[]> {
  const listLimit = resolveListLimit(resolveLimits(p.planLimits), p.limit);
  const scope: MemoryScopeFilters = {
    collection: normalizeCollectionSlug(p.collection ?? undefined) ?? undefined,
    tags: p.tags?.length ? normalizeTags(p.tags) : undefined,
    type: p.type,
  };
  const memoryScope: MemoryScopeValue =
    p.visibility === 'private' ? 'personal' : p.visibility === 'shared' ? 'group' : 'all';

  let groupId = p.group_id;
  if (!groupId && p.group_name?.trim()) {
    const resolved = await resolveGroupIdFromName(p.userId, p.group_name);
    if ('error' in resolved) throw new Error(resolved.error);
    groupId = resolved.groupId;
  }

  let q: MemoryQueryBuilder = supabase.from('memories').select('*');
  const accessResult = await applyMemoryListFilter(q, {
    userId: p.userId,
    workforceWorkspaceId: p.workforceWorkspaceId,
    memoryScope,
    visibility: p.visibility ?? 'all',
    groupId,
  });
  if (accessResult.error) return [];
  q = applyActiveMemoryFilter(accessResult.query).order('created_at', { ascending: false }).limit(listLimit);

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

export async function listCollections(
  userId: string,
  workforceWorkspaceId?: string
): Promise<
  Array<{ slug: string; name: string; description: string | null }>
> {
  let memQuery = supabase.from('memories').select('collection').not('collection', 'is', null);
  if (workforceWorkspaceId) {
    memQuery = memQuery
      .eq('scope', 'workforce')
      .eq('workforce_workspace_id', workforceWorkspaceId);
  } else {
    memQuery = memQuery.eq('user_id', userId);
  }

  const { data: memories, error: memError } = await memQuery;
  if (memError) throw new Error(`listCollections: ${memError.message}`);

  const slugs = new Set<string>();
  for (const row of memories ?? []) {
    if (row.collection) slugs.add(row.collection);
  }

  const registered = await fetchCollectionsDecrypted(userId);

  const filteredRegistered =
    workforceWorkspaceId && slugs.size > 0
      ? registered.filter((r) => slugs.has(r.slug))
      : workforceWorkspaceId
        ? []
        : registered;

  return mergeCollectionLists(
    filteredRegistered.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description as string | null,
    })),
    slugs
  );
}

export async function getTopCollectionsByUsage(
  userId: string,
  limit = 5,
  workforceWorkspaceId?: string
): Promise<Array<{ slug: string; name: string; description: string | null; memoryCount: number }>> {
  const [stats, collections] = await Promise.all([
    getStats(userId, workforceWorkspaceId),
    listCollections(userId, workforceWorkspaceId),
  ]);
  const metaBySlug = new Map(collections.map((row) => [row.slug, row]));

  return Object.entries(stats.byCollection)
    .filter(([slug]) => slug && slug !== '(uncategorized)')
    .map(([slug, memoryCount]) => {
      const meta = metaBySlug.get(slug);
      return {
        slug,
        name: meta?.name ?? slug,
        description: meta?.description ?? null,
        memoryCount,
      };
    })
    .sort((a, b) => b.memoryCount - a.memoryCount || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export async function getAllCollectionsByUsage(
  userId: string,
  workforceWorkspaceId?: string
): Promise<Array<{ slug: string; name: string; description: string | null; memoryCount: number }>> {
  const [stats, collections] = await Promise.all([
    getStats(userId, workforceWorkspaceId),
    listCollections(userId, workforceWorkspaceId),
  ]);
  const metaBySlug = new Map(collections.map((row) => [row.slug, row]));
  const counts = new Map<string, number>();

  for (const [slug, count] of Object.entries(stats.byCollection)) {
    if (!slug || slug === '(uncategorized)') continue;
    counts.set(slug, count);
  }
  for (const row of collections) {
    if (!counts.has(row.slug)) counts.set(row.slug, 0);
  }

  return [...counts.entries()]
    .map(([slug, memoryCount]) => {
      const meta = metaBySlug.get(slug);
      return {
        slug,
        name: meta?.name ?? slug,
        description: meta?.description ?? null,
        memoryCount,
      };
    })
    .sort((a, b) => b.memoryCount - a.memoryCount || a.name.localeCompare(b.name));
}

export async function deleteMemory(p: {
  userId: string;
  workforceWorkspaceId?: string;
  memoryId: string;
}): Promise<void> {
  const access = await getMemoryForAccess(p.memoryId, {
    userId: p.userId,
    workforceWorkspaceId: p.workforceWorkspaceId,
  });
  if (!access.ok) throw new Error('Memory not found');

  const existing = access.memory;
  const wfGate = await assertWorkforceMemoryMutation(
    p.userId,
    existing,
    'delete',
    { workforceWorkspaceId: p.workforceWorkspaceId }
  );
  if (!wfGate.ok) throw new Error(wfGate.message);

  const canDelete = await canDeleteMemory(
    p.userId,
    existing as AccessMemoryRow,
    p.workforceWorkspaceId
  );
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
    ? applyActiveMemoryFilter(countQ.eq('user_id', userId).eq('scope', 'personal'))
    : applyActiveMemoryFilter(countAccess.query);
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
    ? applyActiveMemoryFilter(rowsQ.eq('user_id', userId).eq('scope', 'personal'))
    : applyActiveMemoryFilter(rowsAccess.query);
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
