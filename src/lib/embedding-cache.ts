interface EmbeddingCacheEntry {
  embedding: number[];
  expiresAt: number;
  lastAccessedAt: number;
}

const DEFAULT_EMBED_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_EMBED_CACHE_MAX_ENTRIES = 1000;

const embedCache = new Map<string, EmbeddingCacheEntry>();

let cacheEnabledOverride: boolean | undefined;
let cacheTtlOverrideMs: number | undefined;
let cacheMaxEntriesOverride: number | undefined;

function getPositiveNumberEnv(
  value: string | undefined,
  fallback: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getCacheTtlMs(): number {
  if (cacheTtlOverrideMs !== undefined) return cacheTtlOverrideMs;
  return getPositiveNumberEnv(process.env.EMBED_CACHE_TTL_MS, DEFAULT_EMBED_CACHE_TTL_MS, 1000);
}

function getCacheMaxEntries(): number {
  if (cacheMaxEntriesOverride !== undefined) return cacheMaxEntriesOverride;
  return getPositiveNumberEnv(process.env.EMBED_CACHE_MAX_ENTRIES, DEFAULT_EMBED_CACHE_MAX_ENTRIES, 50);
}

export function isEmbeddingCacheEnabled(): boolean {
  if (cacheEnabledOverride !== undefined) return cacheEnabledOverride;
  return process.env.EMBED_CACHE_ENABLED !== 'false';
}

function evictExpired(now: number): void {
  for (const [key, entry] of embedCache.entries()) {
    if (entry.expiresAt <= now) embedCache.delete(key);
  }
}

function evictLeastRecentlyUsed(): void {
  let oldestKey: string | null = null;
  let oldestAt = Number.POSITIVE_INFINITY;
  for (const [key, entry] of embedCache.entries()) {
    if (entry.lastAccessedAt < oldestAt) {
      oldestAt = entry.lastAccessedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) embedCache.delete(oldestKey);
}

export function getCachedEmbedding(query: string): number[] | null {
  if (!isEmbeddingCacheEnabled()) return null;
  const normalized = normalizeQuery(query);
  if (!normalized) return null;

  const entry = embedCache.get(normalized);
  if (!entry) return null;
  const now = Date.now();
  if (entry.expiresAt <= now) {
    embedCache.delete(normalized);
    return null;
  }

  entry.lastAccessedAt = now;
  return [...entry.embedding];
}

export function setCachedEmbedding(query: string, embedding: number[]): void {
  if (!isEmbeddingCacheEnabled()) return;
  const normalized = normalizeQuery(query);
  if (!normalized || embedding.length === 0) return;

  const now = Date.now();
  evictExpired(now);
  const maxEntries = getCacheMaxEntries();
  while (embedCache.size >= maxEntries) {
    evictLeastRecentlyUsed();
  }

  embedCache.set(normalized, {
    embedding: [...embedding],
    expiresAt: now + getCacheTtlMs(),
    lastAccessedAt: now,
  });
}

function clearEmbeddingCache(): void {
  embedCache.clear();
}

export const _test = {
  clearEmbeddingCache,
  setCacheEnabledOverride: (value: boolean | undefined) => {
    cacheEnabledOverride = value;
  },
  setCacheTtlOverrideMs: (value: number | undefined) => {
    cacheTtlOverrideMs = value;
  },
  setCacheMaxEntriesOverride: (value: number | undefined) => {
    cacheMaxEntriesOverride = value;
  },
  getCacheSize: () => embedCache.size,
};
