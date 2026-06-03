import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenizeQueryForSearch,
  resolveVectorThreshold,
  applyTextSearchOr,
} from './memory-search.js';

test('tokenizeQueryForSearch splits Next.js Supabase for ILIKE fallback', () => {
  const tokens = tokenizeQueryForSearch('Next.js Supabase');
  assert.ok(tokens.includes('next.js'));
  assert.ok(tokens.includes('supabase'));
});

test('tokenizeQueryForSearch normalizes plus signs', () => {
  const tokens = tokenizeQueryForSearch('Next.js + Supabase');
  assert.ok(tokens.includes('next.js'));
  assert.ok(tokens.includes('supabase'));
});

test('resolveVectorThreshold is lower without collection', () => {
  assert.equal(resolveVectorThreshold({}), 0.5);
  assert.equal(resolveVectorThreshold({ collection: 'personal:preferences' }), 0.6);
});

test('applyTextSearchOr builds or filter for phrase, tokens, collection, and tags', () => {
  const calls: string[] = [];
  const q = {
    or: (filter: string) => {
      calls.push(filter);
      return q;
    },
  };
  applyTextSearchOr(q, 'Next.js Supabase');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /content\.ilike\.%Next\.js Supabase%/);
  assert.match(calls[0], /collection\.ilike\.%next\.js%/);
  assert.match(calls[0], /tags\.cs\.\{supabase\}/);
});
