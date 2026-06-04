import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { mcpOriginValidation, setMcpCorsHeaders } from './origin-validation.js';

function mockReq(method: string, origin?: string): Request {
  return {
    method,
    headers: origin ? { origin } : {},
  } as Request;
}

function mockRes(): Response & {
  statusCode?: number;
  body?: unknown;
  ended?: boolean;
  headers: Record<string, string | string[]>;
} {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    ended: false,
    headers: {} as Record<string, string | string[]>,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
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
    end() {
      this.ended = true;
      return this;
    },
  };
  return res as Response & {
    statusCode?: number;
    body?: unknown;
    ended?: boolean;
    headers: Record<string, string | string[]>;
  };
}

test('mcpOriginValidation allows POST without Origin', () => {
  const req = mockReq('POST');
  const res = mockRes();
  let nextCalled = 0;
  mcpOriginValidation(req, res, () => {
    nextCalled += 1;
  });
  assert.equal(nextCalled, 1);
  assert.equal(res.statusCode, 200);
});

test('mcpOriginValidation allows POST with allowlisted Origin and sets ACAO', () => {
  const req = mockReq('POST', 'https://claude.ai');
  const res = mockRes();
  let nextCalled = 0;
  mcpOriginValidation(req, res, () => {
    nextCalled += 1;
  });
  assert.equal(nextCalled, 1);
  assert.equal(res.headers['access-control-allow-origin'], 'https://claude.ai');
});

test('mcpOriginValidation rejects POST with disallowed Origin', () => {
  const req = mockReq('POST', 'https://evil.example');
  const res = mockRes();
  let nextCalled = 0;
  mcpOriginValidation(req, res, () => {
    nextCalled += 1;
  });
  assert.equal(nextCalled, 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'origin_not_allowed' });
});

test('mcpOriginValidation OPTIONS returns 204', () => {
  const req = mockReq('OPTIONS', 'https://claude.com');
  const res = mockRes();
  mcpOriginValidation(req, res, (() => {}) as NextFunction);
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.equal(res.headers['access-control-allow-origin'], 'https://claude.com');
});

test('setMcpCorsHeaders sets credentials and methods without Origin', () => {
  const res = mockRes();
  setMcpCorsHeaders(res);
  assert.equal(res.headers['access-control-allow-credentials'], 'true');
  assert.match(String(res.headers['access-control-allow-methods']), /POST/);
});
