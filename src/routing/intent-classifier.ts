import type { Intent } from './types.js';

const INTENT_PATTERNS: Array<{ action: string; patterns: RegExp[] }> = [
  { action: 'fix', patterns: [/\bfix\b/i, /\bbug\b/i, /\berror\b/i, /\bdebug\b/i] },
  { action: 'build', patterns: [/\bbuild\b/i, /\bimplement\b/i, /\badd\b/i, /\bcreate\b/i] },
  { action: 'review', patterns: [/\breview\b/i, /\baudit\b/i, /\bpr\b/i, /pull request/i] },
  { action: 'refactor', patterns: [/\brefactor\b/i, /\bclean\b/i, /\brestructure\b/i] },
  { action: 'document', patterns: [/\bdocument\b/i, /\bspec\b/i, /\bwrite docs\b/i] },
  { action: 'design', patterns: [/\bdesign\b/i, /\barchitecture\b/i, /\bplan\b/i] },
  { action: 'analyze', patterns: [/\banalyze\b/i, /\binvestigate\b/i, /\bunderstand\b/i] },
  { action: 'plan', patterns: [/\bplan\b/i, /\broadmap\b/i, /\bstrategy\b/i] },
];

export function classifyIntent(query: string): Intent {
  const trimmed = query.trim();
  let bestAction = 'analyze';
  let bestScore = 0;

  for (const { action, patterns } of INTENT_PATTERNS) {
    let score = 0;
    for (const p of patterns) {
      if (p.test(trimmed)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  const target = trimmed.slice(0, 120) || 'current task';
  const confidence = bestScore === 0 ? 0.3 : Math.min(0.95, 0.4 + bestScore * 0.15);
  return { action: bestAction, target, confidence };
}
