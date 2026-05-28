import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PLANS } from './plans.js';
import {
  clampResultLimit,
  resolveListLimit,
  resolveSearchLimit,
  buildDailyRateLimitState,
} from './plan-enforcement.js';

describe('plan-enforcement (Remote MCP)', () => {
  it('caps free list requests to plan max', () => {
    assert.equal(resolveListLimit(PLANS.free.limits, 100), 25);
  });

  it('honors pro request under cap', () => {
    assert.equal(resolveListLimit(PLANS.pro.limits, 5), 5);
  });

  it('uses API-aligned defaults when limit omitted', () => {
    assert.equal(resolveListLimit(PLANS.free.limits), 20);
    assert.equal(resolveSearchLimit(PLANS.free.limits), 10);
  });

  it('respects absolute ceiling for unlimited plan max', () => {
    assert.equal(clampResultLimit(500, -1, 20), 200);
  });

  it('builds daily rate limit state', () => {
    const state = buildDailyRateLimitState(PLANS.free.limits, 40);
    assert.equal(state.limit, 100);
    assert.equal(state.remaining, 60);
  });
});
