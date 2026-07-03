import { createHash } from 'node:crypto';

export type BulletMemoryInput = {
  id: string;
  content: string;
  updated_at?: string | null;
  similarity?: number | null;
};

export type ExtractBulletsInput = {
  contextBlock: string;
  memories: BulletMemoryInput[];
  maxBullets?: number;
};

function normalizeContentHash(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(normalized).digest('hex');
}

export function sanitizeBulletText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateWords(text: string, maxWords = 20): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(' ')}…`;
}

function compareMemories(a: BulletMemoryInput, b: BulletMemoryInput): number {
  const simA = a.similarity ?? 0;
  const simB = b.similarity ?? 0;
  if (simB !== simA) return simB - simA;

  const dateA = a.updated_at ? Date.parse(a.updated_at) : 0;
  const dateB = b.updated_at ? Date.parse(b.updated_at) : 0;
  if (dateB !== dateA) return dateB - dateA;

  return a.id.localeCompare(b.id);
}

function extractFromContextBlock(contextBlock: string): string[] {
  const lines = contextBlock.split('\n');
  const fragments: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('===')) continue;

    const numbered = trimmed.match(/^\[\d+\]\s*(?:\[[^\]]+\]\s*)*(.*)$/);
    const body = numbered?.[1]?.trim() ?? trimmed;
    if (body.length < 8) continue;

    const sentences = body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    for (const sentence of sentences.length > 0 ? sentences : [body]) {
      const clean = sanitizeBulletText(sentence);
      if (clean.length >= 8) fragments.push(truncateWords(clean));
    }
  }

  return fragments;
}

/**
 * Extract 1–3 literal bullets from the summarized context_block (anti-hallucination).
 */
export function extractContextBullets(input: ExtractBulletsInput): string[] {
  const maxBullets = input.maxBullets ?? 3;
  if (maxBullets <= 0 || input.memories.length === 0) return [];

  const sorted = [...input.memories].sort(compareMemories);
  const seenHashes = new Set<string>();
  const bullets: string[] = [];

  const blockFragments = extractFromContextBlock(input.contextBlock);
  const pool: string[] = [];

  for (const memory of sorted) {
    const snippet = sanitizeBulletText(memory.content.slice(0, 400));
    if (snippet.length >= 8) {
      pool.push(truncateWords(snippet));
    }
  }

  for (const fragment of [...blockFragments, ...pool]) {
    if (bullets.length >= maxBullets) break;
    const hash = normalizeContentHash(fragment);
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);
    bullets.push(fragment);
  }

  return bullets.slice(0, maxBullets);
}

export function formatContextCompletenessLine(
  count: number,
  total: number,
  topic: string,
): string {
  const subject = topic.trim() || 'este tema';
  if (total === 0 || count === 0) {
    return `No encontré memorias relevantes para "${subject}".`;
  }
  if (count === 1 && total === 1) {
    return `Recuperé la única memoria que tengo guardada sobre "${subject}".`;
  }
  if (count === total) {
    const label = total === 1 ? '1 memoria' : `${total} memorias`;
    return `Recuperé las ${label} que tengo guardadas sobre "${subject}".`;
  }
  return `Recuperé las ${count} más relevantes de ${total} guardadas sobre "${subject}".`;
}
