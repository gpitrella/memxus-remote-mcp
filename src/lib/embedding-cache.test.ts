import test from 'node:test';
import assert from 'node:assert/strict';
import { getCachedEmbedding, isEmbeddingCacheEnabled, setCachedEmbedding, _test } from './embedding-cache.js';

test.afterEach(() => {
  _test.clearEmbeddingCache();
  _test.setCacheEnabledOverride(undefined);
  _test.setCacheTtlOverrideMs(undefined);
  _test.setCacheMaxEntriesOverride(undefined);
});

test('cache is enabled by default', () => {
  _test.setCacheEnabledOverride(undefined);
  assert.equal(isEmbeddingCacheEnabled(), true);
});

test('stores and retrieves embeddings', () => {
  setCachedEmbedding('Find critical docs', [0.1, 0.2, 0.3]);
  const hit = getCachedEmbedding('find critical docs');
  assert.deepEqual(hit, [0.1, 0.2, 0.3]);
});

test('returns null for expired entries', async () => {
  _test.setCacheTtlOverrideMs(5);
  setCachedEmbedding('short ttl', [0.9]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(getCachedEmbedding('short ttl'), null);
});

test('evicts least recently used when full', async () => {
  _test.setCacheMaxEntriesOverride(2);
  setCachedEmbedding('first', [1]);
  setCachedEmbedding('second', [2]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(getCachedEmbedding('first'), [1]); // touch first
  await new Promise((resolve) => setTimeout(resolve, 5));
  setCachedEmbedding('third', [3]);

  assert.deepEqual(getCachedEmbedding('first'), [1]);
  assert.equal(getCachedEmbedding('second'), null);
  assert.deepEqual(getCachedEmbedding('third'), [3]);
});

test('does not cache when disabled', () => {
  _test.setCacheEnabledOverride(false);
  setCachedEmbedding('disabled', [1, 2]);
  assert.equal(getCachedEmbedding('disabled'), null);
  assert.equal(_test.getCacheSize(), 0);
});
