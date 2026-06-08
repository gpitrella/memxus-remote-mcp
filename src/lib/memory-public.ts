// SYNC: RemoteMCP-AIMemory/src/lib/memory-public.ts

/** Strip internal vector from API/MCP responses (ChatGPT Actions payload size). */
export function toPublicMemory(row: Record<string, unknown>): Record<string, unknown> {
  const { embedding: _embedding, ...rest } = row;
  return rest;
}

export function attachGroupFields(
  row: Record<string, unknown>,
  groupNames?: Map<string, string>
): Record<string, unknown> {
  const pub = toPublicMemory(row);
  const scope = row.scope as string | undefined;
  if (scope) pub.scope = scope;
  const groupId = row.group_id as string | undefined | null;
  if (scope === 'group' && groupId) {
    pub.groupId = groupId;
    const name = groupNames?.get(groupId);
    if (name) pub.groupName = name;
  }
  return pub;
}

export function toPublicMemories(
  rows: unknown[],
  groupNames?: Map<string, string>
): Record<string, unknown>[] {
  return (rows ?? []).map((r) =>
    groupNames
      ? attachGroupFields(r as Record<string, unknown>, groupNames)
      : toPublicMemory(r as Record<string, unknown>)
  );
}

export async function enrichRowsWithGroupNames(
  rows: Record<string, unknown>[],
  fetchNames: (ids: string[]) => Promise<Map<string, string>>
): Promise<Record<string, unknown>[]> {
  const groupIds = rows
    .filter((r) => r.scope === 'group' && r.group_id)
    .map((r) => r.group_id as string);
  if (groupIds.length === 0) return toPublicMemories(rows);
  const names = await fetchNames(groupIds);
  return toPublicMemories(rows, names);
}
