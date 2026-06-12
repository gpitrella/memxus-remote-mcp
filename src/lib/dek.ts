/**
 * DEK (Data Encryption Key) management: per-user, per-group, per-workforce.
 * Includes in-memory cache with 5-minute TTL and secure eviction.
 * SYNC: RemoteMCP-AIMemory/src/lib/dek.ts
 */

import { supabase as supabaseAdmin } from './supabase.js';
import {
  generateDek,
  loadMasterKey,
  unwrapDek,
  wrapDek,
} from './encryption.js';

// ─── Cache ────────────────────────────────────────────────────────────────────

interface DekCacheEntry {
  key: Buffer;
  expiresAt: number;
}

const DEK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEK_CACHE_MAX_SIZE = 10_000;
const dekCache = new Map<string, DekCacheEntry>();

export function getDekFromCache(scopeKey: string): Buffer | null {
  const entry = dekCache.get(scopeKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    entry.key.fill(0);
    dekCache.delete(scopeKey);
    return null;
  }
  return entry.key;
}

export function setDekInCache(scopeKey: string, key: Buffer): void {
  if (dekCache.size >= DEK_CACHE_MAX_SIZE) {
    evictOldest();
  }
  dekCache.set(scopeKey, { key, expiresAt: Date.now() + DEK_CACHE_TTL_MS });
}

function evictOldest(): void {
  const now = Date.now();
  for (const [k, entry] of dekCache) {
    if (now > entry.expiresAt) {
      entry.key.fill(0);
      dekCache.delete(k);
    }
  }
  if (dekCache.size >= DEK_CACHE_MAX_SIZE) {
    const firstKey = dekCache.keys().next().value;
    if (firstKey) {
      const entry = dekCache.get(firstKey);
      if (entry) entry.key.fill(0);
      dekCache.delete(firstKey);
    }
  }
}

/** Clear all cached keys (for testing or shutdown). */
export function clearDekCache(): void {
  for (const entry of dekCache.values()) {
    entry.key.fill(0);
  }
  dekCache.clear();
}

// ─── User DEK ─────────────────────────────────────────────────────────────────

export async function getOrCreateUserDek(userId: string): Promise<Buffer> {
  const cacheKey = `user:${userId}`;
  const cached = getDekFromCache(cacheKey);
  if (cached) return cached;

  const mk = loadMasterKey();

  const { data } = await supabaseAdmin
    .from('user_keys')
    .select('wrapped_dek')
    .eq('user_id', userId)
    .maybeSingle();

  if (data?.wrapped_dek) {
    const dek = unwrapDek(data.wrapped_dek, mk);
    setDekInCache(cacheKey, dek);
    return dek;
  }

  const dek = generateDek();
  const wrapped = wrapDek(dek, mk);

  const { error } = await supabaseAdmin.from('user_keys').upsert(
    { user_id: userId, wrapped_dek: wrapped },
    { onConflict: 'user_id' }
  );
  if (error) {
    dek.fill(0);
    throw Object.assign(new Error(`Failed to store user DEK: ${error.message}`), {
      code: 'DEK_STORE_FAILED',
    });
  }

  setDekInCache(cacheKey, dek);
  return dek;
}

// ─── Group DEK ────────────────────────────────────────────────────────────────

export async function getGroupDekForUser(groupId: string, userId: string): Promise<Buffer | null> {
  const cacheKey = `group:${groupId}`;
  const cached = getDekFromCache(cacheKey);
  if (cached) return cached;

  const { data } = await supabaseAdmin
    .from('group_keys')
    .select('wrapped_dek')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data?.wrapped_dek) return null;

  const userDek = await getOrCreateUserDek(userId);
  const groupDek = unwrapDek(data.wrapped_dek, userDek);
  setDekInCache(cacheKey, groupDek);
  return groupDek;
}

export async function provisionGroupDek(groupId: string, memberUserIds: string[]): Promise<void> {
  const groupDek = generateDek();

  const rows = await Promise.all(
    memberUserIds.map(async (uid) => {
      const userDek = await getOrCreateUserDek(uid);
      return {
        group_id: groupId,
        user_id: uid,
        wrapped_dek: wrapDek(groupDek, userDek),
      };
    })
  );

  const { error } = await supabaseAdmin
    .from('group_keys')
    .upsert(rows, { onConflict: 'group_id,user_id' });

  if (error) {
    groupDek.fill(0);
    throw Object.assign(new Error(`Failed to provision group DEK: ${error.message}`), {
      code: 'DEK_STORE_FAILED',
    });
  }

  setDekInCache(`group:${groupId}`, groupDek);
}

export async function wrapGroupDekForMember(groupId: string, newUserId: string): Promise<void> {
  const { data: existingRow } = await supabaseAdmin
    .from('group_keys')
    .select('wrapped_dek, user_id')
    .eq('group_id', groupId)
    .limit(1)
    .maybeSingle();

  if (!existingRow) {
    await provisionGroupDek(groupId, [newUserId]);
    return;
  }

  const ownerDek = await getOrCreateUserDek(existingRow.user_id);
  const groupDek = unwrapDek(existingRow.wrapped_dek, ownerDek);
  const newUserDek = await getOrCreateUserDek(newUserId);
  const wrapped = wrapDek(groupDek, newUserDek);

  await supabaseAdmin.from('group_keys').upsert(
    { group_id: groupId, user_id: newUserId, wrapped_dek: wrapped },
    { onConflict: 'group_id,user_id' }
  );

  groupDek.fill(0);
}

// ─── Workforce DEK ────────────────────────────────────────────────────────────

export async function getWorkforceDekForUser(
  workspaceId: string,
  userId: string
): Promise<Buffer | null> {
  const cacheKey = `workforce:${workspaceId}`;
  const cached = getDekFromCache(cacheKey);
  if (cached) return cached;

  const { data } = await supabaseAdmin
    .from('workforce_keys')
    .select('wrapped_dek')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data?.wrapped_dek) return null;

  const userDek = await getOrCreateUserDek(userId);
  const workforceDek = unwrapDek(data.wrapped_dek, userDek);
  setDekInCache(cacheKey, workforceDek);
  return workforceDek;
}

export async function provisionWorkforceDek(
  workspaceId: string,
  memberUserIds: string[]
): Promise<void> {
  const wDek = generateDek();

  const rows = await Promise.all(
    memberUserIds.map(async (uid) => {
      const userDek = await getOrCreateUserDek(uid);
      return {
        workspace_id: workspaceId,
        user_id: uid,
        wrapped_dek: wrapDek(wDek, userDek),
      };
    })
  );

  const { error } = await supabaseAdmin
    .from('workforce_keys')
    .upsert(rows, { onConflict: 'workspace_id,user_id' });

  if (error) {
    wDek.fill(0);
    throw Object.assign(new Error(`Failed to provision workforce DEK: ${error.message}`), {
      code: 'DEK_STORE_FAILED',
    });
  }

  setDekInCache(`workforce:${workspaceId}`, wDek);
}

export async function wrapWorkforceDekForMember(
  workspaceId: string,
  newUserId: string
): Promise<void> {
  const { data: existingRow } = await supabaseAdmin
    .from('workforce_keys')
    .select('wrapped_dek, user_id')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle();

  if (!existingRow) {
    await provisionWorkforceDek(workspaceId, [newUserId]);
    return;
  }

  const ownerDek = await getOrCreateUserDek(existingRow.user_id);
  const wDek = unwrapDek(existingRow.wrapped_dek, ownerDek);
  const newUserDek = await getOrCreateUserDek(newUserId);
  const wrapped = wrapDek(wDek, newUserDek);

  await supabaseAdmin.from('workforce_keys').upsert(
    { workspace_id: workspaceId, user_id: newUserId, wrapped_dek: wrapped },
    { onConflict: 'workspace_id,user_id' }
  );

  wDek.fill(0);
}

// ─── DEK resolution for memory rows ──────────────────────────────────────────

export async function resolveDekForMemory(row: {
  user_id: string;
  scope: string;
  group_id?: string | null;
  workforce_workspace_id?: string | null;
}): Promise<Buffer> {
  if (row.scope === 'group' && row.group_id) {
    const gDek = await getGroupDekForUser(row.group_id, row.user_id);
    if (gDek) return gDek;
    // Fallback: use user DEK if group key not provisioned yet
  }

  if (row.scope === 'workforce' && row.workforce_workspace_id) {
    const wDek = await getWorkforceDekForUser(row.workforce_workspace_id, row.user_id);
    if (wDek) return wDek;
  }

  return getOrCreateUserDek(row.user_id);
}

/**
 * Resolve DEK for reading a memory when the reader is different from the owner.
 * For group/workforce, the reader needs their own wrapped copy.
 */
export async function resolveDekForReader(
  row: {
    user_id: string;
    scope: string;
    group_id?: string | null;
    workforce_workspace_id?: string | null;
  },
  readerUserId: string
): Promise<Buffer | null> {
  if (row.scope === 'personal') {
    if (row.user_id !== readerUserId) return null;
    return getOrCreateUserDek(row.user_id);
  }

  if (row.scope === 'group' && row.group_id) {
    return getGroupDekForUser(row.group_id, readerUserId);
  }

  if (row.scope === 'workforce' && row.workforce_workspace_id) {
    return getWorkforceDekForUser(row.workforce_workspace_id, readerUserId);
  }

  // Unknown scope — try owner's key
  if (row.user_id === readerUserId) {
    return getOrCreateUserDek(row.user_id);
  }
  return null;
}

export type DekScopeRow = {
  user_id: string;
  scope: string;
  group_id?: string | null;
  workforce_workspace_id?: string | null;
};

/**
 * Warm DEK cache for unique scopes in a batch before bulk decrypt.
 * Reduces N sequential DB round-trips to O(unique scopes) parallel fetches.
 */
export async function prefetchDekScopes(
  rows: DekScopeRow[],
  readerUserId: string
): Promise<void> {
  if (rows.length === 0) return;

  const groupIds = new Set<string>();
  const workforceIds = new Set<string>();
  let needsUserDek = false;

  for (const row of rows) {
    if (row.scope === 'personal') {
      if (row.user_id === readerUserId) needsUserDek = true;
    } else if (row.scope === 'group' && row.group_id) {
      groupIds.add(row.group_id);
    } else if (row.scope === 'workforce' && row.workforce_workspace_id) {
      workforceIds.add(row.workforce_workspace_id);
    } else if (row.user_id === readerUserId) {
      needsUserDek = true;
    }
  }

  const tasks: Promise<unknown>[] = [];
  if (needsUserDek) {
    tasks.push(getOrCreateUserDek(readerUserId));
  }
  for (const groupId of groupIds) {
    tasks.push(getGroupDekForUser(groupId, readerUserId));
  }
  for (const workspaceId of workforceIds) {
    tasks.push(getWorkforceDekForUser(workspaceId, readerUserId));
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}
