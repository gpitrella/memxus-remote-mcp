import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMemoryLine,
  formatRememberText,
  formatGetMemoryText,
  formatContextBlock,
  formatMemoryStatsText,
  type FormattableMemory,
} from './format-memory.js';

const FIXTURE: FormattableMemory = {
  id: '11111111-1111-4111-8111-111111111111',
  memory_type: 'fact',
  importance: 0.8,
  tags: ['project:demo'],
  collection: 'project:demo',
  content: 'Stack: Next.js, Supabase, Railway.',
  created_at: '2024-06-15T12:00:00.000Z',
};

test('formatMemoryLine verbose includes id, type, content', () => {
  const out = formatMemoryLine(FIXTURE, 0, true);
  assert.match(out, /^\[1\] ID: 11111111/);
  assert.match(out, /Type: fact \| Importance: 0\.8/);
  assert.match(out, /Stack: Next\.js/);
  assert.match(out, /Collection: project:demo/);
});

test('formatMemoryLine preview truncates long content', () => {
  const long: FormattableMemory = {
    ...FIXTURE,
    content: 'x'.repeat(150),
  };
  const out = formatMemoryLine(long, 0, false);
  assert.match(out, /\.\.\./);
  assert.ok(!out.includes('x'.repeat(150)));
});

test('formatRememberText matches legacy template', () => {
  assert.equal(
    formatRememberText(FIXTURE),
    'Remembered (ID: 11111111-1111-4111-8111-111111111111)\nType: fact\nCollection: project:demo\nTags: project:demo\nImportance: 0.8'
  );
});

test('formatGetMemoryText includes ISO saved date and body', () => {
  const out = formatGetMemoryText(FIXTURE);
  assert.match(out, /^ID: 11111111/);
  assert.match(out, /Saved: 2024-06-15T12:00:00.000Z/);
  assert.match(out, /Stack: Next\.js/);
});

test('formatContextBlock wraps topic and memories', () => {
  const block = formatContextBlock('my topic', 'project:demo', [FIXTURE]);
  assert.match(block, /^=== AI Memory Context ===/);
  assert.match(block, /Topic: my topic/);
  assert.match(block, /Collection: project:demo/);
  assert.match(block, /\[1\] \[FACT\] \[project:demo\]/);
  assert.match(block, /=== End of Memory Context ===$/);
});

test('formatMemoryStatsText empty breakdowns show (none)', () => {
  const text = formatMemoryStatsText({ total: 0, byType: {}, byCollection: {} });
  assert.match(text, /Total: 0/);
  assert.match(text, /\(none\)/);
});
