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

  it('appendRenderingInstructions extends tool description', () => {
    const base = 'Build context for a topic.';
    const out = appendRenderingInstructions(base);
    assert.ok(out.startsWith(base));
    assert.match(out, /memxus-rendering-instructions/);
    assert.match(out, /impact_summary_text/);
  });
});
