import type { FormattableMemory } from './format-memory.js';

export type ToolSuccessResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
};

export function toStructuredMemory(m: FormattableMemory): Record<string, unknown> {
  return {
    id: m.id,
    memory_type: m.memory_type,
    content: m.content,
    importance: m.importance,
    tags: m.tags,
    collection: m.collection ?? '',
    created_at: m.created_at,
  };
}

export function toStructuredMemories(ms: FormattableMemory[]): Record<string, unknown>[] {
  return ms.map(toStructuredMemory);
}

export function toolSuccess(text: string, structured: Record<string, unknown>): ToolSuccessResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent: structured,
  };
}
