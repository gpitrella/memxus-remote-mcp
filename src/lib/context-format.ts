import { estimateTokens } from './estimate-tokens.js';
import type { FormattableMemory } from '../mcp/format-memory.js';

export type RetrieveMemoryRow = {
  id?: string;
  content: string;
  memory_type?: string;
  collection?: string | null;
  tags?: string[];
  scope?: string | null;
  groupName?: string | null;
  similarity?: number;
};

export function formatMcpContextMemoryLine(m: FormattableMemory, index: number): string {
  const coll = m.collection ? ` [${m.collection}]` : '';
  return `[${index + 1}] [${m.memory_type.toUpperCase()}]${coll} ${m.content}`;
}

export function formatAssemblerMemoryLine(
  m: { memory_type?: string; collection?: string | null; content: string },
  index: number
): string {
  const coll = m.collection ? ` [${m.collection}]` : '';
  const type = (m.memory_type ?? 'general').toUpperCase();
  return `[${index + 1}] [${type}]${coll} ${m.content}`;
}

export function buildMcpContextBlock(
  topic: string,
  collection: string | null | undefined,
  memories: FormattableMemory[]
): { contextBlock: string; overheadTokens: number } {
  const collLine = collection ? `Collection: ${collection}\n` : '';
  const header = [
    '=== AI Memory Context ===',
    `Topic: ${topic}`,
    collLine + `Memories retrieved: ${memories.length}`,
    '',
  ].join('\n');
  const footer = ['', '=== End of Memory Context ==='].join('\n');
  const memoryLines = memories.map((m, i) => formatMcpContextMemoryLine(m, i)).join('\n');
  const contextBlock = `${header}${memoryLines}${footer}`;

  return {
    contextBlock,
    overheadTokens: estimateTokens(`${header}\n${footer}`),
  };
}

export function buildAssemblerContextBlock(
  topic: string,
  collection: string | null | undefined,
  memories: Array<{ memory_type?: string; collection?: string | null; content: string }>
): { contextBlock: string; overheadTokens: number } {
  const collLine = collection ? `Collection: ${collection}\n` : '';
  const header = [
    '=== AI Memory Context ===',
    `Topic: ${topic}`,
    collLine + `Memories Retrieved: ${memories.length}`,
    '',
  ].join('\n');
  const footer = ['', '=== End of Memory Context ==='].join('\n');
  const memoryLines = memories.map((m, i) => formatAssemblerMemoryLine(m, i)).join('\n');
  const contextBlock = `${header}${memoryLines}${footer}`;

  return {
    contextBlock,
    overheadTokens: estimateTokens(`${header}\n${footer}`),
  };
}
