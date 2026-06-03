import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCollectionHint,
  buildSearchScopeAttempts,
  scoreCollectionMatch,
  type CollectionListItem,
} from './memory-scope.js';

const COLLECTIONS: CollectionListItem[] = [
  { slug: 'project:henry-memory', name: 'Project: Henry Memory', description: null },
  { slug: 'personal:preferences', name: 'Personal: Preferences', description: null },
  { slug: 'project:memxus', name: 'Project: Memxus', description: null },
];

test('resolveCollectionHint matches partial slug', () => {
  assert.equal(resolveCollectionHint('henry', COLLECTIONS), 'project:henry-memory');
});

test('resolveCollectionHint matches exact slug', () => {
  assert.equal(resolveCollectionHint('personal:preferences', COLLECTIONS), 'personal:preferences');
});

test('resolveCollectionHint matches multi-word hint', () => {
  assert.equal(resolveCollectionHint('henry memory', COLLECTIONS), 'project:henry-memory');
});

test('buildSearchScopeAttempts includes unscoped retry', () => {
  const attempts = buildSearchScopeAttempts(
    { collection: 'project:wrong-slug' },
    'henry',
    COLLECTIONS
  );
  assert.ok(attempts.some((a) => a.collection === 'project:henry-memory'));
  assert.ok(attempts.some((a) => a.collection === undefined));
});

test('scoreCollectionMatch gives 1 for exact slug', () => {
  assert.equal(scoreCollectionMatch('project:memxus', COLLECTIONS[2]), 1);
});
