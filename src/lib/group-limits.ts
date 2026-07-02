/**
 * Plan limits for consumer shared groups.
 * SYNC: RemoteMCP-AIMemory/src/lib/group-limits.ts (read-only limits map)
 */

import { supabase } from './supabase.js';
import { effectivePlanId, loadUserPlan } from './plan-enforcement.js';
import type { PlanId } from './plans.js';

export interface GroupPlanLimits {
  maxGroupsOwned: number;
  maxMembersPerGroup: number;
}

const GROUP_LIMITS: Record<PlanId, GroupPlanLimits> = {
  free: { maxGroupsOwned: 1, maxMembersPerGroup: 3 },
  pro: { maxGroupsOwned: -1, maxMembersPerGroup: 10 },
  team: { maxGroupsOwned: -1, maxMembersPerGroup: -1 },
  enterprise: { maxGroupsOwned: -1, maxMembersPerGroup: -1 },
  'ext-starter': { maxGroupsOwned: 1, maxMembersPerGroup: 3 },
  'ext-plus': { maxGroupsOwned: 3, maxMembersPerGroup: 5 },
  'ext-premium': { maxGroupsOwned: 5, maxMembersPerGroup: 10 },
};

export function getGroupLimitsForPlan(planId: PlanId): GroupPlanLimits {
  return GROUP_LIMITS[planId] ?? GROUP_LIMITS.free;
}

export async function getUserGroupLimits(userId: string): Promise<GroupPlanLimits> {
  const ctx = await loadUserPlan(userId);
  const planId = ctx?.planId ?? 'free';
  return getGroupLimitsForPlan(effectivePlanId(planId, ctx?.subscriptionStatus));
}

export async function assertCanCreateGroup(
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const limits = await getUserGroupLimits(userId);
  if (limits.maxGroupsOwned < 0) return { ok: true };

  const { count, error } = await supabase
    .from('shared_groups')
    .select('*', { count: 'exact', head: true })
    .eq('owner_user_id', userId)
    .is('deleted_at', null);

  if (error) {
    return { ok: false, message: error.message };
  }

  if ((count ?? 0) >= limits.maxGroupsOwned) {
    return {
      ok: false,
      message: `Your plan allows up to ${limits.maxGroupsOwned} group(s). Upgrade to create more.`,
    };
  }

  return { ok: true };
}

export async function assertCanInviteMember(
  groupId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const limits = await getUserGroupLimits(userId);
  if (limits.maxMembersPerGroup < 0) return { ok: true };

  const { count, error } = await supabase
    .from('shared_group_members')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .eq('status', 'active');

  if (error) {
    return { ok: false, message: error.message };
  }

  if ((count ?? 0) >= limits.maxMembersPerGroup) {
    return {
      ok: false,
      message: `This group has reached the member limit (${limits.maxMembersPerGroup}) for your plan.`,
    };
  }

  return { ok: true };
}
