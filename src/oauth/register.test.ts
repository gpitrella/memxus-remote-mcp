import test from 'node:test';
import assert from 'node:assert/strict';
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

test('DCR rejects non-none token_endpoint_auth_method', () => {
  const res = _test.registerSchema.safeParse({
    redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
    token_endpoint_auth_method: 'client_secret_basic',
  });
  assert.equal(res.success, true);
  if (!res.success) return;
  assert.equal(res.data.token_endpoint_auth_method, 'client_secret_basic');
});

test('newClientId uses aimem_ prefix', () => {
  const id = _test.newClientId();
  assert.ok(id.startsWith('aimem_'));
  assert.ok(id.length > 'aimem_'.length);
});

