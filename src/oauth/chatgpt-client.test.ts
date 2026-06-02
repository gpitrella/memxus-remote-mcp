import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHATGPT_PKCE_PLACEHOLDER,
  CHATGPT_PKCE_METHOD,
  isChatGptPkceBypass,
  resolveAuthorizePkce,
  resolveTokenRequirements,
  validateChatGptClientSecret,
  _testSetChatGptOAuthEnabled,
  _testSetChatGptClientSecret,
} from './chatgpt-client.js';
import { config } from '../config.js';

test.afterEach(() => {
  _testSetChatGptOAuthEnabled(undefined);
  _testSetChatGptClientSecret(undefined);
});

test('resolveAuthorizePkce requires PKCE for non-ChatGPT client', () => {
  _testSetChatGptOAuthEnabled(false);
  const res = resolveAuthorizePkce('aimem_abc123', undefined);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.error_description, /code_challenge required/);
});

test('resolveAuthorizePkce accepts S256 for MCP clients', () => {
  _testSetChatGptOAuthEnabled(false);
  const res = resolveAuthorizePkce('aimem_abc123', 'challenge123', 'S256');
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.codeChallenge, 'challenge123');
});

test('resolveAuthorizePkce rejects PKCE on ChatGPT client', () => {
  _testSetChatGptOAuthEnabled(true);
  const res = resolveAuthorizePkce(config.CHATGPT_OAUTH_CLIENT_ID, 'should-not-send');
  assert.equal(res.ok, false);
});

test('resolveAuthorizePkce uses sentinel for ChatGPT without PKCE', () => {
  _testSetChatGptOAuthEnabled(true);
  const res = resolveAuthorizePkce(config.CHATGPT_OAUTH_CLIENT_ID, undefined);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.codeChallenge, CHATGPT_PKCE_PLACEHOLDER);
  assert.equal(res.codeChallengeMethod, CHATGPT_PKCE_METHOD);
});

test('resolveTokenRequirements requires code_verifier for MCP clients', () => {
  _testSetChatGptOAuthEnabled(false);
  const res = resolveTokenRequirements('aimem_xyz', undefined, undefined);
  assert.equal(res.ok, false);
});

test('resolveTokenRequirements requires client_secret for ChatGPT', () => {
  _testSetChatGptOAuthEnabled(true);
  _testSetChatGptClientSecret('test-secret-min-16-chars');
  const res = resolveTokenRequirements(config.CHATGPT_OAUTH_CLIENT_ID, undefined, undefined);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error, 'invalid_client');
});

test('resolveTokenRequirements accepts ChatGPT without verifier when secret valid', () => {
  _testSetChatGptOAuthEnabled(true);
  _testSetChatGptClientSecret('test-secret-min-16-chars');
  const res = resolveTokenRequirements(
    config.CHATGPT_OAUTH_CLIENT_ID,
    undefined,
    'test-secret-min-16-chars'
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.requiresPkceVerifier, false);
});

test('resolveTokenRequirements rejects code_verifier for ChatGPT', () => {
  _testSetChatGptOAuthEnabled(true);
  _testSetChatGptClientSecret('test-secret-min-16-chars');
  const res = resolveTokenRequirements(
    config.CHATGPT_OAUTH_CLIENT_ID,
    'verifier',
    'test-secret-min-16-chars'
  );
  assert.equal(res.ok, false);
});

test('isChatGptPkceBypass detects sentinel', () => {
  assert.equal(isChatGptPkceBypass(CHATGPT_PKCE_PLACEHOLDER, CHATGPT_PKCE_METHOD), true);
  assert.equal(isChatGptPkceBypass('real-challenge', 'S256'), false);
});

test('validateChatGptClientSecret uses timing-safe compare', () => {
  _testSetChatGptOAuthEnabled(true);
  _testSetChatGptClientSecret('test-secret-min-16-chars');
  assert.equal(validateChatGptClientSecret('test-secret-min-16-chars'), true);
  assert.equal(validateChatGptClientSecret('wrong-secret-value'), false);
});
