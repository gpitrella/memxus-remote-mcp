import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeCreateWelcomeMemory } from './welcome.js';
import type { MemoryRow } from './memory-types.js';
import type { getStats, saveMemory } from './tools.js';

function statsWithTotal(total: number) {
  return { total, byType: {}, byCollection: {} };
}

const SAVED_MEMORY: MemoryRow = {
  id: 'mem-1',
  user_id: 'user-1',
  content: 'welcome content',
  memory_type: 'general',
  importance: 0.3,
  tags: ['system_welcome'],
  collection: null,
  thread_id: null,
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

test('maybeCreateWelcomeMemory: creates a tagged welcome memory when the user has 0 memories', async () => {
  let saveCalls: Parameters<typeof saveMemory>[0][] = [];
  const deps = {
    getStats: (async () => statsWithTotal(0)) as typeof getStats,
    saveMemory: (async (p) => {
      saveCalls.push(p);
      return SAVED_MEMORY;
    }) as typeof saveMemory,
  };

  const result = await maybeCreateWelcomeMemory('user-1', undefined, deps);

  assert.equal(result, SAVED_MEMORY);
  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0].userId, 'user-1');
  assert.deepEqual(saveCalls[0].tags, ['system_welcome']);
  assert.equal(saveCalls[0].type, 'general');
});

test('maybeCreateWelcomeMemory: no-op once the user has any real memory', async () => {
  let saveCalled = false;
  const deps = {
    getStats: (async () => statsWithTotal(3)) as typeof getStats,
    saveMemory: (async () => {
      saveCalled = true;
      return SAVED_MEMORY;
    }) as typeof saveMemory,
  };

  const result = await maybeCreateWelcomeMemory('user-1', undefined, deps);

  assert.equal(result, null);
  assert.equal(saveCalled, false);
});

test('maybeCreateWelcomeMemory: race guard — a second getStats seeing memories skips the insert', async () => {
  let call = 0;
  let saveCalled = false;
  const deps = {
    getStats: (async () => {
      call += 1;
      return statsWithTotal(call === 1 ? 0 : 1); // first check: 0, recheck: 1 (raced)
    }) as typeof getStats,
    saveMemory: (async () => {
      saveCalled = true;
      return SAVED_MEMORY;
    }) as typeof saveMemory,
  };

  const result = await maybeCreateWelcomeMemory('user-1', undefined, deps);

  assert.equal(result, null);
  assert.equal(saveCalled, false);
  assert.equal(call, 2);
});

test('maybeCreateWelcomeMemory: passes workforceWorkspaceId through to both getStats and saveMemory', async () => {
  const seenWsIds: (string | undefined)[] = [];
  const deps = {
    getStats: (async (_userId: string, wsId?: string) => {
      seenWsIds.push(wsId);
      return statsWithTotal(0);
    }) as typeof getStats,
    saveMemory: (async (p) => {
      seenWsIds.push(p.workforceWorkspaceId);
      return SAVED_MEMORY;
    }) as typeof saveMemory,
  };

  await maybeCreateWelcomeMemory('user-1', 'ws-1', deps);

  assert.deepEqual(seenWsIds, ['ws-1', 'ws-1', 'ws-1']);
});
