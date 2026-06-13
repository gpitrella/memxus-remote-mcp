import test from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import type { AuthedRequest } from '../lib/auth.js';
import { handleMcp, handleMcpGet, handleMcpDelete, _test } from './transport.js';

function mockAuthedReq(overrides: Partial<AuthedRequest> = {}): AuthedRequest {
  return {
    headers: {},
    body: {},
    ...overrides,
  } as AuthedRequest;
}

function mockRes(): Response & {
  statusCode: number;
  body?: unknown;
  headersSent: boolean;
  headers: Record<string, string | number | string[]>;
} {
  const state = {
    statusCode: 200,
    body: undefined as unknown,
    headersSent: false,
    headers: {} as Record<string, string | number | string[]>,
  };

  const res = {
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
    get headersSent() {
      return state.headersSent;
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      state.headersSent = true;
      return res;
    },
    setHeader(name: string, value: string | number | string[]) {
      state.headers[name.toLowerCase()] = value;
      return res;
    },
    getHeader(name: string) {
      return state.headers[name.toLowerCase()];
    },
    writeHead(code: number, headers?: Record<string, string>) {
      state.statusCode = code;
      state.headersSent = true;
      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          state.headers[key.toLowerCase()] = value;
        }
      }
      return res;
    },
    write() {
      return true;
    },
    end() {
      state.headersSent = true;
      return res;
    },
    on() {
      return res;
    },
    once() {
      return res;
    },
  };

  return res as unknown as Response & {
    statusCode: number;
    body?: unknown;
    headersSent: boolean;
    headers: Record<string, string | number | string[]>;
  };
}

const toolsListBody = {
  jsonrpc: '2.0',
  method: 'tools/list',
  id: 2,
};

test.afterEach(() => {
  _test.resetSessions();
  _test.setStatelessMode(undefined);
  _test.setSessionTtlMs(undefined);
});

test('handleMcp returns unauthorized without userId', async () => {
  const req = mockAuthedReq({
    body: {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'transport-test', version: '1.0.0' },
      },
      id: 1,
    },
  });
  const res = mockRes();
  await handleMcp(req, res);
  assert.equal(res.statusCode, 401);
});

test('stateful handleMcp rejects tools/list without session', async () => {
  _test.setStatelessMode(false);
  const req = mockAuthedReq({
    userId: 'user-1',
    body: toolsListBody,
  });
  const res = mockRes();
  await handleMcp(req, res);
  assert.equal(res.statusCode, 400);
  const err = (res.body as { error?: { message?: string } }).error;
  assert.match(String(err?.message), /no valid session/);
  assert.match(String(err?.message), /initialize/);
});

test('stateless handleMcp does not apply session wrapper gate on tools/list', async () => {
  _test.setStatelessMode(true);
  const req = mockAuthedReq({
    userId: 'user-1',
    body: toolsListBody,
  });
  const res = mockRes();
  await handleMcp(req, res);
  const err = (res.body as { error?: { message?: string } } | undefined)?.error;
  assert.doesNotMatch(String(err?.message ?? ''), /no valid session/);
});

test('stateless handleMcpGet returns 405', async () => {
  _test.setStatelessMode(true);
  const req = mockAuthedReq({ userId: 'user-1' });
  const res = mockRes();
  await handleMcpGet(req, res);
  assert.equal(res.statusCode, 405);
  const err = (res.body as { error?: { message?: string } }).error;
  assert.match(String(err?.message), /SSE not supported/);
});

test('stateless handleMcpDelete returns 405', async () => {
  _test.setStatelessMode(true);
  const req = mockAuthedReq({ userId: 'user-1' });
  const res = mockRes();
  await handleMcpDelete(req, res);
  assert.equal(res.statusCode, 405);
  const err = (res.body as { error?: { message?: string } }).error;
  assert.match(String(err?.message), /session DELETE not supported/);
});

test('stateful handleMcpGet rejects missing session', async () => {
  _test.setStatelessMode(false);
  const req = mockAuthedReq({ userId: 'user-1' });
  const res = mockRes();
  await handleMcpGet(req, res);
  assert.equal(res.statusCode, 400);
  const err = (res.body as { error?: { message?: string } }).error;
  assert.match(String(err?.message), /missing or expired MCP session id/);
  assert.match(String(err?.message), /Re-initialize/);
});

test('pruneIdleSessions removes sessions past TTL', () => {
  _test.setSessionTtlMs(60_000);
  const sessionId = 'expired-session';
  _test.seedSession(sessionId, Date.now() - 120_000);
  assert.equal(_test.hasSession(sessionId), true);

  _test.pruneIdleSessions();

  assert.equal(_test.hasSession(sessionId), false);
});

test('pruneIdleSessions keeps sessions within TTL', () => {
  _test.setSessionTtlMs(60_000);
  const sessionId = 'active-session';
  _test.seedSession(sessionId, Date.now() - 30_000);
  assert.equal(_test.hasSession(sessionId), true);

  _test.pruneIdleSessions();

  assert.equal(_test.hasSession(sessionId), true);
});

test('handleMcpDelete prunes expired session before lookup', async () => {
  _test.setStatelessMode(false);
  _test.setSessionTtlMs(60_000);
  const sessionId = 'expired-on-delete';
  _test.seedSession(sessionId, Date.now() - 120_000, 'user-1');

  const req = mockAuthedReq({
    userId: 'user-1',
    headers: { 'mcp-session-id': sessionId },
  });
  const res = mockRes();
  await handleMcpDelete(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(_test.hasSession(sessionId), false);
  const err = (res.body as { error?: { message?: string } }).error;
  assert.match(String(err?.message), /missing or expired MCP session id/);
});

test('handleMcpGet prunes expired session before lookup', async () => {
  _test.setStatelessMode(false);
  _test.setSessionTtlMs(60_000);
  const sessionId = 'expired-on-get';
  _test.seedSession(sessionId, Date.now() - 120_000, 'user-1');

  const req = mockAuthedReq({
    userId: 'user-1',
    headers: { 'mcp-session-id': sessionId },
  });
  const res = mockRes();
  await handleMcpGet(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(_test.hasSession(sessionId), false);
});
