/**
 * Workforce RBAC helpers — viewer is strictly read-only.
 * SYNC: API-IAMemory/src/lib/workforce-rbac.ts
 */

import type { WorkforceRole } from './workforce-access.js';
import type { BillingState } from './workforce-billing-state.js';

export function canReadWorkspaceMemory(role: WorkforceRole): boolean {
  return ['owner', 'admin', 'member', 'viewer'].includes(role);
}

export function canCreateWorkspaceMemory(role: WorkforceRole, billing: BillingState): boolean {
  if (!billing.writesAllowed) return false;
  return ['owner', 'admin', 'member'].includes(role);
}

export function canEditWorkspaceMemory(
  role: WorkforceRole,
  memoryAuthorId: string,
  actorUserId: string,
  billing: BillingState
): boolean {
  if (!billing.writesAllowed) return false;
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'member' && memoryAuthorId === actorUserId) return true;
  return false;
}

export function canDeleteWorkspaceMemory(
  role: WorkforceRole,
  memoryAuthorId: string,
  actorUserId: string,
  billing: BillingState
): boolean {
  return canEditWorkspaceMemory(role, memoryAuthorId, actorUserId, billing);
}

export function canManageWorkforceAdmin(role: WorkforceRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function canInviteMembers(role: WorkforceRole, billing: BillingState): boolean {
  if (!billing.writesAllowed) return false;
  return canManageWorkforceAdmin(role);
}

export function canManageApiKeys(role: WorkforceRole, billing: BillingState): boolean {
  if (!billing.writesAllowed) return false;
  return canManageWorkforceAdmin(role);
}

export function canManageBilling(role: WorkforceRole): boolean {
  return role === 'owner';
}

export function canDeleteWorkspace(role: WorkforceRole): boolean {
  return role === 'owner';
}

export function canWriteWorkspace(role: WorkforceRole, billing: BillingState): boolean {
  if (role === 'viewer') return false;
  return billing.writesAllowed;
}
