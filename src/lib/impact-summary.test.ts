import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';

describe('impact-summary', () => {
  const envBackup = process.env.ENABLE_IMPACT_SUMMARY;

  afterEach(() => {
    if (envBackup === undefined) delete process.env.ENABLE_IMPACT_SUMMARY;
    else process.env.ENABLE_IMPACT_SUMMARY = envBackup;
  });

  it('estimateTokensSaved subtracts overhead conservatively', async () => {
    const { estimateTokensSaved } = await import('./impact-summary.js');
    assert.equal(estimateTokensSaved(1500), 1380);
    assert.equal(estimateTokensSaved(50), 0);
  });

  it('applyImpactToContextResponse appends table when enabled', async () => {
    process.env.ENABLE_IMPACT_SUMMARY = 'true';
    const { applyImpactToContextResponse } = await import('./impact-summary.js');
    const block = '## Context\n\n- memory line';
    const result = applyImpactToContextResponse(block, 1500, false);
    assert.ok(result.contextBlock.includes('## Esta sesión, Memxus te ahorró'));
    assert.equal(result.tokens_used, 1500);
    assert.ok(result.impact_summary_text);
  });

  it('buildImpactPayload returns null when flag is off', async () => {
    delete process.env.ENABLE_IMPACT_SUMMARY;
    const { buildImpactPayload } = await import('./impact-summary.js');
    assert.equal(buildImpactPayload(1500), null);
  });
});
