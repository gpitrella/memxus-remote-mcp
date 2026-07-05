import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_USER_MCP_PREFERENCES,
  parseMcpPreferencesJson,
  resolveDefaultReadVisibility,
  isInAppConnectActiveForUser,
} from './mcp-preferences.js';
import { getActiveMcpTools } from '../mcp/tool-schemas.js';
import { DISABLE_SKILLS, ENABLE_INAPP_CONNECT, ENABLE_SKILL_ROUTING } from './feature-flags.js';
import { assertOAuthScopes, tokenHasScopes, getDefaultOAuthScope, normalizeRequestedOAuthScopes } from './oauth-scopes.js';

test('parseMcpPreferencesJson applies defaults', () => {
  assert.deepEqual(parseMcpPreferencesJson({}), DEFAULT_USER_MCP_PREFERENCES);
  assert.equal(
    parseMcpPreferencesJson({ default_memory_visibility: 'shared' }).default_memory_visibility,
    'shared'
  );
});

test('resolveDefaultReadVisibility respects include_group_memories_in_context', () => {
  const privatePrefs = { ...DEFAULT_USER_MCP_PREFERENCES, include_group_memories_in_context: false };
  const openPrefs = { ...DEFAULT_USER_MCP_PREFERENCES, include_group_memories_in_context: true };
  assert.equal(resolveDefaultReadVisibility(privatePrefs), 'private');
  assert.equal(resolveDefaultReadVisibility(openPrefs), 'all');
  assert.equal(resolveDefaultReadVisibility(privatePrefs, 'shared'), 'shared');
});

test('getActiveMcpTools hides optional tools when user pref off', () => {
  const envOn = process.env[ENABLE_INAPP_CONNECT];
  const envSkill = process.env[ENABLE_SKILL_ROUTING];
  process.env[ENABLE_INAPP_CONNECT] = 'true';
  process.env[ENABLE_SKILL_ROUTING] = 'true';
  try {
    const withoutUser = getActiveMcpTools({
      prefs: { ...DEFAULT_USER_MCP_PREFERENCES },
    });
    assert.equal(withoutUser.length, 9);

    const withUser = getActiveMcpTools({
      prefs: {
        ...DEFAULT_USER_MCP_PREFERENCES,
        in_app_connect_enabled: true,
        skill_routing_enabled: true,
      },
    });
    assert.equal(withUser.length, 19);
  } finally {
    if (envOn === undefined) delete process.env[ENABLE_INAPP_CONNECT];
    else process.env[ENABLE_INAPP_CONNECT] = envOn;
    if (envSkill === undefined) delete process.env[ENABLE_SKILL_ROUTING];
    else process.env[ENABLE_SKILL_ROUTING] = envSkill;
  }
});

test('DISABLE_SKILLS kill-switch overrides skill routing env and user pref', () => {
  const prevDisable = process.env[DISABLE_SKILLS];
  const prevRouting = process.env[ENABLE_SKILL_ROUTING];
  process.env[DISABLE_SKILLS] = 'true';
  process.env[ENABLE_SKILL_ROUTING] = 'true';
  try {
    const tools = getActiveMcpTools({
      prefs: {
        ...DEFAULT_USER_MCP_PREFERENCES,
        skill_routing_enabled: true,
        in_app_connect_enabled: true,
      },
    });
    const names = tools.map((t) => t.name);
    assert.equal(tools.length, 9);
    assert.ok(!names.includes('get_context_with_skills'));
    assert.ok(!names.includes('install_skill'));
  } finally {
    if (prevDisable === undefined) delete process.env[DISABLE_SKILLS];
    else process.env[DISABLE_SKILLS] = prevDisable;
    if (prevRouting === undefined) delete process.env[ENABLE_SKILL_ROUTING];
    else process.env[ENABLE_SKILL_ROUTING] = prevRouting;
  }
});

test('isInAppConnectActiveForUser requires both env and pref', () => {
  const envOn = process.env.ENABLE_INAPP_CONNECT;
  process.env.ENABLE_INAPP_CONNECT = 'true';
  try {
    assert.equal(
      isInAppConnectActiveForUser({ ...DEFAULT_USER_MCP_PREFERENCES, in_app_connect_enabled: false }),
      false
    );
    assert.equal(
      isInAppConnectActiveForUser({ ...DEFAULT_USER_MCP_PREFERENCES, in_app_connect_enabled: true }),
      true
    );
  } finally {
    if (envOn === undefined) delete process.env.ENABLE_INAPP_CONNECT;
    else process.env.ENABLE_INAPP_CONNECT = envOn;
  }
});

test('oauth default scope includes memories:delete', () => {
  const scope = getDefaultOAuthScope();
  assert.ok(scope.includes('memories:delete'));
});

test('normalizeRequestedOAuthScopes rejects unknown', () => {
  const result = normalizeRequestedOAuthScopes('memories:read unknown:scope');
  assert.equal(result.ok, false);
});

test('oauth scope helpers', () => {
  assert.equal(tokenHasScopes('memories:read sources:read', ['sources:read']), true);
  assert.equal(tokenHasScopes('memories:read', ['sources:write']), false);
  assert.throws(() =>
    assertOAuthScopes('memories:read', ['sources:read'], { isOAuthToken: true })
  );
  assert.doesNotThrow(() =>
    assertOAuthScopes(undefined, ['sources:read'], { isOAuthToken: false })
  );
});
