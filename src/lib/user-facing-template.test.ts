import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildUserFacingTemplate } from './user-facing-template.js';
import { formatContextReuseSummary, formatSkillInjectedSummary } from './impact-summary.js';

describe('user-facing-template v3.2', () => {
  it('renders without emojis and with completeness copy', () => {
    const text = buildUserFacingTemplate({
      topic: 'rendering spec',
      collection: 'project:memxus',
      memoryCount: 5,
      totalMemories: 12,
      contextBlock: '[1] [NOTE] Uses MCP template v3.2',
      memoryRows: [{ id: '1', content: 'Uses MCP template v3.2' }],
      tokensUsed: 1509,
    });
    assert.ok(text);
    assert.doesNotMatch(text!, /🧠|🧩|⚡/);
    assert.doesNotMatch(text!, /━/);
    assert.match(text!, /CONTEXTO — project:memxus/);
    assert.match(text!, /5 más relevantes de 12 guardadas/);
    assert.match(text!, /^AHORRO/m);
    assert.ok(text!.includes(formatContextReuseSummary(1509)));
    assert.match(text!, /Ampliar el contexto/);
  });

  it('shows AHORRO from tokensUsed without ENABLE_IMPACT_SUMMARY structured fields', () => {
    const prev = process.env.ENABLE_IMPACT_SUMMARY;
    delete process.env.ENABLE_IMPACT_SUMMARY;
    try {
      const text = buildUserFacingTemplate({
        topic: 'api',
        memoryCount: 2,
        totalMemories: 2,
        tokensUsed: 1500,
        variant: 'plain',
      });
      assert.match(text!, /^AHORRO/m);
      assert.match(text!, /~1,500 tokens de contexto reutilizados/);
    } finally {
      if (prev === undefined) delete process.env.ENABLE_IMPACT_SUMMARY;
      else process.env.ENABLE_IMPACT_SUMMARY = prev;
    }
  });

  it('omits AHORRO when tokensUsed is zero', () => {
    const text = buildUserFacingTemplate({
      topic: 'empty',
      memoryCount: 0,
      totalMemories: 0,
      tokensUsed: 0,
      variant: 'plain',
    });
    assert.doesNotMatch(text!, /^AHORRO/m);
  });

  it('skill_load full variant shows skill savings from skillTokensUsed without skillImpactText', () => {
    const text = buildUserFacingTemplate({
      mode: 'skill_load',
      topic: 'find-skills',
      skillTokensUsed: 420,
    });
    assert.match(text!, /^AHORRO/m);
    assert.ok(text!.includes(formatSkillInjectedSummary('find-skills', 420)));
  });

  it('formats skills without icons', () => {
    const text = buildUserFacingTemplate({
      topic: 'supabase',
      collection: 'project:app',
      memoryCount: 2,
      totalMemories: 2,
      tokensUsed: 100,
      skills: [{ name: 'postgres-best-practices', reason: 'db', source: 'community' }],
      stackConfidence: 0.9,
    });
    assert.match(text!, /SKILLS SUGERIDAS/);
    assert.match(text!, /1\. postgres-best-practices \(community\) — usar en chat/);
  });

  it('omits skills when stack confidence is low', () => {
    const text = buildUserFacingTemplate({
      topic: 'x',
      memoryCount: 1,
      totalMemories: 1,
      tokensUsed: 50,
      skills: [{ name: 'skill-a', reason: 'r', source: 'official' }],
      stackConfidence: 0.3,
    });
    assert.doesNotMatch(text!, /SKILLS SUGERIDAS/);
  });

  it('shows zero-memory message', () => {
    const text = buildUserFacingTemplate({
      topic: 'missing',
      memoryCount: 0,
      totalMemories: 0,
    });
    assert.match(text!, /No encontré memorias relevantes/);
  });

  it('does not show exhausted CTA when exclude leaves more in pool', () => {
    const text = buildUserFacingTemplate({
      topic: 'v3.2 template',
      memoryCount: 2,
      totalMemories: 10,
      excludedMemoryCount: 3,
      requestedLimit: 10,
      tokensUsed: 100,
    });
    assert.match(text!, /Ampliar el contexto/);
    assert.doesNotMatch(text!, /ya mostré todas/);
  });

  it('recall limit below total does not show exhausted CTA', () => {
    const text = buildUserFacingTemplate({
      topic: 'v3.2 template',
      memoryCount: 5,
      totalMemories: 10,
      requestedLimit: 5,
      tokensUsed: 100,
    });
    assert.match(text!, /5 más relevantes de 10 guardadas/);
    assert.match(text!, /Ampliar el contexto/);
    assert.doesNotMatch(text!, /ya mostré todas/);
  });

  it('shows exhausted CTA when pool is fully shown across calls', () => {
    const text = buildUserFacingTemplate({
      topic: 'v3.2 template',
      memoryCount: 2,
      totalMemories: 5,
      excludedMemoryCount: 3,
      requestedLimit: 10,
      tokensUsed: 100,
    });
    assert.match(text!, /ya mostré todas las memorias disponibles/);
  });

  it('renders plain fallback variant with short command labels for chat surfaces', () => {
    const text = buildUserFacingTemplate({
      topic: 'api memxus',
      collection: 'project:memxus',
      memoryCount: 3,
      totalMemories: 10,
      contextBlock: '[1] [NOTE] AI Context Engine en produccion',
      memoryRows: [{ id: '1', content: 'AI Context Engine en produccion con 18 tools activas' }],
      tokensUsed: 1609,
      skills: [
        { name: 'analyze-project', reason: 'match', source: 'community' },
        { name: 'project-analyzer', reason: 'match', source: 'community' },
      ],
      stackConfidence: 0.9,
      environment: 'chat',
      variant: 'plain',
    });
    assert.match(text!, /^CONTEXTO/m);
    assert.match(text!, /Proyecto: project:memxus/);
    assert.match(text!, /^SKILLS SUGERIDAS/m);
    assert.match(text!, /1\. analyze-project \(community\)/);
    assert.match(text!, /use 1 \/ skip 1/);
    assert.match(text!, /^AHORRO/m);
    assert.match(text!, /~1,609 tokens de contexto reutilizados/);
    assert.match(text!, /^ELEGI UNA OPCION/m);
    assert.match(text!, /1\. use 1/);
    assert.match(text!, /3\. skip all/);
    assert.match(text!, /4\. ampliar contexto/);
    assert.doesNotMatch(text!, /CONTEXTO —/);
  });
});
