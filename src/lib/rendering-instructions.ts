import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

const EMBEDDED_FALLBACK = [
  'After calling this tool, render the user response per memxus-rendering-instructions:',
  '1) One-line CONTEXT 2) SKILLS (max 2, skip if low confidence) 3) AHORRO from impact_summary_text when present',
  '4) Actionable question. Do not dump raw context_block. Chat: use N|skip N. Editor: use N|install N|skip N.',
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

export const RENDERING_INSTRUCTIONS_BRIEF =
  'After this tool returns, show the user the pre-rendered block at the end of the tool result verbatim (user_facing_template). Do not repeat the raw context_block. Expand context: if count < total, recall/get_context with exclude_memory_ids + higher max_memories; if count === total, say no more memories without calling the server. Skills: use N → use_skill_in_chat, install N → install_skill, skip N → skip_skill.';

export function appendRenderingInstructions(description: string): string {
  return `${description} ${RENDERING_INSTRUCTIONS_BRIEF}`;
}
