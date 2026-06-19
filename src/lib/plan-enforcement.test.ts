import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PLANS } from './plans.js';
import {
  clampResultLimit,
  resolveListLimit,
  resolveSearchLimit,
  buildDailyRateLimitState,
  buildPlanWarningState,
  getRetentionCutoffIso,
  isPlanWarningsEnabled,
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
    assert.equal(state.limit, 150);
    assert.equal(state.remaining, 110);
  });

  it('builds approaching memory warning at 80%', () => {
    const prev = process.env.ENABLE_PLAN_WARNINGS;
    process.env.ENABLE_PLAN_WARNINGS = 'true';
    const state = buildPlanWarningState(PLANS.free.limits, 32, 0, 'Free');
    assert.equal(state.level, 'approaching');
    assert.equal(state.warnings.length, 1);
    process.env.ENABLE_PLAN_WARNINGS = prev;
  });

  it('returns none when plan warnings disabled', () => {
    const prev = process.env.ENABLE_PLAN_WARNINGS;
    delete process.env.ENABLE_PLAN_WARNINGS;
    assert.equal(isPlanWarningsEnabled(), false);
    const state = buildPlanWarningState(PLANS.free.limits, 36, 100, 'Free');
    assert.equal(state.level, 'none');
    process.env.ENABLE_PLAN_WARNINGS = prev;
  });

  it('getRetentionCutoffIso returns null for unlimited', () => {
    assert.equal(getRetentionCutoffIso(-1), null);
  });
});
