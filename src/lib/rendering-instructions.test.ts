import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RENDERING_INSTRUCTIONS_BRIEF,
  RENDERING_INSTRUCTIONS_FULL,
  appendRenderingInstructions,
} from './rendering-instructions.js';

describe('rendering-instructions', () => {
  it('loads non-empty rendering instructions', () => {
    assert.ok(RENDERING_INSTRUCTIONS_FULL.length > 50);
    assert.ok(RENDERING_INSTRUCTIONS_BRIEF.length > 50);
  });

  it('brief instructions describe the result without instructing the assistant', () => {
    assert.doesNotMatch(RENDERING_INSTRUCTIONS_BRIEF, /\bshow the user\b/i);
    assert.doesNotMatch(RENDERING_INSTRUCTIONS_BRIEF, /\bdo not (repeat|dump)\b/i);
    assert.doesNotMatch(RENDERING_INSTRUCTIONS_BRIEF, /\bverbatim\b/i);
  });

  it('appendRenderingInstructions extends tool description', () => {
    const base = 'Build context for a topic.';
    const out = appendRenderingInstructions(base);
    assert.ok(out.startsWith(base));
    assert.match(out, /user_facing_template/);
    assert.match(out, /exclude_memory_ids/);
  });
});
