// SYNC: API-IAMemory/src/lib/memory-public.ts

/** Strip internal vector from API/MCP responses (ChatGPT Actions payload size). */
export function toPublicMemory(row: Record<string, unknown>): Record<string, unknown> {
  const { embedding: _embedding, ...rest } = row;
  return rest;
}

export function toPublicMemories(rows: unknown[]): Record<string, unknown>[] {
  return (rows ?? []).map((r) => toPublicMemory(r as Record<string, unknown>));
}
