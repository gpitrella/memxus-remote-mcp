import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

const EMBEDDED_FALLBACK = [
  'Response shape per memxus-rendering-instructions:',
  '1) One-line CONTEXT 2) AHORRO from impact_summary_text when present',
  '3) Actionable question, built from user_facing_template rather than the raw context_block.',
].join(' ');

const CANDIDATE_PATHS = [
  join(__dir, '../../../../memxus-rendering-instructions.md'),
  join(__dir, '../../../memxus-rendering-instructions.md'),
];

function loadRenderingMarkdown(): string {
  for (const path of CANDIDATE_PATHS) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf8');
    }
  }
  return EMBEDDED_FALLBACK;
}

export const RENDERING_INSTRUCTIONS_FULL = loadRenderingMarkdown();

/** Declarative: describes what the result contains, never instructs the assistant. */
export const RENDERING_INSTRUCTIONS_BRIEF =
  'The result includes a pre-rendered user_facing_template for display, alongside the raw context_block. When count is less than total, further memories are available: pass exclude_memory_ids with a higher max_memories to retrieve them. When count equals total, the result is complete.';

export function appendRenderingInstructions(description: string): string {
  return `${description} ${RENDERING_INSTRUCTIONS_BRIEF}`;
}
