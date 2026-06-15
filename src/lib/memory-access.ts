/**
 * Unified memory access control for personal, group, and workforce scopes.
 * SYNC: RemoteMCP-AIMemory/src/lib/memory-access.ts
 */

import { supabase } from './supabase.js';
import {
  canDeleteGroupMemory,
  canWriteToGroup,
  getGroupMemberRole,
  type GroupRole,
} from './group-access.js';
import type { MemoryScopeFilters } from './memory-scope.js';

type WorkforceRole = 'owner' | 'admin' | 'member';

export type MemoryScopeValue = 'personal' | 'workforce' | 'group' | 'all';
export type VisibilityFilter = 'private' | 'shared' | 'all';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_RE.test(id);
}

export function filterValidUuids(ids: string[]): string[] {
  return ids.filter(isValidUuid);
}

export interface MemoryRow {
  id: string;
  user_id: string;
  scope: string;
  group_id?: string | null;
  workforce_workspace_id?: string | null;
}

export interface MemoryAccessContext {
  userId: string;
  workforceWorkspaceId?: string;
  memoryScope?: MemoryScopeValue;
  groupId?: string;
  visibility?: VisibilityFilter;
}

export interface WriteTargetInput {
  visibility?: VisibilityFilter;
  groupId?: string;
  groupName?: string;
  workforceWorkspaceId?: string;
}

export type WriteTargetResult =
  | {
      scope: 'personal' | 'group' | 'workforce';
      groupId?: string;
      workforceWorkspaceId?: string;
    }
  | { error: string; status: number; code: string };

export interface AccessibleVectorRpcParams {
  p_user_id: string;
  query_embedding: number[];
  match_count: number;
  match_threshold: number;
  p_group_ids: string[] | null;
  p_workforce_workspace_ids: string[] | null;
  p_include_personal: boolean;
  p_collection?: string | null;
  p_memory_type?: string | null;
  p_tags?: string[] | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MemoryQueryBuilder = any;

export async function getAccessibleGroupIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('shared_group_members')
    .select('group_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) return [];
  return filterValidUuids((data ?? []).map((r) => r.group_id as string));
}

export async function getAccessibleWorkforceIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('workforce_workspace_members')
    .select('workspace_id')
    .eq('user_id', userId);

  if (error) return [];
  return filterValidUuids((data ?? []).map((r) => r.workspace_id as string));
}

export function buildScopeAllOrFilter(
  userId: string,
  groupIds: string[],
  workforceIds: string[]
): string {
  const parts: string[] = [`and(scope.eq.personal,user_id.eq.${userId})`];

  const validGroups = filterValidUuids(groupIds);
  if (validGroups.length === 1) {
    parts.push(`and(scope.eq.group,group_id.eq.${validGroups[0]})`);
  } else if (validGroups.length > 1) {
    parts.push(`and(scope.eq.group,group_id.in.(${validGroups.join(',')}))`);
  }

  const validWs = filterValidUuids(workforceIds);
  if (validWs.length === 1) {
    parts.push(`and(scope.eq.workforce,workforce_workspace_id.eq.${validWs[0]})`);
  } else if (validWs.length > 1) {
    parts.push(`and(scope.eq.workforce,workforce_workspace_id.in.(${validWs.join(',')}))`);
  }

  return parts.join(',');
}

export async function resolveGroupIdFromName(
  userId: string,
  groupName: string
): Promise<
  | { groupId: string }
  | { error: string; status: number; code: string }
> {
  const normalized = groupName.trim().toLowerCase();
  if (!normalized) {
    return { error: 'groupName is required', status: 400, code: 'VALIDATION_ERROR' };
  }

  const groupIds = await getAccessibleGroupIds(userId);
  if (groupIds.length === 0) {
    return { error: 'No accessible groups found', status: 404, code: 'NOT_FOUND' };
  }

  const { data: groups, error } = await supabase
    .from('shared_groups')
    .select('id, name')
    .in('id', groupIds)
    .is('deleted_at', null);

  if (error || !groups?.length) {
    return { error: 'Group not found', status: 404, code: 'NOT_FOUND' };
  }

  const matches = groups.filter((g) => g.name.trim().toLowerCase() === normalized);
  if (matches.length === 0) {
    return { error: 'Group not found', status: 404, code: 'NOT_FOUND' };
  }
  if (matches.length > 1) {
    return {
      error: 'Multiple groups match this name. Use groupId instead.',
      status: 409,
      code: 'AMBIGUOUS_GROUP_NAME',
    };
  }

  return { groupId: matches[0].id as string };
}

export async function resolveMemoryWriteTarget(
  userId: string,
  input: WriteTargetInput,
  apiKeyWorkforceWsId?: string
): Promise<WriteTargetResult> {
  const visibility = input.visibility ?? 'private';
  const wantsShared =
    visibility === 'shared' || Boolean(input.groupId) || Boolean(input.groupName?.trim());

  if (apiKeyWorkforceWsId) {
    const wsId = input.workforceWorkspaceId ?? apiKeyWorkforceWsId;
    if (wantsShared) {
      return {
        error: 'Workforce API keys cannot write to shared groups',
        status: 403,
        code: 'FORBIDDEN',
      };
    }
    return { scope: 'workforce', workforceWorkspaceId: wsId };
  }

  if (input.workforceWorkspaceId) {
    return { scope: 'workforce', workforceWorkspaceId: input.workforceWorkspaceId };
  }

  if (!wantsShared) {
    return { scope: 'personal' };
  }

  let groupId = input.groupId;
  if (!groupId && input.groupName) {
    const resolved = await resolveGroupIdFromName(userId, input.groupName);
    if ('error' in resolved) {
      return { error: resolved.error, status: resolved.status, code: resolved.code };
    }
    groupId = resolved.groupId;
  }

  if (!groupId || !isValidUuid(groupId)) {
    return {
      error: 'groupId or groupName is required when visibility=shared',
      status: 400,
      code: 'VALIDATION_ERROR',
    };
  }

  const canWrite = await canWriteToGroup(userId, groupId);
  if (!canWrite) {
    return {
      error: 'Not authorized to write to this group',
      status: 403,
      code: 'FORBIDDEN',
    };
  }

  return { scope: 'group', groupId };
}

export async function canReadMemory(
  userId: string,
  memory: MemoryRow,
  apiKeyWorkforceWsId?: string
): Promise<boolean> {
  if (apiKeyWorkforceWsId) {
    return (
      memory.scope === 'workforce' &&
      memory.workforce_workspace_id === apiKeyWorkforceWsId
    );
  }

  if (memory.scope === 'personal') {
    return memory.user_id === userId;
  }

  if (memory.scope === 'workforce' && memory.workforce_workspace_id) {
    const role = await getWorkforceMemberRoleSafe(userId, memory.workforce_workspace_id);
    return role !== null;
  }

  if (memory.scope === 'group' && memory.group_id) {
    const role = await getGroupMemberRole(userId, memory.group_id);
    return role !== null;
  }

  return false;
}

export async function canUpdateMemory(userId: string, memory: MemoryRow): Promise<boolean> {
  if (memory.scope === 'personal') return memory.user_id === userId;
  if (memory.scope === 'workforce') return memory.user_id === userId;
  if (memory.scope === 'group') return memory.user_id === userId;
  return false;
}

export async function canDeleteMemory(userId: string, memory: MemoryRow): Promise<boolean> {
  if (memory.scope === 'personal') return memory.user_id === userId;
  if (memory.scope === 'workforce') return memory.user_id === userId;
  if (memory.scope === 'group') return canDeleteGroupMemory(userId, memory);
  return false;
}

async function getWorkforceMemberRoleSafe(
  userId: string,
  workspaceId: string
): Promise<WorkforceRole | null> {
  const { data } = await supabase
    .from('workforce_workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role ? (data.role as WorkforceRole) : null;
}

function parseVisibility(
  visibility?: VisibilityFilter,
  memoryScope?: MemoryScopeValue
): VisibilityFilter {
  if (visibility) return visibility;
  if (memoryScope === 'personal') return 'private';
  if (memoryScope === 'group') return 'shared';
  return 'all';
}

export async function applyMemoryListFilter(
  query: MemoryQueryBuilder,
  ctx: MemoryAccessContext
): Promise<{
  query: MemoryQueryBuilder;
  error?: { status: number; code: string; message: string };
}> {
  const { userId, workforceWorkspaceId: keyWsId } = ctx;
  const memoryScope = ctx.memoryScope ?? 'personal';
  const visibility = parseVisibility(ctx.visibility, memoryScope);

  if (keyWsId) {
    return {
      query: query.eq('scope', 'workforce').eq('workforce_workspace_id', keyWsId),
    };
  }

  if (memoryScope === 'workforce') {
    const workforceWsId = ctx.workforceWorkspaceId;
    if (!workforceWsId || !isValidUuid(workforceWsId)) {
      return {
        query,
        error: {
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'workforce_workspace_id is required when scope=workforce',
        },
      };
    }
    return {
      query: query
        .eq('scope', 'workforce')
        .eq('workforce_workspace_id', workforceWsId),
    };
  }

  if (memoryScope === 'group') {
    const groupId = ctx.groupId;
    if (!groupId || !isValidUuid(groupId)) {
      return {
        query,
        error: {
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'group_id is required when scope=group',
        },
      };
    }
    const role = await getGroupMemberRole(userId, groupId);
    if (!role) {
      return {
        query,
        error: {
          status: 403,
          code: 'FORBIDDEN',
          message: 'Not a member of this group',
        },
      };
    }
    return query.eq('scope', 'group').eq('group_id', groupId);
  }

  if (memoryScope === 'all' || visibility === 'all') {
    const groupIds = await getAccessibleGroupIds(userId);
    const workforceIds = await getAccessibleWorkforceIds(userId);

    if (visibility === 'private') {
      return { query: query.eq('user_id', userId).eq('scope', 'personal') };
    }

    if (visibility === 'shared') {
      const targetGroups = ctx.groupId && isValidUuid(ctx.groupId)
        ? [ctx.groupId]
        : groupIds;
      if (targetGroups.length === 0) {
        return { query: query.eq('scope', 'group').eq('group_id', '00000000-0000-0000-0000-000000000000') };
      }
      if (targetGroups.length === 1) {
        return { query: query.eq('scope', 'group').eq('group_id', targetGroups[0]) };
      }
      return { query: query.eq('scope', 'group').in('group_id', targetGroups) };
    }

    const orFilter = buildScopeAllOrFilter(userId, groupIds, workforceIds);
    return { query: query.or(orFilter) };
  }

  return { query: query.eq('user_id', userId).eq('scope', 'personal') };
}

export async function buildAccessibleVectorRpcParams(
  userId: string,
  embedding: number[],
  limit: number,
  threshold: number,
  filters: MemoryScopeFilters,
  accessCtx: {
    workforceWorkspaceId?: string;
    visibility?: VisibilityFilter;
    memoryScope?: MemoryScopeValue;
    groupId?: string;
  }
): Promise<AccessibleVectorRpcParams> {
  const memoryScope = accessCtx.memoryScope ?? 'all';
  const visibility = parseVisibility(accessCtx.visibility, memoryScope);

  if (accessCtx.workforceWorkspaceId) {
    return {
      p_user_id: userId,
      query_embedding: embedding,
      match_count: limit,
      match_threshold: threshold,
      p_group_ids: null,
      p_workforce_workspace_ids: [accessCtx.workforceWorkspaceId],
      p_include_personal: false,
      p_collection: filters.collection ?? null,
      p_memory_type: filters.type ?? null,
      p_tags: filters.tags?.length ? filters.tags : null,
    };
  }

  const allGroupIds = await getAccessibleGroupIds(userId);
  const allWorkforceIds = await getAccessibleWorkforceIds(userId);

  let includePersonal = false;
  let groupIds: string[] | null = null;
  let workforceIds: string[] | null = null;

  if (memoryScope === 'personal' || visibility === 'private') {
    includePersonal = true;
  } else if (memoryScope === 'group') {
    const gid = accessCtx.groupId;
    if (gid && isValidUuid(gid)) {
      const role = await getGroupMemberRole(userId, gid);
      groupIds = role ? [gid] : [];
    } else {
      groupIds = allGroupIds;
    }
  } else if (memoryScope === 'workforce') {
    const wsId = accessCtx.workforceWorkspaceId;
    if (wsId && isValidUuid(wsId)) {
      const wsRole = await getWorkforceMemberRoleSafe(userId, wsId);
      workforceIds = wsRole ? [wsId] : [];
    } else {
      workforceIds = allWorkforceIds;
    }
  } else if (visibility === 'shared') {
    const gid = accessCtx.groupId;
    if (gid && isValidUuid(gid)) {
      const role = await getGroupMemberRole(userId, gid);
      groupIds = role ? [gid] : [];
    } else {
      groupIds = allGroupIds;
    }
  } else {
    includePersonal = true;
    groupIds = allGroupIds.length > 0 ? allGroupIds : null;
    workforceIds = allWorkforceIds.length > 0 ? allWorkforceIds : null;
  }

  return {
    p_user_id: userId,
    query_embedding: embedding,
    match_count: limit,
    match_threshold: threshold,
    p_group_ids: groupIds,
    p_workforce_workspace_ids: workforceIds,
    p_include_personal: includePersonal,
    p_collection: filters.collection ?? null,
    p_memory_type: filters.type ?? null,
    p_tags: filters.tags?.length ? filters.tags : null,
  };
}

export interface AccessibleStatsRpcParams {
  p_user_id: string;
  p_group_ids: string[] | null;
  p_workforce_workspace_ids: string[] | null;
  p_include_personal: boolean;
}

export async function buildAccessibleStatsRpcParams(
  userId: string,
  accessCtx: {
    workforceWorkspaceId?: string;
    visibility?: VisibilityFilter;
    memoryScope?: MemoryScopeValue;
    groupId?: string;
  }
): Promise<AccessibleStatsRpcParams> {
  const memoryScope = accessCtx.memoryScope ?? 'all';
  const visibility = parseVisibility(accessCtx.visibility, memoryScope);

  if (accessCtx.workforceWorkspaceId) {
    return {
      p_user_id: userId,
      p_group_ids: null,
      p_workforce_workspace_ids: [accessCtx.workforceWorkspaceId],
      p_include_personal: false,
    };
  }

  const allGroupIds = await getAccessibleGroupIds(userId);
  const allWorkforceIds = await getAccessibleWorkforceIds(userId);

  let includePersonal = false;
  let groupIds: string[] | null = null;
  let workforceIds: string[] | null = null;

  if (memoryScope === 'personal' || visibility === 'private') {
    includePersonal = true;
  } else if (memoryScope === 'group') {
    const gid = accessCtx.groupId;
    if (gid && isValidUuid(gid)) {
      const role = await getGroupMemberRole(userId, gid);
      groupIds = role ? [gid] : [];
    } else {
      groupIds = allGroupIds;
    }
  } else if (memoryScope === 'workforce') {
    const wsId = accessCtx.workforceWorkspaceId;
    if (wsId && isValidUuid(wsId)) {
      const wsRole = await getWorkforceMemberRoleSafe(userId, wsId);
      workforceIds = wsRole ? [wsId] : [];
    } else {
      workforceIds = allWorkforceIds;
    }
  } else if (visibility === 'shared') {
    const gid = accessCtx.groupId;
    if (gid && isValidUuid(gid)) {
      const role = await getGroupMemberRole(userId, gid);
      groupIds = role ? [gid] : [];
    } else {
      groupIds = allGroupIds;
    }
  } else {
    includePersonal = true;
    groupIds = allGroupIds.length > 0 ? allGroupIds : null;
    workforceIds = allWorkforceIds.length > 0 ? allWorkforceIds : null;
  }

  return {
    p_user_id: userId,
    p_group_ids: groupIds,
    p_workforce_workspace_ids: workforceIds,
    p_include_personal: includePersonal,
  };
}

export async function fetchGroupNameMap(
  groupIds: string[]
): Promise<Map<string, string>> {
  const valid = filterValidUuids([...new Set(groupIds)]);
  if (valid.length === 0) return new Map();

  const { data } = await supabase
    .from('shared_groups')
    .select('id, name')
    .in('id', valid)
    .is('deleted_at', null);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.id as string, row.name as string);
  }
  return map;
}

export function roleCanWriteGroup(role: GroupRole | null): boolean {
  if (!role) return false;
  const rank: Record<GroupRole, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };
  return rank[role] >= rank.member;
}
