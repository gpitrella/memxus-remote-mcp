import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../config.js';
import { _test } from './register.js';

test('DCR register schema requires redirect_uris', () => {
  const res = _test.registerSchema.safeParse({});
  assert.equal(res.success, false);
});

test('DCR register schema defaults token_endpoint_auth_method to none', () => {
  const res = _test.registerSchema.safeParse({
    redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  });
  assert.equal(res.success, true);
  if (!res.success) return;
  assert.equal(res.data.token_endpoint_auth_method, 'none');
});

test('dcrPersistedAuthMethod always returns none', () => {
  assert.equal(_test.dcrPersistedAuthMethod(undefined), 'none');
  assert.equal(_test.dcrPersistedAuthMethod('none'), 'none');
  assert.equal(_test.dcrPersistedAuthMethod('client_secret_post'), 'none');
  assert.equal(_test.dcrPersistedAuthMethod('client_secret_basic'), 'none');
});

test('DCR schema accepts Anthropic broker payload with client_secret_post', () => {
  const res = _test.registerSchema.safeParse({
    client_name: 'claudeai',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
    scope: 'claudeai',
    redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  });
  assert.equal(res.success, true);
  if (!res.success) return;
  assert.equal(_test.dcrPersistedAuthMethod(res.data.token_endpoint_auth_method), 'none');
});

test('newClientId uses aimem_ prefix', () => {
  const id = _test.newClientId();
  assert.ok(id.startsWith('aimem_'));
  assert.ok(id.length > 'aimem_'.length);
});

test('DCR schema accepts Claude-like RFC7591 payload', () => {
  const res = _test.registerSchema.safeParse({
    redirect_uris: [
      'https://claude.ai/api/mcp/auth_callback',
      'http://127.0.0.1:54321/callback',
      'http://localhost/callback',
    ],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    client_name: 'claude-dcr-smoke',
  });
  assert.equal(res.success, true);
});

test('filterAllowedRedirectUris keeps Smithery Connect callbacks', () => {
  for (const uri of [
    'https://smithery.ai/oauth/callback',
    'https://auth.smithery.ai/connect',
  ]) {
    const { allowed } = _test.filterAllowedRedirectUris([uri]);
    assert.ok(allowed.includes(uri), uri);
  }
});

test('firstZodIssueMessage describes missing redirect_uris', () => {
  const res = _test.registerSchema.safeParse({});
  assert.equal(res.success, false);
  if (res.success) return;
  const msg = _test.firstZodIssueMessage(res.error);
  assert.match(msg, /redirect_uris/i);
});

test('filterAllowedRedirectUris keeps VS Code gallery DCR callbacks', () => {
  for (const uri of ['https://vscode.dev/redirect', 'http://127.0.0.1:33418']) {
    const { allowed } = _test.filterAllowedRedirectUris([uri]);
    assert.ok(allowed.includes(uri), uri);
  }
});

test('filterAllowedRedirectUris keeps Gemini CLI DCR callback', () => {
  const uri = 'http://localhost:7777/oauth/callback';
  const { allowed } = _test.filterAllowedRedirectUris([uri]);
  assert.ok(allowed.includes(uri));
});

test('filterAllowedRedirectUris keeps Claude and loopback from Claude DCR payload', () => {
  const { allowed, rejected } = _test.filterAllowedRedirectUris([
    'https://claude.ai/api/mcp/auth_callback',
    'http://127.0.0.1:54321/callback',
    'http://localhost/callback',
    'https://evil.example/callback',
  ]);
  assert.ok(allowed.includes('https://claude.ai/api/mcp/auth_callback'));
  assert.ok(allowed.includes('http://127.0.0.1:54321/callback'));
  assert.ok(allowed.includes('http://localhost/callback'));
  if (config.ALLOWED_REDIRECT_URIS.length > 0) {
    assert.ok(rejected.includes('https://evil.example/callback'));
  }
  assert.ok(allowed.length >= 3);
});

