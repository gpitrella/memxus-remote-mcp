/**
 * User storage metering — content + metadata + projected embedding bytes.
 * SYNC: API-IAMemory/src/lib/storage-bytes.ts
 */

import { supabase } from './supabase.js';
import type { PlanDefinition } from './plans';
import { APPEND_SEPARATOR } from './memory-scope.js';

/** Projected embedding size when vector is missing (P90 from prod analysis). */
export const PROJECTED_EMBEDDING_BYTES = 6144;

/** Rough encryption overhead for pre-write estimates. */
const ENCRYPTION_OVERHEAD = 1.35;

function retentionCutoffIso(retentionDays: number): string | null {
  if (retentionDays === -1) return null;
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - retentionDays);
  return d.toISOString();
}

export function estimateMemoryPayloadBytes(content: string, metadata?: unknown): number {
  const contentBytes = Buffer.byteLength(content, 'utf8');
  const metaBytes = metadata ? Buffer.byteLength(JSON.stringify(metadata), 'utf8') : 0;
  return Math.ceil((contentBytes + metaBytes) * ENCRYPTION_OVERHEAD) + PROJECTED_EMBEDDING_BYTES;
}

export function estimateStorageDeltaForAppend(
  existingContent: string,
  newContent: string,
  metadata?: unknown
): number {
  const merged = `${existingContent}${APPEND_SEPARATOR}${newContent.trim()}`;
  const oldBytes = estimateMemoryPayloadBytes(existingContent, metadata);
  const newBytes = estimateMemoryPayloadBytes(merged, metadata);
  return Math.max(0, newBytes - oldBytes);
}

export async function getStorageBytesUsed(
  userId: string,
  limits?: PlanDefinition['limits']
): Promise<number> {
  const cutoff = limits ? retentionCutoffIso(limits.retentionDays) : null;

  const { data, error } = await supabase.rpc('get_user_storage_bytes', {
    p_user_id: userId,
    p_retention_cutoff: cutoff,
  });

  if (!error && data != null) {
    const n = Number(data);
    return Number.isFinite(n) ? n : 0;
  }

  return getStorageBytesUsedFallback(userId, cutoff);
}

async function getStorageBytesUsedFallback(
  userId: string,
  retentionCutoff: string | null
): Promise<number> {
  let query = supabase
    .from('memories')
    .select('content, metadata, embedding')
    .eq('user_id', userId);

  if (retentionCutoff) {
    query = query.gte('created_at', retentionCutoff);
  }

  const { data, error } = await query;
  if (error || !data) return 0;

  let total = 0;
  for (const row of data) {
    const contentLen =
      typeof row.content === 'string' ? Buffer.byteLength(row.content, 'utf8') : 0;
    const metaLen = row.metadata
      ? Buffer.byteLength(JSON.stringify(row.metadata), 'utf8')
      : 0;
    const embeddingLen =
      row.embedding != null ? PROJECTED_EMBEDDING_BYTES : PROJECTED_EMBEDDING_BYTES;
    total += contentLen + metaLen + embeddingLen;
  }
  return total;
}

export function isOverStorageLimit(
  storageBytesUsed: number,
  limits: PlanDefinition['limits']
): boolean {
  if (limits.storageBytes === -1) return false;
  return storageBytesUsed >= limits.storageBytes;
}

export function wouldExceedStorageLimit(
  storageBytesUsed: number,
  additionalBytes: number,
  limits: PlanDefinition['limits']
): boolean {
  if (limits.storageBytes === -1) return false;
  return storageBytesUsed + additionalBytes > limits.storageBytes;
}
