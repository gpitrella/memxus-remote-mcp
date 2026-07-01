import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';

describe('impact-summary', () => {
  const envBackup = process.env.ENABLE_IMPACT_SUMMARY;

  afterEach(() => {
    if (envBackup === undefined) delete process.env.ENABLE_IMPACT_SUMMARY;
    else process.env.ENABLE_IMPACT_SUMMARY = envBackup;
  });

  it('formatContextReuseSummary uses approved copy with real token count', async () => {
    const { formatContextReuseSummary } = await import('./impact-summary.js');
    const text = formatContextReuseSummary(1509);
    assert.match(text, /⚡ ~1,509 tokens de contexto reutilizados/);
    assert.match(text, /no tuviste que reescribir/);
    assert.doesNotMatch(text, /Sin Memxus/);
  });

  it('formatSkillInjectedSummary uses approved copy', async () => {
    const { formatSkillInjectedSummary } = await import('./impact-summary.js');
    const text = formatSkillInjectedSummary('find-skills', 420);
    assert.match(text, /🧩 Skill 'find-skills' cargada/);
    assert.match(text, /~420 tokens de guía inyectados/);
  });

  it('buildImpactPayload returns real-token summary when flag is on', async () => {
    process.env.ENABLE_IMPACT_SUMMARY = 'true';
    const { buildImpactPayload } = await import('./impact-summary.js');
    const payload = buildImpactPayload(965);
    assert.ok(payload);
    assert.equal(payload!.impact_summary.metrics.tokensSaved, 965);
    assert.equal(payload!.impact_summary.tokens_injected, 965);
    assert.match(payload!.impact_summary_text, /~965 tokens de contexto reutilizados/);
    assert.doesNotMatch(payload!.impact_summary_text, /Sin Memxus/);
    assert.doesNotMatch(payload!.impact_summary_text, /Ahorro/);
    assert.doesNotMatch(payload!.impact_summary_text, /Agua/);
    assert.doesNotMatch(payload!.impact_summary_text, /CO₂/);
  });

  it('buildImpactPayload returns null when flag is off', async () => {
    delete process.env.ENABLE_IMPACT_SUMMARY;
    const { buildImpactPayload } = await import('./impact-summary.js');
    assert.equal(buildImpactPayload(1500), null);
  });

  it('applyImpactToContextResponse does not mutate contextBlock', async () => {
    process.env.ENABLE_IMPACT_SUMMARY = 'true';
    const { applyImpactToContextResponse } = await import('./impact-summary.js');
    const block = '## Context\n\n- memory line';
    const result = applyImpactToContextResponse(block, 965, false);
    assert.equal(result.contextBlock, block);
    assert.equal(result.tokens_used, 965);
    assert.ok(result.impact_summary);
    assert.ok(result.impact_summary_text);
    assert.doesNotMatch(result.contextBlock, /Sin Memxus/);
  });

  it('applyImpactToContextResponse omits impact when flag is off', async () => {
    delete process.env.ENABLE_IMPACT_SUMMARY;
    const { applyImpactToContextResponse } = await import('./impact-summary.js');
    const block = '## Context';
    const result = applyImpactToContextResponse(block, 1500, true);
    assert.equal(result.contextBlock, block);
    assert.equal(result.impact_summary, undefined);
  });

  it('buildSkillImpactFields returns null when flag is off', async () => {
    delete process.env.ENABLE_IMPACT_SUMMARY;
    const { buildSkillImpactFields } = await import('./impact-summary.js');
    assert.equal(buildSkillImpactFields('test-skill', 100), null);
  });
});
