/**
 * Shared group membership access control (consumer groups, not Workforce).
 * SYNC: API-IAMemory/src/lib/group-access.ts
 */

import { supabase } from './supabase.js';

export type GroupRole = 'owner' | 'admin' | 'member' | 'viewer';

export type GroupAccessDenied = {
  ok: false;
  status: 403 | 404;
  code: 'FORBIDDEN' | 'NOT_FOUND';
  message: string;
};

export type GroupAccessGranted = { ok: true; role: GroupRole };

export type GroupAccessResult = GroupAccessGranted | GroupAccessDenied;

const ROLE_RANK: Record<GroupRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export async function getGroupMemberRole(
  userId: string,
  groupId: string
): Promise<GroupRole | null> {
  const { data } = await supabase
    .from('shared_group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (!data?.role) return null;
  return data.role as GroupRole;
}

export async function canWriteToGroup(userId: string, groupId: string): Promise<boolean> {
  const role = await getGroupMemberRole(userId, groupId);
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK.member;
}

export async function canAdminGroup(userId: string, groupId: string): Promise<boolean> {
  const role = await getGroupMemberRole(userId, groupId);
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK.admin;
}

export async function canDeleteGroupMemory(
  userId: string,
  memory: { user_id: string; scope: string; group_id?: string | null }
): Promise<boolean> {
  if (memory.scope !== 'group' || !memory.group_id) {
    return memory.user_id === userId;
  }
  if (memory.user_id === userId) return true;
  const role = await getGroupMemberRole(userId, memory.group_id);
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK.admin;
}

export function slugifyGroupName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'group';
}

export async function uniqueGroupSlug(ownerUserId: string, baseName: string): Promise<string> {
  const base = slugifyGroupName(baseName);
  let slug = base;
  let attempt = 0;
  while (attempt < 20) {
    const { data } = await supabase
      .from('shared_groups')
      .select('id')
      .eq('owner_user_id', ownerUserId)
      .eq('slug', slug)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data) return slug;
    attempt += 1;
    slug = `${base}-${attempt}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
