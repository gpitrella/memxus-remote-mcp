import type { UserMcpPreferences } from './mcp-preferences.js';
import { getUserMcpPreferences } from './mcp-preferences.js';

interface PrefsCacheEntry {
  prefs: UserMcpPreferences;
  expiresAt: number;
}

const cache = new Map<string, PrefsCacheEntry>();

const DEFAULT_TTL_MS = 60_000;

function getTtlMs(): number {
  const raw = process.env.MCP_PREFS_CACHE_TTL_MS;
  if (!raw) return DEFAULT_TTL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : DEFAULT_TTL_MS;
}

export function invalidateUserMcpPreferencesCache(userId: string): void {
  cache.delete(userId);
}

export async function getCachedUserMcpPreferences(userId: string): Promise<UserMcpPreferences> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) {
    return hit.prefs;
  }
  const prefs = await getUserMcpPreferences(userId);
  cache.set(userId, { prefs, expiresAt: now + getTtlMs() });
  return prefs;
}

/** Test helper */
export function clearMcpPreferencesCacheForTests(): void {
  cache.clear();
}
