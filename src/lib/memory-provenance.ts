/**
 * Derive a human-readable `source` (provenance) for a memory item — spec:
 * memory-trust-provenance §2. Informative only: helps the consuming agent/user
 * judge how much to trust an item. NEVER used for authorization or scoping.
 *
 * Derived purely from tags already present on the memory (no new DB field, no
 * extra query): connector syncs tag github/notion, and workforce writes are
 * auto-tagged workspace:<slug> (see saveMemory / routes/memories.ts).
 */
export function deriveMemorySource(tags: string[] | null | undefined): string {
  const t = tags ?? [];
  // Checked first: onboarding-created memories must be identifiable regardless
  // of any other tag (e.g. if later moved into a workforce workspace), so real
  // activation metrics can exclude them (see src/mcp/welcome.ts).
  if (t.includes('system_welcome')) return 'system_welcome';
  if (t.includes('github')) return 'github';
  if (t.includes('notion')) return 'notion';
  const workspaceTag = t.find((tag) => tag.startsWith('workspace:'));
  if (workspaceTag) return `workforce:${workspaceTag.slice('workspace:'.length)}`;
  return 'manual';
}
