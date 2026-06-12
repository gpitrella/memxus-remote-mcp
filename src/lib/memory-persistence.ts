/**
 * Centralized memory persistence layer with transparent encryption.
 * All memory DB I/O for content/metadata MUST go through this module.
 * SYNC: RemoteMCP-AIMemory/src/lib/memory-persistence.ts
 */

import { supabase as supabaseAdmin } from './supabase.js';
import {
  prepareContentForStorage,
  preparePatchForStorage,
  decryptMemoryRow,
  decryptMemoryRows,
  type MemoryRowMinimal,
} from './memory-crypto.js';
import { isEncrypted, isEncryptionEnabled } from './encryption.js';

const KEYWORD_SEARCH_DECRYPT_CAP = Number(process.env.KEYWORD_SEARCH_DECRYPT_CAP) || 500;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InsertMemoryInput {
  user_id: string;
  content: string;
  scope: string;
  group_id?: string | null;
  workforce_workspace_id?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface UpdateMemoryPatch {
  content?: string;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseQueryResult = { data: any; error: any; count?: number | null };

// ─── Insert ───────────────────────────────────────────────────────────────────

export async function insertMemoryEncrypted(
  input: InsertMemoryInput
): Promise<SupabaseQueryResult> {
  const { content: encContent, metadata: encMeta } = await prepareContentForStorage(
    input.content,
    input.metadata ?? null,
    {
      user_id: input.user_id,
      scope: input.scope,
      group_id: input.group_id,
      workforce_workspace_id: input.workforce_workspace_id,
    }
  );

  const row = {
    ...input,
    content: encContent,
    metadata: encMeta,
  };

  return supabaseAdmin.from('memories').insert(row).select().single();
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateMemoryEncrypted(
  memoryId: string,
  patch: UpdateMemoryPatch,
  existingRow: { user_id: string; scope: string; group_id?: string | null; workforce_workspace_id?: string | null }
): Promise<SupabaseQueryResult> {
  const encPatch = await preparePatchForStorage(patch, existingRow);
  return supabaseAdmin.from('memories').update(encPatch).eq('id', memoryId).select().single();
}

// ─── Read single ──────────────────────────────────────────────────────────────

export async function fetchMemoryByIdDecrypted(
  memoryId: string,
  readerUserId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from('memories')
    .select('*')
    .eq('id', memoryId)
    .single();

  if (error || !data) return null;

  const decrypted = await decryptMemoryRow(data as MemoryRowMinimal, readerUserId);
  return decrypted as Record<string, unknown> | null;
}

// ─── Read list (post-query decrypt) ───────────────────────────────────────────

export async function decryptFetchedRows(
  rows: Record<string, unknown>[],
  readerUserId: string
): Promise<Record<string, unknown>[]> {
  return decryptMemoryRows(rows as unknown as MemoryRowMinimal[], readerUserId) as unknown as Promise<Record<string, unknown>[]>;
}

// ─── Decrypt RPC results ──────────────────────────────────────────────────────

export async function decryptRpcResults(
  rows: Record<string, unknown>[],
  readerUserId: string
): Promise<Record<string, unknown>[]> {
  return decryptMemoryRows(rows as unknown as MemoryRowMinimal[], readerUserId) as unknown as Promise<Record<string, unknown>[]>;
}

// ─── Keyword search helpers ───────────────────────────────────────────────────

export function getKeywordSearchDecryptCap(): number {
  return KEYWORD_SEARCH_DECRYPT_CAP;
}

/**
 * Determines if content.ilike should be skipped in text search.
 * When encryption is enabled, SQL-level content matching is impossible.
 */
export function shouldSkipContentIlike(): boolean {
  return isEncryptionEnabled();
}

/**
 * Check if a row needs decryption before it can be returned.
 */
export function rowNeedsDecryption(row: Record<string, unknown>): boolean {
  return !!(isEncrypted(row.content) || (row.metadata && typeof (row.metadata as Record<string, unknown>)?._enc === 'string'));
}
