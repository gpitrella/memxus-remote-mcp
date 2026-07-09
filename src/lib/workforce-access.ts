/**
 * Workforce workspace access control for MCP (no Express req).
 * SYNC concept: API-IAMemory/src/lib/workforce-access.ts
 */

import { supabase } from './supabase.js';

export type WorkforceRole = 'owner' | 'admin' | 'member' | 'viewer';

export type AccessDenied = {
  ok: false;
  status: 403 | 404 | 402;
  code: 'FORBIDDEN' | 'NOT_FOUND' | 'SUBSCRIPTION_REQUIRED' | 'WORKSPACE_ARCHIVED';
  message: string;
};

export type AccessGranted = { ok: true; role: WorkforceRole };

export type AccessResult = AccessGranted | AccessDenied;

const ROLE_RANK: Record<WorkforceRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export async function getWorkforceMemberRole(
  userId: string,
  workspaceId: string
): Promise<WorkforceRole | null> {
  const { data } = await supabase
    .from('workforce_workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data?.role) return null;
  return data.role as WorkforceRole;
}

export async function assertWorkforceMember(
  userId: string,
  workspaceId: string,
  minRole: WorkforceRole = 'member',
  apiKeyWorkforceWsId?: string
): Promise<AccessResult> {
  if (apiKeyWorkforceWsId) {
    if (apiKeyWorkforceWsId === workspaceId) {
      return { ok: true, role: 'member' };
    }
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'API key is not authorized for this workforce workspace',
    };
  }

  const role = await getWorkforceMemberRole(userId, workspaceId);
  if (!role) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Not a member of this workforce workspace',
    };
  }

  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: `Requires ${minRole} role or higher`,
    };
  }

  return { ok: true, role };
}
