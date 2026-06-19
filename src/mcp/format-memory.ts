/** Public memory fields used in MCP text formatting (no embedding). */
export interface FormattableMemory {
  id: string;
  memory_type: string;
  importance: number;
  tags: string[];
  collection: string | null;
  content: string;
  created_at: string;
}

export function formatMemoryLine(m: FormattableMemory, i: number, verbose = true): string {
  const coll = m.collection ? ` | Collection: ${m.collection}` : '';
  if (!verbose) {
    return `[${i + 1}] ID: ${m.id}\n[${m.memory_type}] ${m.content.slice(0, 120)}${m.content.length > 120 ? '...' : ''}\nTags: ${m.tags.join(', ') || 'none'}${coll} | ${new Date(m.created_at).toLocaleDateString()}`;
  }
  return `[${i + 1}] ID: ${m.id}\nType: ${m.memory_type} | Importance: ${m.importance}\nTags: ${m.tags.join(', ') || 'none'}${coll}\n${m.content}\nSaved: ${new Date(m.created_at).toLocaleDateString()}`;
}

export function formatRememberText(m: FormattableMemory): string {
  return `Remembered (ID: ${m.id})\nType: ${m.memory_type}\nCollection: ${m.collection || 'none'}\nTags: ${m.tags.join(', ') || 'none'}\nImportance: ${m.importance}`;
}

export function formatGetMemoryText(m: FormattableMemory): string {
  return [
    `ID: ${m.id}`,
    `Type: ${m.memory_type}`,
    `Collection: ${m.collection || 'none'}`,
    `Tags: ${m.tags.join(', ') || 'none'}`,
    `Importance: ${m.importance}`,
    `Saved: ${new Date(m.created_at).toISOString()}`,
    '',
    m.content,
  ].join('\n');
}

export function formatContextBlock(
  topic: string,
  collection: string | null | undefined,
  ms: FormattableMemory[]
): string {
  const collLine = collection ? `Collection: ${collection}\n` : '';
  return [
    '=== AI Memory Context ===',
    `Topic: ${topic}`,
    collLine + `Memories retrieved: ${ms.length}`,
    '',
    ...ms.map((m, i) => {
      const coll = m.collection ? ` [${m.collection}]` : '';
      return `[${i + 1}] [${m.memory_type.toUpperCase()}]${coll} ${m.content}`;
    }),
    '',
    '=== End of Memory Context ===',
  ].join('\n');
}

export function formatMemoryStatsText(s: {
  total: number;
  byType: Record<string, number>;
  byCollection: Record<string, number>;
  storageBytesUsed?: number;
  storageBytesLimit?: number;
}): string {
  const typeBreakdown = Object.entries(s.byType)
    .map(([t, c]) => `  ${t}: ${c}`)
    .join('\n');
  const collBreakdown = Object.entries(s.byCollection)
    .map(([t, c]) => `  ${t}: ${c}`)
    .join('\n');
  const storageLine =
    s.storageBytesUsed != null
      ? `\nStorage: ${formatBytes(s.storageBytesUsed)}${
          s.storageBytesLimit != null && s.storageBytesLimit !== -1
            ? ` / ${formatBytes(s.storageBytesLimit)}`
            : s.storageBytesLimit === -1
              ? ' (unlimited)'
              : ''
        }`
      : '';
  return `Memory Statistics\n\nTotal: ${s.total}${storageLine}\n\nBy type:\n${typeBreakdown || '  (none)'}\n\nBy collection:\n${collBreakdown || '  (none)'}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
