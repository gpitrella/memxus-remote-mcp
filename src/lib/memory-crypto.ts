/**
 * Memory encryption/decryption boundary layer.
 * Handles content + metadata encryption transparently.
 * SYNC: RemoteMCP-AIMemory/src/lib/memory-crypto.ts
 */

import {
  decryptString,
  encryptString,
  isEncrypted,
  isEncryptionEnabled,
  isMetadataEncryptionEnabled,
} from './encryption.js';
import { resolveDekForMemory, resolveDekForReader } from './dek.js';

export interface MemoryRowMinimal {
  id?: string;
  user_id: string;
  scope: string;
  group_id?: string | null;
  workforce_workspace_id?: string | null;
  content?: string;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

// ─── Write path ───────────────────────────────────────────────────────────────

/**
 * Encrypt content (and optionally metadata) before DB write.
 * Returns a new object with encrypted fields. Does NOT mutate input.
 * Anti-double-encrypt: skips if already encrypted.
 */
export async function prepareContentForStorage(
  content: string,
  metadata: Record<string, unknown> | null | undefined,
  row: { user_id: string; scope: string; group_id?: string | null; workforce_workspace_id?: string | null }
): Promise<{ content: string; metadata: Record<string, unknown> | null }> {
  if (!isEncryptionEnabled()) {
    return { content, metadata: metadata ?? null };
  }

  if (isEncrypted(content)) {
    return { content, metadata: metadata ?? null };
  }

  const dek = await resolveDekForMemory(row);
  const encryptedContent = encryptString(dek, content);

  let encryptedMetadata: Record<string, unknown> | null = metadata ?? null;
  if (isMetadataEncryptionEnabled() && metadata && Object.keys(metadata).length > 0) {
    if (!metadata._enc) {
      const metaJson = JSON.stringify(metadata);
      encryptedMetadata = { _enc: encryptString(dek, metaJson) };
    }
  }

  return { content: encryptedContent, metadata: encryptedMetadata };
}

/**
 * Prepare a partial patch for DB update (only encrypts fields present in patch).
 */
export async function preparePatchForStorage(
  patch: Record<string, unknown>,
  row: { user_id: string; scope: string; group_id?: string | null; workforce_workspace_id?: string | null }
): Promise<Record<string, unknown>> {
  if (!isEncryptionEnabled()) return patch;

  const result = { ...patch };

  if (typeof result.content === 'string' && !isEncrypted(result.content as string)) {
    const dek = await resolveDekForMemory(row);
    result.content = encryptString(dek, result.content as string);
  }

  if (isMetadataEncryptionEnabled() && result.metadata) {
    const meta = result.metadata as Record<string, unknown>;
    if (meta && !meta._enc && Object.keys(meta).length > 0) {
      const dek = await resolveDekForMemory(row);
      result.metadata = { _enc: encryptString(dek, JSON.stringify(meta)) };
    }
  }

  return result;
}

// ─── Read path ────────────────────────────────────────────────────────────────

/**
 * Decrypt a single memory row. Returns a new object with plaintext fields.
 * Fail-closed: returns null if decryption fails.
 */
export async function decryptMemoryRow<T extends MemoryRowMinimal>(
  row: T,
  readerUserId: string
): Promise<T | null> {
  if (!row.content || !isEncrypted(row.content)) {
    return decryptMetadataOnly(row, readerUserId);
  }

  try {
    const dek = await resolveDekForReader(row, readerUserId);
    if (!dek) {
      console.warn(`[memory-crypto] No DEK available for reader=${readerUserId} memory=${row.id}`);
      return null;
    }

    const decryptedContent = decryptString(dek, row.content);

    let decryptedMetadata = row.metadata;
    if (row.metadata && (row.metadata as Record<string, unknown>)._enc) {
      const encMeta = (row.metadata as Record<string, unknown>)._enc as string;
      if (isEncrypted(encMeta)) {
        const metaJson = decryptString(dek, encMeta);
        decryptedMetadata = JSON.parse(metaJson);
      }
    }

    return { ...row, content: decryptedContent, metadata: decryptedMetadata };
  } catch (err) {
    const e = err as Error & { code?: string };
    console.error(
      `[memory-crypto] Decrypt failed for memory=${row.id} scope=${row.scope}:`,
      e.code || e.message
    );
    return null;
  }
}

async function decryptMetadataOnly<T extends MemoryRowMinimal>(
  row: T,
  readerUserId: string
): Promise<T | null> {
  if (!row.metadata || !(row.metadata as Record<string, unknown>)._enc) {
    return row;
  }

  try {
    const encMeta = (row.metadata as Record<string, unknown>)._enc as string;
    if (!isEncrypted(encMeta)) return row;

    const dek = await resolveDekForReader(row, readerUserId);
    if (!dek) return null;

    const metaJson = decryptString(dek, encMeta);
    return { ...row, metadata: JSON.parse(metaJson) };
  } catch (err) {
    const e = err as Error & { code?: string };
    console.error(
      `[memory-crypto] Metadata decrypt failed for memory=${row.id}:`,
      e.code || e.message
    );
    return null;
  }
}

/**
 * Decrypt an array of memory rows. Silently drops rows that fail decryption (fail-closed).
 */
export async function decryptMemoryRows<T extends MemoryRowMinimal>(
  rows: T[],
  readerUserId: string
): Promise<T[]> {
  const results = await Promise.all(
    rows.map((row) => decryptMemoryRow(row, readerUserId))
  );
  return results.filter((r): r is NonNullable<typeof r> => r !== null) as T[];
}

// ─── Keyword search post-decrypt filter ───────────────────────────────────────

/**
 * Filter decrypted rows by keyword (case-insensitive substring match).
 * Used as fallback when SQL content.ilike is unavailable due to encryption.
 */
export function filterRowsByTextContent<T extends MemoryRowMinimal>(
  rows: T[],
  query: string
): T[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (terms.length === 0) return rows;

  return rows.filter((row) => {
    const content = (row.content || '').toLowerCase();
    return terms.some((term) => content.includes(term));
  });
}
