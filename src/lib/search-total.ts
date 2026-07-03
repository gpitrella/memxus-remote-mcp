/** Resolve eligible-memory total for context completeness (v3.2). */

export function resolveSearchTotal(
  countResult: number | null,
  returnedCount: number,
): number {
  if (returnedCount === 0) return 0;
  if (countResult != null && Number.isFinite(countResult)) {
    return Math.max(countResult, returnedCount);
  }
  return returnedCount;
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
