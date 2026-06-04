import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MCP_ORIGIN_ALLOWLIST, isMcpOriginAllowed } from './mcp-origin-allowlist.js';

test('isMcpOriginAllowed accepts default Anthropic origins', () => {
  for (const origin of DEFAULT_MCP_ORIGIN_ALLOWLIST) {
    assert.equal(isMcpOriginAllowed(origin), true, origin);
  }
});

test('isMcpOriginAllowed rejects unknown origin', () => {
  assert.equal(isMcpOriginAllowed('https://evil.example'), false);
});
