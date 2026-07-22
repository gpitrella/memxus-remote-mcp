import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { supabase } from './supabase.js';
import { recordClientSession } from './client-sessions.js';
import type { McpHandshakeContext } from './skill-capabilities.js';

function handshakeWith(clientInfo?: { name?: string; version?: string }): McpHandshakeContext {
  return { clientInfo };
}

test('recordClientSession: inserts with the right fields when clientInfo is present', async (t) => {
  let insertedRow: Record<string, unknown> | undefined;
  const spy = mock.method(supabase, 'from', () => ({
    insert: async (row: Record<string, unknown>) => {
      insertedRow = row;
      return { data: null, error: null };
    },
  }));
  t.after(() => spy.mock.restore());

  recordClientSession('user-1', handshakeWith({ name: 'claude-ai', version: '1.2.3' }), 'sess-1', false);

  // insert() runs inside a fire-and-forget async IIFE; flush microtasks.
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(insertedRow, {
    user_id: 'user-1',
    client_name: 'claude-ai',
    client_version: '1.2.3',
    mcp_session_id: 'sess-1',
    stateless: false,
  });
});

test('recordClientSession: no clientInfo.name -> never touches the DB', async (t) => {
  const spy = mock.method(supabase, 'from', () => {
    throw new Error('should not query DB without clientInfo.name');
  });
  t.after(() => spy.mock.restore());

  assert.doesNotThrow(() => {
    recordClientSession('user-1', handshakeWith(undefined));
    recordClientSession('user-1', handshakeWith({ version: '1.0.0' })); // name missing
    recordClientSession('user-1', undefined);
  });

  await new Promise((r) => setImmediate(r));
});

test('recordClientSession: Supabase insert error is caught, does not throw', async (t) => {
  const spy = mock.method(supabase, 'from', () => ({
    insert: async () => ({ data: null, error: { message: 'boom' } }),
  }));
  t.after(() => spy.mock.restore());

  assert.doesNotThrow(() => {
    recordClientSession('user-1', handshakeWith({ name: 'cursor' }));
  });

  await new Promise((r) => setImmediate(r));
});
