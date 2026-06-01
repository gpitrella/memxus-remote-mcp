import test from 'node:test';
import assert from 'node:assert/strict';
import { mcpRateLimit, _resetMcpRateLimitForTest } from './mcpRateLimit.js';
import type { AuthedRequest } from '../lib/auth.js';
import type { Response } from 'express';

function mockReq(apiKeyId?: string): AuthedRequest {
  return {
    apiKeyId,
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as AuthedRequest;
}

function mockRes(): Response & { statusCode?: number; body?: unknown; headers: Record<string, string> } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    set(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as Response & { statusCode?: number; body?: unknown; headers: Record<string, string> };
}

test('mcpRateLimit allows requests under the per-key limit', () => {
  _resetMcpRateLimitForTest();
  const req = mockReq('test-key-id');
  let nextCalled = 0;

  for (let i = 0; i < 90; i++) {
    const res = mockRes();
    mcpRateLimit(req, res, () => {
      nextCalled += 1;
    });
    assert.equal(res.statusCode, 200);
  }

  assert.equal(nextCalled, 90);
});

test('mcpRateLimit returns 429 when per-key limit exceeded', () => {
  _resetMcpRateLimitForTest();
  const req = mockReq('burst-key');
  const next = () => undefined;

  for (let i = 0; i < 90; i++) {
    mcpRateLimit(req, mockRes(), next);
  }

  const res = mockRes();
  let blocked = false;
  mcpRateLimit(req, res, () => {
    blocked = true;
  });

  assert.equal(blocked, false);
  assert.equal(res.statusCode, 429);
  assert.deepEqual(res.body, {
    error: 'too_many_requests',
    error_description: 'Rate limit exceeded. Try again later.',
  });
  assert.ok(res.headers['Retry-After']);
});
