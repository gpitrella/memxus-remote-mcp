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

export function applyScopeToQuery<T extends { eq: Function; contains: Function }>(
  query: T,
  filters: MemoryScopeFilters
): T {
  let q = query;
  if (filters.collection) q = q.eq('collection', filters.collection) as T;
  if (filters.type) q = q.eq('memory_type', filters.type) as T;
  if (filters.tags?.length) q = q.contains('tags', filters.tags) as T;
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
