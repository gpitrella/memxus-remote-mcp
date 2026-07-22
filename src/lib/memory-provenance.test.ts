import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveMemorySource } from './memory-provenance.js';

test('deriveMemorySource: github tag wins', () => {
  assert.equal(deriveMemorySource(['github', 'workspace:acme']), 'github');
});

test('deriveMemorySource: notion tag', () => {
  assert.equal(deriveMemorySource(['notion']), 'notion');
});

test('deriveMemorySource: workforce from workspace:<slug> auto-tag', () => {
  assert.equal(deriveMemorySource(['workspace:alpha-workforce']), 'workforce:alpha-workforce');
});

test('deriveMemorySource: defaults to manual', () => {
  assert.equal(deriveMemorySource(['random']), 'manual');
  assert.equal(deriveMemorySource([]), 'manual');
  assert.equal(deriveMemorySource(undefined), 'manual');
  assert.equal(deriveMemorySource(null), 'manual');
});

test('deriveMemorySource: connector tag outranks workspace tag', () => {
  // A GitHub sync into a workforce still reads primarily as github provenance.
  assert.equal(deriveMemorySource(['workspace:acme', 'notion']), 'notion');
});

test('deriveMemorySource: system_welcome tag', () => {
  assert.equal(deriveMemorySource(['system_welcome']), 'system_welcome');
});

test('deriveMemorySource: system_welcome wins over workspace tag', () => {
  // A welcome memory must stay identifiable/excludable from real activation
  // metrics even if it ends up moved into a workforce workspace later.
  assert.equal(deriveMemorySource(['system_welcome', 'workspace:acme']), 'system_welcome');
});
