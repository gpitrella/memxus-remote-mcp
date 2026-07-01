import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';

describe('impact-summary', () => {
  const envBackup = process.env.ENABLE_IMPACT_SUMMARY;

  afterEach(() => {
    if (envBackup === undefined) delete process.env.ENABLE_IMPACT_SUMMARY;
    else process.env.ENABLE_IMPACT_SUMMARY = envBackup;
  });

  it('estimateBaselineWithoutMemxus uses exploration floor and skills overhead', async () => {
    const { estimateBaselineWithoutMemxus, EXPLORATION_OVERHEAD_TOKENS, SKILLS_DISCOVERY_OVERHEAD_TOKENS } =
      await import('./impact-summary.js');
    const withoutSkills = estimateBaselineWithoutMemxus(965, { memoryBankTokens: 800 });
    assert.equal(withoutSkills.tokensWithoutMemxus, EXPLORATION_OVERHEAD_TOKENS);
    assert.equal(withoutSkills.tokensSaved, EXPLORATION_OVERHEAD_TOKENS - 965);

    const withSkills = estimateBaselineWithoutMemxus(965, {
      memoryBankTokens: 800,
      skillsIncluded: true,
    });
    assert.equal(
      withSkills.tokensWithoutMemxus,
      EXPLORATION_OVERHEAD_TOKENS + SKILLS_DISCOVERY_OVERHEAD_TOKENS
    );
    assert.equal(withSkills.tokensSaved, 3335);
  });

  it('formatImpactComparisonTable shows sin vs con columns without env metrics', async () => {
    process.env.ENABLE_IMPACT_SUMMARY = 'true';
    const { buildImpactPayload } = await import('./impact-summary.js');
    const payload = buildImpactPayload(965, { memoryBankTokens: 800, skillsIncluded: true });
    assert.ok(payload);
    const text = payload!.impact_summary_text;
    assert.match(text, /## Esta sesión: Memxus vs sin Memxus/);
    assert.match(text, /Sin Memxus \(est\.\)/);
    assert.match(text, /Con Memxus/);
    assert.match(text, /Ahorro/);
    assert.doesNotMatch(text, /Agua/);
    assert.doesNotMatch(text, /CO₂/);
    assert.doesNotMatch(text, /Electricidad/);
    assert.ok(payload!.impact_summary.comparison);
    assert.equal(payload!.impact_summary.rows.length, 1);
  });

  it('buildImpactPayload returns null when flag is off', async () => {
    delete process.env.ENABLE_IMPACT_SUMMARY;
    const { buildImpactPayload } = await import('./impact-summary.js');
    assert.equal(buildImpactPayload(1500), null);
  });

  it('applyImpactToContextResponse appends comparison when enabled', async () => {
    process.env.ENABLE_IMPACT_SUMMARY = 'true';
    const { applyImpactToContextResponse } = await import('./impact-summary.js');
    const block = '## Context\n\n- memory line';
    const result = applyImpactToContextResponse(block, 965, false, {
      memoryBankTokens: 800,
      skillsIncluded: true,
    });
    assert.ok(result.contextBlock.startsWith(block));
    assert.ok(result.contextBlock.includes('## Esta sesión: Memxus vs sin Memxus'));
    assert.equal(result.tokens_used, 965);
    assert.ok(result.impact_summary);
    assert.ok(result.impact_summary_text);
  });

  it('applyImpactToContextResponse omits impact when flag is off', async () => {
    delete process.env.ENABLE_IMPACT_SUMMARY;
    const { applyImpactToContextResponse } = await import('./impact-summary.js');
    const block = '## Context';
    const result = applyImpactToContextResponse(block, 1500, true);
    assert.equal(result.contextBlock, block);
    assert.equal(result.impact_summary, undefined);
  });
});
