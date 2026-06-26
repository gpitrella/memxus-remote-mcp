import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  DEFAULT_USER_MCP_PREFERENCES,
  parseMcpPreferencesJson,
  mergeMcpPreferences,
} from './mcp-preferences.js';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(
  readFileSync(join(fixtureDir, '../../../API-IAMemory/test-fixtures/mcp-preferences.contract.json'), 'utf8')
) as {
  defaults: typeof DEFAULT_USER_MCP_PREFERENCES;
  parseCases: Array<{ input: unknown; expected: string | typeof DEFAULT_USER_MCP_PREFERENCES }>;
  mergeCases: Array<{
    current: 'defaults' | typeof DEFAULT_USER_MCP_PREFERENCES;
    patch: Partial<typeof DEFAULT_USER_MCP_PREFERENCES>;
    expected: typeof DEFAULT_USER_MCP_PREFERENCES;
  }>;
};

test('contract defaults match DEFAULT_USER_MCP_PREFERENCES', () => {
  assert.deepEqual(contract.defaults, DEFAULT_USER_MCP_PREFERENCES);
});

for (const [i, c] of contract.parseCases.entries()) {
  test(`contract parse case ${i}`, () => {
    const expected =
      c.expected === 'defaults' ? DEFAULT_USER_MCP_PREFERENCES : c.expected;
    assert.deepEqual(parseMcpPreferencesJson(c.input), expected);
  });
}

for (const [i, c] of contract.mergeCases.entries()) {
  test(`contract merge case ${i}`, () => {
    const current =
      c.current === 'defaults' ? DEFAULT_USER_MCP_PREFERENCES : c.current;
    assert.deepEqual(mergeMcpPreferences(current, c.patch), c.expected);
  });
}
