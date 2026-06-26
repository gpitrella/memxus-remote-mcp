import test from 'node:test';
import assert from 'node:assert/strict';
import { connectSource, parseConnectPollToken, checkConnectStatus } from './connector-tools.js';

test('connectSource URL has no owner_id and valid pollToken', async () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  const out = await connectSource({ userId, provider: 'github' });
  assert.ok(out.authUrl.includes('connect=github'));
  assert.ok(!out.authUrl.includes('owner_id'));
  assert.equal(out.pollToken, `connect:github:${userId}`);
});

test('parseConnectPollToken validates user', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  assert.deepEqual(parseConnectPollToken(`connect:notion:${userId}`, userId), {
    provider: 'notion',
  });
  assert.equal(parseConnectPollToken('connect:github:other-id', userId), null);
});

test('checkConnectStatus rejects invalid poll token', async () => {
  await assert.rejects(
    () =>
      checkConnectStatus({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        pollToken: 'invalid',
      }),
    /Invalid poll_token/
  );
});
