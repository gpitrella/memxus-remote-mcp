import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { mcpPublicDiscovery } from './public-discovery.js';
import { MCP_CORE_TOOLS } from './tool-schemas.js';

function mockReq(body: unknown, headers: Record<string, string> = {}): Request {
  return { body, headers } as Request;
}

function mockRes(): Response & {
  statusCode: number;
  body?: unknown;
  ended: boolean;
} {
  const state = { statusCode: 200, body: undefined as unknown, ended: false };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
    get ended() {
      return state.ended;
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
    end() {
      state.ended = true;
      return res;
    },
  };
  return res as Response & { statusCode: number; body?: unknown; ended: boolean };
}

async function runMiddleware(
  req: Request
): Promise<{ res: ReturnType<typeof mockRes>; nextCalled: boolean }> {
  const res = mockRes();
  let nextCalled = false;
  await mcpPublicDiscovery(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);
  return { res, nextCalled };
}

test('anonymous initialize returns public server info', async () => {
  const { res, nextCalled } = await runMiddleware(
    mockReq({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'probe', version: '1.0' },
      },
      id: 1,
    })
  );
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 200);
  const body = res.body as { result: { serverInfo: { name: string } } };
  assert.equal(body.result.serverInfo.name, 'memxus');
});

test('notifications/initialized without auth returns 202', async () => {
  const { res, nextCalled } = await runMiddleware(
    mockReq({ jsonrpc: '2.0', method: 'notifications/initialized' })
  );
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 202);
  assert.equal(res.ended, true);
});

test('notifications/initialized with Bearer and session passes through', async () => {
  const { nextCalled } = await runMiddleware(
    mockReq(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { authorization: 'Bearer tok', 'mcp-session-id': 'sess-1' }
    )
  );
  assert.equal(nextCalled, true);
});

test('ping returns empty result', async () => {
  const { res, nextCalled } = await runMiddleware(
    mockReq({ jsonrpc: '2.0', method: 'ping', id: 99 })
  );
  assert.equal(nextCalled, false);
  assert.deepEqual(res.body, { jsonrpc: '2.0', result: {}, id: 99 });
});

test('Bearer tools/list without session returns static tools', async () => {
  const { res, nextCalled } = await runMiddleware(
    mockReq(
      { jsonrpc: '2.0', method: 'tools/list', id: 2 },
      { authorization: 'Bearer tok' }
    )
  );
  assert.equal(nextCalled, false);
  const body = res.body as { result: { tools: unknown[] } };
  assert.equal(body.result.tools.length, MCP_CORE_TOOLS.length);
});

test('Bearer tools/list with session passes through', async () => {
  const { nextCalled } = await runMiddleware(
    mockReq(
      { jsonrpc: '2.0', method: 'tools/list', id: 2 },
      { authorization: 'Bearer tok', 'mcp-session-id': 'sess-1' }
    )
  );
  assert.equal(nextCalled, true);
});

test('Bearer initialize without session passes through for session creation', async () => {
  const { nextCalled } = await runMiddleware(
    mockReq(
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'inspector', version: '1.0' },
        },
        id: 1,
      },
      { authorization: 'Bearer tok' }
    )
  );
  assert.equal(nextCalled, true);
});

test('Bearer initialize with stale session passes through for real session creation', async () => {
  const { nextCalled } = await runMiddleware(
    mockReq(
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'claude', version: '1.0' },
        },
        id: 1,
      },
      { authorization: 'Bearer tok', 'mcp-session-id': 'stale-after-deploy' }
    )
  );
  assert.equal(nextCalled, true);
});

test('tools/call without auth passes through to bearerAuth', async () => {
  const { nextCalled } = await runMiddleware(
    mockReq({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'remember', arguments: { content: 'x' } },
      id: 3,
    })
  );
  assert.equal(nextCalled, true);
});
