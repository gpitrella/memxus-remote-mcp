import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildUserFacingTemplate } from './user-facing-template.js';

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
    assert.match(text!, /CONTEXTO — project:memxus/);
    assert.match(text!, /5 más relevantes de 12 guardadas/);
    assert.match(text!, /~1,509 tokens de contexto reutilizados/);
    assert.match(text!, /Ampliar el contexto/);
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
});
