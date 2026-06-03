/**
 * Text + vector search helpers (SYNC: API-IAMemory/src/lib/memory-search.ts)
 */
import type { MemoryScopeFilters } from './memory-scope.js';

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'for',
  'to',
  'of',
  'in',
  'on',
  'at',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'with',
  'from',
  'by',
  'as',
  'it',
  'this',
  'that',
  'de',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'y',
  'o',
  'en',
  'con',
  'por',
  'para',
  'que',
  'es',
  'del',
]);

/** Split query into tokens suitable for ILIKE fallback (min length 3). */
export function tokenizeQueryForSearch(query: string): string[] {
  const normalized = query
    .trim()
    .toLowerCase()
    .replace(/[+]/g, ' ')
    .replace(/[^\p{L}\p{N}\s:._-]/gu, ' ')
    .replace(/\s+/g, ' ');

  const tokens = new Set<string>();
  for (const part of normalized.split(' ')) {
    const t = part.trim();
    if (t.length >= 3 && !STOPWORDS.has(t)) {
      tokens.add(t);
    }
  }
  return [...tokens];
}

/** Vector similarity threshold: lower when searching across all collections. */
export function resolveVectorThreshold(scope: MemoryScopeFilters): number {
  if (scope.collection) return 0.6;
  return 0.5;
}

export type TextSearchQuery = {
  or: (filters: string) => unknown;
};

/**
 * Apply OR ilike filters for full phrase and per-token matches.
 */
export function applyTextSearchOr<T extends TextSearchQuery>(query: T, searchText: string): T {
  const phrase = searchText.trim();
  const tokens = tokenizeQueryForSearch(phrase);
  const patterns = new Set<string>();
  if (phrase.length >= 2) {
    patterns.add(`%${phrase}%`);
  }
  for (const token of tokens) {
    patterns.add(`%${token}%`);
  }
  if (patterns.size === 0) {
    return query;
  }
  const parts: string[] = [];
  for (const p of patterns) {
    parts.push(`content.ilike.${p}`);
    parts.push(`collection.ilike.${p}`);
  }
  for (const token of tokens) {
    if (token.length >= 3) {
      parts.push(`tags.cs.{${token}}`);
    }
  }
  return query.or(parts.join(',')) as T;
}
