import test from 'node:test';
import assert from 'node:assert/strict';
import { toStructuredMemory, toolSuccess, toolSuccessWithUserFacing } from './tool-results.js';
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

test('toolSuccessWithUserFacing appends footer and sets message', () => {
  const body = '=== context ===';
  const footer = '━━━ MEMXUS — Resumen para el usuario ━━━';
  const r = toolSuccessWithUserFacing(body, { context_block: body, count: 1 }, footer);
  assert.equal(r.content[0].text, `${body}\n\n${footer}`);
  assert.equal(r.structuredContent.message, `${body}\n\n${footer}`);
  assert.equal(r.structuredContent.context_block, body);
  assert.equal(r.structuredContent.user_facing_template, footer);
});

test('toolSuccessWithUserFacing can expose template only', () => {
  const body = '=== context ===';
  const footer = 'CONTEXTO\n1. use 1';
  const r = toolSuccessWithUserFacing(
    body,
    { context_block: body, count: 1 },
    footer,
    undefined,
    'template_only',
  );
  assert.equal(r.content[0].text, footer);
  assert.equal(r.structuredContent.message, footer);
  assert.equal(r.structuredContent.context_block, body);
  assert.equal(r.structuredContent.user_facing_template, footer);
});
