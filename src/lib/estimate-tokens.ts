/** Rough token estimate (~4 chars per token). Same formula as API-IAMemory embedding service. */
export function estimateTokens(text: string): number {
  return Math.ceil((text ?? '').length / 4);
}
