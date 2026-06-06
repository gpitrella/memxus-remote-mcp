import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_CORS_ORIGINS,
  CANONICAL_MCP_ORIGIN_ALLOWLIST,
  getEffectiveCorsOrigins,
} from './config.js';

test('getEffectiveCorsOrigins includes canonical origins in test env', () => {
  const origins = getEffectiveCorsOrigins();
  for (const origin of CANONICAL_CORS_ORIGINS) {
    assert.ok(origins.includes(origin), origin);
  }
});

test('CANONICAL_MCP_ORIGIN_ALLOWLIST includes claudedesktop and glama', () => {
  assert.ok(CANONICAL_MCP_ORIGIN_ALLOWLIST.includes('https://glama.ai'));
  assert.ok(CANONICAL_MCP_ORIGIN_ALLOWLIST.includes('https://claudedesktop.anthropic.com'));
});
