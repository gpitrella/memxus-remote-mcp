/**
 * Scoped memory search with collection retry (SYNC: API-IAMemory/src/lib/memory-search-run.ts)
 */
import type { CollectionListItem, MemoryScopeFilters } from './memory-scope.js';
import { buildSearchScopeAttempts } from './memory-scope.js';

export async function searchMemoriesWithScopeRetry<T extends Record<string, unknown>>(options: {
  query: string;
  baseScope: MemoryScopeFilters;
  rawCollection?: string | null;
  collections: CollectionListItem[];
  generateEmbedding: (text: string) => Promise<number[] | null>;
  vectorSearch: (embedding: number[], scope: MemoryScopeFilters) => Promise<T[]>;
  textSearch: (scope: MemoryScopeFilters) => Promise<T[]>;
}): Promise<T[]> {
  const attempts = buildSearchScopeAttempts(
    options.baseScope,
    options.rawCollection,
    options.collections
  );

  for (const scope of attempts) {
    const embedding = await options.generateEmbedding(options.query);
    if (embedding) {
      const vectorResults = await options.vectorSearch(embedding, scope);
      if (vectorResults.length > 0) return vectorResults;
    }

    const textResults = await options.textSearch(scope);
    if (textResults.length > 0) return textResults;
  }

  return [];
}
