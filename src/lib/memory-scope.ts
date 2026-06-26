export interface MemoryScopeFilters {
  collection?: string | null;
  tags?: string[];
  type?: string;
}

const COLLECTION_SLUG_RE = /^[a-z0-9][a-z0-9:_-]{0,127}$/;

export function normalizeCollectionSlug(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const slug = raw.trim().toLowerCase().replace(/\s+/g, '-');
  if (!slug || !COLLECTION_SLUG_RE.test(slug)) return null;
  return slug;
}

export function collectionFromTags(tags: string[]): string | null {
  const projectTag = tags.find((t) => /^project:[a-z0-9:_-]+$/i.test(t.trim()));
  if (projectTag) return normalizeCollectionSlug(projectTag.trim().toLowerCase());
  return null;
}

export function resolveCollection(input: {
  collection?: string | null;
  tags?: string[];
  memory_type?: string;
}): string | null {
  const explicit = normalizeCollectionSlug(input.collection ?? undefined);
  if (explicit) return explicit;
  const fromTags = collectionFromTags(input.tags ?? []);
  if (fromTags) return fromTags;
  if (input.memory_type === 'preference') return 'personal:preferences';
  return null;
}

export function hasScopedSearch(filters: MemoryScopeFilters): boolean {
  return Boolean(
    filters.collection ||
      (filters.tags && filters.tags.length > 0) ||
      filters.type
  );
}

export function normalizeTags(tags: unknown, max = 20): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Minimal Supabase filter builder shape for memories table queries. */
export interface ScopedQueryBuilder {
  eq(column: string, value: string): ScopedQueryBuilder;
  contains(column: string, value: string[]): ScopedQueryBuilder;
}

/** Apply scope filters to a Supabase query builder (memories table). */
export function applyScopeToQuery<T extends ScopedQueryBuilder>(
  query: T,
  filters: MemoryScopeFilters
): T {
  let q = query;
  if (filters.collection) {
    q = q.eq('collection', filters.collection) as T;
  }
  if (filters.type) {
    q = q.eq('memory_type', filters.type) as T;
  }
  if (filters.tags && filters.tags.length > 0) {
    q = q.contains('tags', filters.tags) as T;
  }
  return q;
}

export function buildVectorRpcParams(
  userId: string,
  embedding: number[],
  limit: number,
  threshold: number,
  filters: MemoryScopeFilters
) {
  return {
    p_user_id: userId,
    query_embedding: embedding,
    match_count: limit,
    match_threshold: threshold,
    p_collection: filters.collection ?? null,
    p_memory_type: filters.type ?? null,
    p_tags: filters.tags?.length ? filters.tags : null,
  };
}

export const MAX_MEMORY_CONTENT_LENGTH = 8000;
export const APPEND_SEPARATOR = '\n---\n';

export type CollectionListItem = {
  slug: string;
  name: string;
  description: string | null;
};

function capitalizeSegment(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Human-readable default name for a collection slug (dashboard may override). */
export function deriveCollectionName(slug: string): string {
  const parts = slug.split(':').filter(Boolean);
  if (parts.length >= 2) {
    const prefix = capitalizeSegment(parts[0]);
    const rest = parts.slice(1).map(capitalizeSegment).join(' ');
    return `${prefix}: ${rest}`;
  }
  return capitalizeSegment(slug);
}

const COLLECTION_HINT_MIN_SCORE = 0.35;

function tokenizeCollectionHint(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s:._-]/gu, ' ')
    .split(/[\s:._-]+/)
    .filter((t) => t.length >= 2);
}

/** Score how well a collection hint matches a slug/name (0–1). */
export function scoreCollectionMatch(hint: string, item: CollectionListItem): number {
  const raw = hint.trim().toLowerCase();
  if (!raw) return 0;

  const exact = normalizeCollectionSlug(hint);
  if (exact && exact === item.slug) return 1;

  const hyphenated = raw.replace(/\s+/g, '-');
  if (item.slug === hyphenated) return 0.95;
  if (item.slug.includes(hyphenated) || hyphenated.includes(item.slug)) return 0.85;
  if (item.slug.includes(raw) || raw.includes(item.slug)) return 0.8;

  const nameLower = item.name.toLowerCase();
  if (nameLower.includes(raw) || raw.includes(nameLower)) return 0.75;

  const hintTokens = tokenizeCollectionHint(raw);
  if (hintTokens.length === 0) return 0;

  const targetTokens = new Set([
    ...tokenizeCollectionHint(item.slug.replace(':', ' ')),
    ...tokenizeCollectionHint(item.name),
  ]);

  let overlap = 0;
  for (const token of hintTokens) {
    if (targetTokens.has(token)) {
      overlap += 1;
      continue;
    }
    for (const target of targetTokens) {
      if (target.includes(token) || token.includes(target)) {
        overlap += 0.5;
        break;
      }
    }
  }

  const ratio = overlap / hintTokens.length;
  return ratio >= 0.5 ? 0.5 + ratio * 0.3 : ratio * 0.45;
}

/** Pick the best matching collection slug for a partial or approximate hint. */
export function resolveCollectionHint(
  hint: string | null | undefined,
  collections: CollectionListItem[]
): string | null {
  if (!hint?.trim() || collections.length === 0) return null;

  const exact = normalizeCollectionSlug(hint);
  if (exact && collections.some((c) => c.slug === exact)) return exact;

  let best: { slug: string; score: number } | null = null;
  for (const item of collections) {
    const score = scoreCollectionMatch(hint, item);
    if (score >= COLLECTION_HINT_MIN_SCORE && (!best || score > best.score)) {
      best = { slug: item.slug, score };
    }
  }
  return best?.slug ?? null;
}

/** Resolve collection from raw hint: exact slug first, then fuzzy match. */
export function resolveScopeCollection(
  raw: string | null | undefined,
  collections: CollectionListItem[]
): string | undefined {
  if (!raw?.trim()) return undefined;

  const exact = normalizeCollectionSlug(raw);
  if (exact && collections.some((c) => c.slug === exact)) return exact;

  const hinted = resolveCollectionHint(raw, collections);
  if (hinted) return hinted;

  if (exact) return exact;

  return undefined;
}

/** Ordered scope attempts: fuzzy collection, exact scope, then optional unscoped retry. */
export function buildSearchScopeAttempts(
  baseScope: MemoryScopeFilters,
  rawCollection: string | null | undefined,
  collections: CollectionListItem[],
  options?: { strictScope?: boolean }
): MemoryScopeFilters[] {
  const attempts: MemoryScopeFilters[] = [];
  const seen = new Set<string>();

  const push = (scope: MemoryScopeFilters) => {
    const key = `${scope.collection ?? ''}|${scope.type ?? ''}|${(scope.tags ?? []).join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push(scope);
  };

  const hint = rawCollection?.trim();
  if (hint) {
    const resolved = resolveScopeCollection(hint, collections);
    if (resolved) push({ ...baseScope, collection: resolved });
  }

  if (baseScope.collection) {
    push(baseScope);
  }

  if (!hint && !baseScope.collection) {
    push(baseScope);
  }

  if ((hint || baseScope.collection) && !options?.strictScope) {
    push({ ...baseScope, collection: undefined });
  }

  return attempts.length > 0 ? attempts : [baseScope];
}

/** True when search should not fall back to unscoped results (project collections). */
export function shouldUseStrictProjectScope(
  rawCollection: string | null | undefined,
  baseScope: MemoryScopeFilters
): boolean {
  const fromBase = normalizeCollectionSlug(baseScope.collection ?? undefined);
  const fromRaw = normalizeCollectionSlug(rawCollection ?? undefined);
  const slug = fromBase ?? fromRaw;
  return Boolean(slug?.startsWith('project:'));
}

export function mergeCollectionLists(
  registered: CollectionListItem[],
  memorySlugs: Iterable<string>
): CollectionListItem[] {
  const bySlug = new Map<string, CollectionListItem>();
  for (const row of registered) {
    bySlug.set(row.slug, row);
  }
  for (const slug of memorySlugs) {
    if (!bySlug.has(slug)) {
      bySlug.set(slug, {
        slug,
        name: deriveCollectionName(slug),
        description: null,
      });
    }
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface MemoryCollectionsUpsertClient {
  from(table: 'memory_collections'): {
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean }
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

/** Register collection folder on first memory save; never overwrite existing rows. */
export async function ensureMemoryCollectionRegistered(
  client: MemoryCollectionsUpsertClient,
  p: { userId: string; slug: string | null; defaultMemoryType: string }
): Promise<void> {
  if (!p.slug) return;

  const { error } = await client.from('memory_collections').upsert(
    {
      user_id: p.userId,
      slug: p.slug,
      name: deriveCollectionName(p.slug),
      description: null,
      default_memory_type: p.defaultMemoryType,
    },
    { onConflict: 'user_id,slug', ignoreDuplicates: true }
  );

  if (error) {
    console.warn(
      `[memory_collections] ensure registered failed for ${p.slug}:`,
      error.message
    );
  }
}
