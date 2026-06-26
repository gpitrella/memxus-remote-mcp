/**
 * Centralized memory update (replace or append).
 * SYNC: API-IAMemory/src/lib/memory-update.ts
 */

import { supabase } from './supabase.js';
import { scheduleEmbeddingUpdate } from './embedding-background.js';
import { canUpdateMemory, type MemoryRow as AccessMemoryRow } from './memory-access.js';
import { normalizeCollectionSlug, normalizeTags, resolveCollection } from './memory-scope.js';
import { appendToMemory } from './memory-append.js';
import {
  decryptMemoryRow,
  preparePatchForStorage,
  type MemoryRowMinimal,
} from './memory-crypto.js';
import { invalidatePlanContextCache } from './plan-enforcement.js';
import type { MemoryRow } from '../mcp/memory-types.js';

export type UpdateMemoryMode = 'replace' | 'append';

export interface UpdateMemoryInput {
  userId: string;
  workforceWorkspaceId?: string;
  memoryId: string;
  mode?: UpdateMemoryMode;
  content?: string;
  metadata?: Record<string, unknown> | null;
  tags?: string[];
  memory_type?: MemoryRow['memory_type'];
  type?: MemoryRow['memory_type'];
  importance?: number;
  collection?: string | null;
}

export async function updateMemoryRecord(p: UpdateMemoryInput): Promise<MemoryRow> {
  const mode = p.mode ?? 'replace';

  if (mode === 'append') {
    if (!p.content?.trim()) {
      throw new Error('content is required for append mode');
    }
    const row = await appendToMemory({
      userId: p.userId,
      workforceWorkspaceId: p.workforceWorkspaceId,
      memoryId: p.memoryId,
      newContent: p.content,
    });
    invalidatePlanContextCache(p.userId);
    return row;
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (p.content !== undefined) updates.content = p.content;
  if (p.metadata !== undefined) updates.metadata = p.metadata;
  if (p.tags !== undefined) updates.tags = normalizeTags(p.tags);
  const memType = p.memory_type ?? p.type;
  if (memType !== undefined) updates.memory_type = memType;
  if (p.importance !== undefined) updates.importance = p.importance;

  if (p.collection !== undefined) {
    updates.collection = normalizeCollectionSlug(p.collection);
  } else if (p.tags !== undefined || memType !== undefined) {
    updates.collection = resolveCollection({
      collection: undefined,
      tags: normalizeTags(p.tags),
      memory_type: memType,
    });
  }

  if (Object.keys(updates).length <= 1) {
    throw new Error('No fields to update');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('memories')
    .select('*')
    .eq('id', p.memoryId)
    .single();

  if (fetchError || !existing) throw new Error('Memory not found');

  const canUpdate = await canUpdateMemory(p.userId, existing as AccessMemoryRow);
  if (!canUpdate) throw new Error('Not authorized to update this memory');

  await decryptMemoryRow(existing as unknown as MemoryRowMinimal, p.userId);

  const encryptedUpdates = await preparePatchForStorage(updates, {
    user_id: existing.user_id,
    scope: existing.scope,
    group_id: existing.group_id,
    workforce_workspace_id: existing.workforce_workspace_id,
  });

  const { data, error } = await supabase
    .from('memories')
    .update(encryptedUpdates)
    .eq('id', p.memoryId)
    .select()
    .single();

  if (error || !data) throw new Error(`updateMemory: ${error?.message ?? 'update failed'}`);

  if (p.content !== undefined && typeof p.content === 'string') {
    scheduleEmbeddingUpdate(p.memoryId, p.content);
  }
  invalidatePlanContextCache(p.userId);

  const dec = await decryptMemoryRow(data as unknown as MemoryRowMinimal, p.userId);
  if (!dec) throw new Error('Memory not found');
  return dec as unknown as MemoryRow;
}
