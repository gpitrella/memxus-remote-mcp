import test from 'node:test';
import assert from 'node:assert/strict';
import { toStructuredMemory, toolSuccess } from './tool-results.js';
import type { FormattableMemory } from './format-memory.js';

const FIXTURE: FormattableMemory = {
  id: '11111111-1111-4111-8111-111111111111',
  memory_type: 'fact',
  importance: 0.5,
  tags: [],
  collection: null,
  content: 'hello',
  created_at: '2024-06-15T12:00:00.000Z',
};

test('toStructuredMemory omits embedding and exposes public fields', () => {
  const row = { ...FIXTURE, embedding: [0.1, 0.2] } as FormattableMemory & { embedding: number[] };
  const s = toStructuredMemory(row);
  assert.equal(s.id, FIXTURE.id);
  assert.equal(s.content, 'hello');
  assert.equal(s.collection, '');
  assert.equal('embedding' in s, false);
});

test('toolSuccess preserves text and adds structuredContent', () => {
  const text = 'Hello world';
  const r = toolSuccess(text, { count: 1 });
  assert.equal(r.content[0].text, text);
  assert.deepEqual(r.structuredContent, { count: 1 });
});
