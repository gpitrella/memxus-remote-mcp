import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleEmbeddingUpdate } from './embedding-background.js';

test('scheduleEmbeddingUpdate returns immediately without throwing', () => {
  assert.doesNotThrow(() => {
    scheduleEmbeddingUpdate('00000000-0000-4000-8000-000000000001', 'benchmark text');
  });
});
