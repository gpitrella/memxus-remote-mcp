/**
 * Append content to an existing memory with revision history.
 * SYNC: API-IAMemory/src/lib/memory-append.ts
 */

import { supabase } from './supabase.js';
import { scheduleEmbeddingUpdate } from './embedding-background.js';
import { canUpdateMemory, type MemoryRow as AccessMemoryRow } from './memory-access.js';
import {
  APPEND_SEPARATOR,
  MAX_MEMORY_CONTENT_LENGTH,
} from './memory-scope.js';
import { decryptMemoryRow, prepareContentForStorage, type MemoryRowMinimal } from './memory-crypto.js';
import { assertWriteStorageAllowed } from './plan-enforcement.js';
import { estimateStorageDeltaForAppend } from './storage-bytes.js';
import { logPerfPhase } from './mcp-perf.js';
import type { MemoryRow } from '../mcp/memory-types.js';

export interface RevisionEntry {
  content: string;
  appended_at: string;
}

export async function appendToMemory(p: {
  userId: string;
  workforceWorkspaceId?: string;
  memoryId: string;
  newContent: string;
}): Promise<MemoryRow> {
  const appendStartedAt = Date.now();
  const { data: existing, error: fetchError } = await supabase
    .from('memories')
    .select('*')
    .eq('id', p.memoryId)
    .single();

  if (fetchError || !existing) throw new Error('Memory not found');

  const canUpdate = await canUpdateMemory(p.userId, existing as AccessMemoryRow);
  if (!canUpdate) throw new Error('Not authorized to append to this memory');

  const decrypted = await decryptMemoryRow(existing as unknown as MemoryRowMinimal, p.userId);
  if (!decrypted) throw new Error('Memory not found');

  const existingContent = decrypted.content as string;
  const metadata = (decrypted.metadata as Record<string, unknown>) || {};

  await assertWriteStorageAllowed(
    p.userId,
    estimateStorageDeltaForAppend(existingContent, p.newContent, metadata)
  );

  const merged = `${existingContent}${APPEND_SEPARATOR}${p.newContent.trim()}`;
  if (merged.length > MAX_MEMORY_CONTENT_LENGTH) {
    throw new Error(
      `Merged content exceeds ${MAX_MEMORY_CONTENT_LENGTH} chars. Create a new memory in the same collection instead.`
    );
  }

  const revisions = Array.isArray(metadata.revisions)
    ? [...(metadata.revisions as RevisionEntry[])]
    : [];
  revisions.push({ content: existingContent, appended_at: new Date().toISOString() });

  const newMetadata = { ...metadata, revisions };

  const { content: encContent, metadata: encMeta } = await prepareContentForStorage(
    merged,
    newMetadata,
    {
      user_id: existing.user_id,
      scope: existing.scope,
      group_id: existing.group_id,
      workforce_workspace_id: existing.workforce_workspace_id,
    }
  );

  const updates: Record<string, unknown> = {
    content: encContent,
    metadata: encMeta,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('memories')
    .update(updates)
    .eq('id', p.memoryId)
    .select()
    .single();

  if (error) throw new Error(`appendToMemory: ${error.message}`);

  scheduleEmbeddingUpdate(p.memoryId, merged);

  const dec = await decryptMemoryRow(data as unknown as MemoryRowMinimal, p.userId);
  if (!dec) throw new Error('Memory not found');
  logPerfPhase('append_save', Date.now() - appendStartedAt, {
    memoryId: p.memoryId,
    embedding: 'async',
  });
  return dec as unknown as MemoryRow;
}
