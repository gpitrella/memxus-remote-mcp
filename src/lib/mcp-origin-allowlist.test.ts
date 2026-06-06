import test from 'node:test';
import assert from 'node:assert/strict';
import { CANONICAL_MCP_ORIGIN_ALLOWLIST } from '../config.js';
import { getMcpOriginAllowlist, isMcpOriginAllowed } from './mcp-origin-allowlist.js';

test('isMcpOriginAllowed accepts canonical marketplace origins', () => {
  for (const origin of CANONICAL_MCP_ORIGIN_ALLOWLIST) {
    assert.equal(isMcpOriginAllowed(origin), true, origin);
  }
});

test('isMcpOriginAllowed accepts Glama Inspector origin', () => {
  assert.equal(isMcpOriginAllowed('https://glama.ai'), true);
});

test('isMcpOriginAllowed accepts localhost in dev/test', () => {
  assert.equal(isMcpOriginAllowed('http://localhost:3000'), true);
  assert.equal(isMcpOriginAllowed('http://localhost:3002'), true);
});

test('isMcpOriginAllowed rejects unknown origin', () => {
  assert.equal(isMcpOriginAllowed('https://evil.example'), false);
});

test('getMcpOriginAllowlist includes localhost in dev/test', () => {
  const list = getMcpOriginAllowlist();
  assert.ok(list.includes('http://localhost:3000'));
  assert.ok(list.includes('https://glama.ai'));
});
