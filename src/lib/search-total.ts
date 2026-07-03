/** Resolve eligible-memory total for context completeness (v3.2). */

export type ResolveSearchTotalOptions = {
  candidateFloor?: number;
};

export function resolveSearchTotal(
  countResult: number | null,
  returnedCount: number,
  opts?: ResolveSearchTotalOptions,
): number {
  if (returnedCount === 0) return 0;
  const floor = Math.max(returnedCount, opts?.candidateFloor ?? 0);
  if (countResult != null && Number.isFinite(countResult) && countResult > 0) {
    return Math.max(countResult, floor);
  }
  return floor;
}

export function isContextPoolExhausted(input: {
  returnedCount: number;
  total: number;
  excludedCount: number;
  requestedLimit: number;
}): boolean {
  if (input.total <= 0 || input.returnedCount <= 0) return false;
  const shownAcrossCalls = input.returnedCount + input.excludedCount;
  return shownAcrossCalls >= input.total;
}
