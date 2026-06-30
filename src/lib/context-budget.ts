import { estimateTokens } from './estimate-tokens.js';

export type BudgetMemory = {
  content: string;
  similarity?: number;
};

const MIN_TRUNCATED_CHARS = 50;

export function clampTokenBudget(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(200, Math.min(8000, Math.floor(value)));
}

export function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function sortBySimilarityDesc<T extends BudgetMemory>(memories: T[]): T[] {
  const hasSimilarity = memories.some((m) => typeof m.similarity === 'number');
  if (!hasSimilarity) return memories;
  return [...memories].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
}

export function trimMemoriesToTokenBudget<T extends BudgetMemory>(
  memories: T[],
  maxTokensBudget: number,
  formatLine: (m: T, index: number) => string,
  overheadTokens = 0
): { memories: T[]; tokensUsed: number; truncated: boolean } {
  const budget = Math.max(1, maxTokensBudget - overheadTokens);
  const sorted = sortBySimilarityDesc(memories);
  const included: T[] = [];
  let memoryTokens = 0;
  let truncated = false;

  for (const m of sorted) {
    const line = formatLine(m, included.length);
    const lineTokens = estimateTokens(`${line}\n`);

    if (memoryTokens + lineTokens <= budget) {
      included.push(m);
      memoryTokens += lineTokens;
      continue;
    }

    const remainingTokens = budget - memoryTokens;
    if (remainingTokens <= 0) {
      truncated = true;
      break;
    }

    const maxChars = Math.max(MIN_TRUNCATED_CHARS, remainingTokens * 4 - 24);
    const truncatedMem = { ...m, content: `${m.content.slice(0, maxChars)}…` };
    const truncLine = formatLine(truncatedMem, included.length);
    included.push(truncatedMem);
    memoryTokens += estimateTokens(`${truncLine}\n`);
    truncated = true;
    break;
  }

  if (included.length < sorted.length) {
    truncated = true;
  }

  return {
    memories: included,
    tokensUsed: memoryTokens + overheadTokens,
    truncated,
  };
}
