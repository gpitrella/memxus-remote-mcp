import { createHash } from 'crypto';
import type { ProjectProfile } from './types.js';
import { profileProject } from './project-profiler.js';

interface ProfileCacheEntry {
  profile: ProjectProfile;
  expiresAt: number;
}

const cache = new Map<string, ProfileCacheEntry>();

const DEFAULT_TTL_MS = 300_000;

function getTtlMs(): number {
  const raw = process.env.PROJECT_PROFILE_CACHE_TTL_MS;
  if (!raw) return DEFAULT_TTL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : DEFAULT_TTL_MS;
}

function topicHash(topic: string): string {
  return createHash('sha256').update(topic.trim().toLowerCase()).digest('hex').slice(0, 16);
}

function cacheKey(input: {
  userId: string;
  collection?: string | null;
  topic: string;
}): string {
  const collection = input.collection?.trim() || '_';
  return `${input.userId}:${collection}:${topicHash(input.topic)}`;
}

export function getCachedProjectProfile(input: {
  userId: string;
  topic: string;
  collection?: string | null;
  tags?: string[];
}): ProjectProfile {
  const key = cacheKey(input);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.profile;
  }
  const profile = profileProject({
    query: input.topic,
    collection: input.collection,
  });
  cache.set(key, { profile, expiresAt: now + getTtlMs() });
  return profile;
}

export function clearProjectProfileCacheForTests(): void {
  cache.clear();
}
