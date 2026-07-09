/**
 * Gate workforce memory mutations (billing + RBAC).
 * SYNC concept: API-IAMemory/src/lib/workforce-memory-gate.ts
 */

import { assertWorkforceMember } from './workforce-access.js';
import { assertWorkspaceWritesAllowed } from './workforce-billing-state.js';
import {
  canCreateWorkspaceMemory,
  canDeleteWorkspaceMemory,
  canEditWorkspaceMemory,
} from './workforce-rbac.js';
import type { MemoryRow } from './memory-access.js';

export type WorkforceMutationDenied = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export type WorkforceMutationGranted = { ok: true };

export async function assertWorkforceMemoryMutation(
  userId: string,
  memory: MemoryRow,
  action: 'update' | 'delete',
  opts?: { workforceWorkspaceId?: string }
): Promise<WorkforceMutationGranted | WorkforceMutationDenied> {
  const wsId = memory.workforce_workspace_id;
  if (!wsId || memory.scope !== 'workforce') {
    return { ok: true };
  }

  const access = await assertWorkforceMember(
    userId,
    wsId,
    'viewer',
    opts?.workforceWorkspaceId
  );
  if (!access.ok) {
    return {
      ok: false,
      status: access.status,
      code: access.code,
      message: access.message,
    };
  }

  const billing = await assertWorkspaceWritesAllowed(wsId);
  if (!billing.ok) {
    return {
      ok: false,
      status: billing.status,
      code: billing.code,
      message: billing.message,
    };
  }

  const allowed =
    action === 'update'
      ? canEditWorkspaceMemory(access.role, memory.user_id, userId, billing.state)
      : canDeleteWorkspaceMemory(access.role, memory.user_id, userId, billing.state);

  if (!allowed) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Not allowed to modify this workspace memory',
    };
  }

  return { ok: true };
}

export async function assertWorkforceMemoryCreate(
  userId: string,
  workspaceId: string,
  apiKeyWorkforceWsId?: string
): Promise<WorkforceMutationGranted | WorkforceMutationDenied> {
  const access = await assertWorkforceMember(userId, workspaceId, 'viewer', apiKeyWorkforceWsId);
  if (!access.ok) {
    return {
      ok: false,
      status: access.status,
      code: access.code,
      message: access.message,
    };
  }

  const billing = await assertWorkspaceWritesAllowed(workspaceId);
  if (!billing.ok) {
    return {
      ok: false,
      status: billing.status,
      code: billing.code,
      message: billing.message,
    };
  }

  if (!canCreateWorkspaceMemory(access.role, billing.state)) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Not allowed to create workspace memory',
    };
  }

  return { ok: true };
}
