import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRefreshTokenGrant } from './refresh-token-grant.js';

test('resolveRefreshTokenGrant rejects missing refresh_token or client_id', async () => {
  assert.deepEqual(await resolveRefreshTokenGrant('', 'client'), {
    ok: false,
    error: 'invalid_request',
  });
  assert.deepEqual(await resolveRefreshTokenGrant('aimem_abc', ''), {
    ok: false,
    error: 'invalid_request',
  });
});

test('resolveRefreshTokenGrant rejects unknown refresh token', async () => {
  const result = await resolveRefreshTokenGrant(
    'aimem_' + 'a'.repeat(64),
    'aimem_testclient000000000000000000'
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, 'invalid_grant');
});
