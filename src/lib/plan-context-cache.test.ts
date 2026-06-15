import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCachedPlanContext,
  invalidatePlanContextCache,
  isPlanContextCacheEnabled,
  setCachedPlanContext,
  _test,
} from './plan-context-cache.js';
import type { UserPlanContext } from './plan-enforcement.js';
import { PLANS } from './plans.js';

function makeCtx(userId: string, memoryCount = 10, dailyUsage = 5): UserPlanContext {
  return {
    userId,
    planId: 'free',
    subscriptionStatus: null,
    plan: PLANS.free,
    limits: PLANS.free.limits,
    memoryCount,
    dailyUsage,
    planWarnings: { level: 'none', warnings: [], message: null },
  };
}

test.afterEach(() => {
  _test.clearPlanContextCache();
  _test.setCacheEnabledOverride(undefined);
  _test.setCacheTtlOverrideMs(undefined);
  _test.setCacheMaxEntriesOverride(undefined);
});

test('plan context cache is enabled by default', () => {
  _test.setCacheEnabledOverride(undefined);
  assert.equal(isPlanContextCacheEnabled(), true);
});

test('stores and retrieves plan context', () => {
  const ctx = makeCtx('user-1', 42, 7);
  setCachedPlanContext('user-1', ctx);
  const hit = getCachedPlanContext('user-1');
  assert.ok(hit);
  assert.equal(hit?.memoryCount, 42);
  assert.equal(hit?.dailyUsage, 7);
});

test('returns null for expired plan context', async () => {
  _test.setCacheTtlOverrideMs(5);
  setCachedPlanContext('user-1', makeCtx('user-1'));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(getCachedPlanContext('user-1'), null);
});

test('invalidatePlanContextCache removes entry', () => {
  setCachedPlanContext('user-1', makeCtx('user-1'));
  invalidatePlanContextCache('user-1');
  assert.equal(getCachedPlanContext('user-1'), null);
});

test('does not cache when disabled', () => {
  _test.setCacheEnabledOverride(false);
  setCachedPlanContext('user-1', makeCtx('user-1'));
  assert.equal(getCachedPlanContext('user-1'), null);
  assert.equal(_test.getCacheSize(), 0);
});
