import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';

describe('user-facing-template', () => {
  const envBackup = process.env.ENABLE_IMPACT_SUMMARY;

  afterEach(() => {
    if (envBackup === undefined) delete process.env.ENABLE_IMPACT_SUMMARY;
    else process.env.ENABLE_IMPACT_SUMMARY = envBackup;
  });

  it('returns null when flag is off and no skill impact', async () => {
    delete process.env.ENABLE_IMPACT_SUMMARY;
    const { buildUserFacingTemplate } = await import('./user-facing-template.js');
    assert.equal(
      buildUserFacingTemplate({
        topic: 'test',
        collection: 'project:memxus',
        memoryCount: 2,
        impactSummaryText: '⚡ ~100 tokens',
      }),
      null,
    );
  });

  it('includes context, ahorro and separators when flag is on', async () => {
    process.env.ENABLE_IMPACT_SUMMARY = 'true';
    const { buildUserFacingTemplate } = await import('./user-facing-template.js');
    const text = buildUserFacingTemplate({
      topic: 'rendering spec',
      collection: 'project:memxus',
      memoryCount: 3,
      impactSummaryText:
        '⚡ ~1,509 tokens de contexto reutilizados — Contexto de tu proyecto que Memxus recuperó y no tuviste que reescribir.',
    });
    assert.ok(text);
    assert.match(text!, /MEMXUS — Resumen para el usuario/);
    assert.match(text!, /🧠 CONTEXTO — project:memxus/);
    assert.match(text!, /Recuperé 3 memorias/);
    assert.match(text!, /~1,509 tokens de contexto reutilizados/);
    assert.doesNotMatch(text!, /Sin Memxus/);
    assert.match(text!, /¿Qué querés hacer/);
  });

  it('omits skills when stack confidence is low', async () => {
    process.env.ENABLE_IMPACT_SUMMARY = 'true';
    const { buildUserFacingTemplate } = await import('./user-facing-template.js');
    const text = buildUserFacingTemplate({
      topic: 'nextjs',
      collection: 'project:app',
      memoryCount: 1,
      stackConfidence: 0.3,
      skills: [{ name: 'test-skill', reason: 'for testing', source: 'official' }],
      impactSummaryText: '⚡ ~50 tokens de contexto reutilizados — Contexto de tu proyecto que Memxus recuperó y no tuviste que reescribir.',
    });
    assert.ok(text);
    assert.doesNotMatch(text!, /SKILLS SUGERIDAS/);
  });

  it('includes at most 2 skills when confidence is high', async () => {
    process.env.ENABLE_IMPACT_SUMMARY = 'true';
    const { buildUserFacingTemplate } = await import('./user-facing-template.js');
    const text = buildUserFacingTemplate({
      topic: 'nextjs',
      collection: 'project:app',
      memoryCount: 2,
      stackConfidence: 0.85,
      skills: [
        { name: 'skill-a', reason: 'reason a', source: 'official' },
        { name: 'skill-b', reason: 'reason b', source: 'community' },
        { name: 'skill-c', reason: 'reason c', source: 'official' },
      ],
      impactSummaryText: '⚡ ~50 tokens de contexto reutilizados — Contexto de tu proyecto que Memxus recuperó y no tuviste que reescribir.',
    });
    assert.ok(text);
    assert.match(text!, /\[1\] skill-a/);
    assert.match(text!, /\[2\] skill-b/);
    assert.doesNotMatch(text!, /skill-c/);
    assert.match(text!, /install 1/);
  });

  it('skill_load mode shows skill impact text', async () => {
    process.env.ENABLE_IMPACT_SUMMARY = 'true';
    const { buildUserFacingTemplate } = await import('./user-facing-template.js');
    const text = buildUserFacingTemplate({
      mode: 'skill_load',
      topic: 'find-skills',
      skillImpactText:
        "🧩 Skill 'find-skills' cargada — ~420 tokens de guía inyectados — Mejores prácticas que el LLM ahora conoce sin gastar la conversación en definirlas.",
    });
    assert.ok(text);
    assert.match(text!, /find-skills/);
    assert.doesNotMatch(text!, /CONTEXTO —/);
  });
});
