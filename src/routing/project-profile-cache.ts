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
  snippetHash?: string;
}): string {
  const collection = input.collection?.trim() || '_';
  const snippets = input.snippetHash ?? '_';
  return `${input.userId}:${collection}:${topicHash(input.topic)}:${snippets}`;
}

function snippetsHash(snippets: string[]): string {
  const joined = snippets.slice(0, 5).join('|').slice(0, 200);
  return createHash('sha256').update(joined).digest('hex').slice(0, 8);
}

export function getCachedProjectProfile(input: {
  userId: string;
  topic: string;
  collection?: string | null;
  memorySnippets?: string[];
}): ProjectProfile {
  const snippets = input.memorySnippets ?? [];
  const key = cacheKey({
    userId: input.userId,
    collection: input.collection,
    topic: input.topic,
    snippetHash: snippets.length ? snippetsHash(snippets) : undefined,
  });
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.profile;
  }
  const profile = profileProject({
    query: input.topic,
    collection: input.collection,
    memorySnippets: snippets,
  });
  cache.set(key, { profile, expiresAt: now + getTtlMs() });
  return profile;
}

export function clearProjectProfileCacheForTests(): void {
  cache.clear();
}
