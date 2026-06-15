import type { UserPlanContext } from './plan-enforcement.js';

interface PlanContextCacheEntry {
  ctx: UserPlanContext;
  expiresAt: number;
  lastAccessedAt: number;
}

const DEFAULT_PLAN_CACHE_TTL_MS = 45_000;
const DEFAULT_PLAN_CACHE_MAX_ENTRIES = 2000;

const planContextCache = new Map<string, PlanContextCacheEntry>();

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

function getCacheTtlMs(): number {
  if (cacheTtlOverrideMs !== undefined) return cacheTtlOverrideMs;
  return getPositiveNumberEnv(process.env.PLAN_CACHE_TTL_MS, DEFAULT_PLAN_CACHE_TTL_MS, 1000);
}

function getCacheMaxEntries(): number {
  if (cacheMaxEntriesOverride !== undefined) return cacheMaxEntriesOverride;
  return getPositiveNumberEnv(process.env.PLAN_CACHE_MAX_ENTRIES, DEFAULT_PLAN_CACHE_MAX_ENTRIES, 50);
}

export function isPlanContextCacheEnabled(): boolean {
  if (cacheEnabledOverride !== undefined) return cacheEnabledOverride;
  return process.env.PLAN_CACHE_ENABLED !== 'false';
}

function evictExpired(now: number): void {
  for (const [key, entry] of planContextCache.entries()) {
    if (entry.expiresAt <= now) planContextCache.delete(key);
  }
}

function evictLeastRecentlyUsed(): void {
  let oldestKey: string | null = null;
  let oldestAt = Number.POSITIVE_INFINITY;
  for (const [key, entry] of planContextCache.entries()) {
    if (entry.lastAccessedAt < oldestAt) {
      oldestAt = entry.lastAccessedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) planContextCache.delete(oldestKey);
}

export function getCachedPlanContext(userId: string): UserPlanContext | null {
  if (!isPlanContextCacheEnabled()) return null;
  const entry = planContextCache.get(userId);
  if (!entry) return null;

  const now = Date.now();
  if (entry.expiresAt <= now) {
    planContextCache.delete(userId);
    return null;
  }

  entry.lastAccessedAt = now;
  return {
    ...entry.ctx,
    plan: entry.ctx.plan,
    limits: entry.ctx.limits,
    planWarnings: entry.ctx.planWarnings
      ? { ...entry.ctx.planWarnings, warnings: [...entry.ctx.planWarnings.warnings] }
      : undefined,
  };
}

export function setCachedPlanContext(userId: string, ctx: UserPlanContext): void {
  if (!isPlanContextCacheEnabled()) return;

  const now = Date.now();
  evictExpired(now);
  const maxEntries = getCacheMaxEntries();
  while (planContextCache.size >= maxEntries) {
    evictLeastRecentlyUsed();
  }

  planContextCache.set(userId, {
    ctx: {
      ...ctx,
      plan: ctx.plan,
      limits: ctx.limits,
      planWarnings: ctx.planWarnings
        ? { ...ctx.planWarnings, warnings: [...ctx.planWarnings.warnings] }
        : undefined,
    },
    expiresAt: now + getCacheTtlMs(),
    lastAccessedAt: now,
  });
}

export function invalidatePlanContextCache(userId: string): void {
  planContextCache.delete(userId);
}

function clearPlanContextCache(): void {
  planContextCache.clear();
}

export const _test = {
  clearPlanContextCache,
  setCacheEnabledOverride: (value: boolean | undefined) => {
    cacheEnabledOverride = value;
  },
  setCacheTtlOverrideMs: (value: number | undefined) => {
    cacheTtlOverrideMs = value;
  },
  setCacheMaxEntriesOverride: (value: number | undefined) => {
    cacheMaxEntriesOverride = value;
  },
  getCacheSize: () => planContextCache.size,
};
