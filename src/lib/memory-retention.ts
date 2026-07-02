/**
 * Pricing v3 — archive / restore / retention cron.
 * SYNC: RemoteMCP-AIMemory/src/lib/memory-retention.ts
 */

import { supabaseAdmin } from './supabase';
import { getRetentionCutoffIso } from './plan-enforcement';

export function isPricingV3RetentionEnabled(): boolean {
  return process.env.PRICING_V3_RETENTION === 'true';
}

export async function archiveExpiredMemoriesForFreeUsers(): Promise<{
  usersAffected: number;
  archivedCount: number;
}> {
  const cutoff = getRetentionCutoffIso(30);
  if (!cutoff) return { usersAffected: 0, archivedCount: 0 };

  const { data: freeUsers, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('plan', 'free')
    .or('subscription_status.is.null,subscription_status.neq.active');

  if (usersError || !freeUsers?.length) {
    return { usersAffected: 0, archivedCount: 0 };
  }

  let archivedCount = 0;
  for (const user of freeUsers) {
    const { data, error } = await supabaseAdmin
      .from('memories')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('status', 'active')
      .lt('created_at', cutoff)
      .select('id');

    if (!error && data) {
      archivedCount += data.length;
      if (data.length > 0) {
        await emitPlanEvent(user.id, 'memory_archived', { count: data.length });
      }
    }
  }

  return { usersAffected: freeUsers.length, archivedCount };
}

export async function purgeColdArchivedMemories(): Promise<number> {
  const purgeBefore = new Date();
  purgeBefore.setUTCDate(purgeBefore.getUTCDate() - 90);

  const { data, error } = await supabaseAdmin
    .from('memories')
    .delete()
    .eq('status', 'archived')
    .lt('archived_at', purgeBefore.toISOString())
    .select('id');

  if (error) return 0;
  return data?.length ?? 0;
}

export async function restoreArchivedMemoriesForUser(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('memories')
    .update({ status: 'active', archived_at: null })
    .eq('user_id', userId)
    .eq('status', 'archived')
    .select('id');

  if (error) return 0;
  const count = data?.length ?? 0;
  if (count > 0) {
    await emitPlanEvent(userId, 'memory_restored', { count });
  }
  return count;
}

export async function getArchivedMemoryCount(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('memories')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'archived');

  if (error) return 0;
  return count ?? 0;
}

export async function getExpiringThisWeekCount(userId: string): Promise<number> {
  const warnCutoff = new Date();
  warnCutoff.setUTCDate(warnCutoff.getUTCDate() - 23);

  const { count, error } = await supabaseAdmin
    .from('memories')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('created_at', warnCutoff.toISOString());

  if (error) return 0;
  return count ?? 0;
}

async function emitPlanEvent(
  userId: string,
  eventType: string,
  metadata: Record<string, unknown>
): Promise<void> {
  void supabaseAdmin
    .from('plan_events')
    .insert({ user_id: userId, event_type: eventType, metadata })
    .then(({ error }) => {
      if (error) {
        console.error('[memory-retention] plan_events insert failed:', error.message);
      }
    });
}

export async function runRetentionCron(): Promise<{
  archivedCount: number;
  purgedCount: number;
  usersAffected: number;
}> {
  const archiveResult = await archiveExpiredMemoriesForFreeUsers();
  const purgedCount = await purgeColdArchivedMemories();
  return {
    archivedCount: archiveResult.archivedCount,
    purgedCount,
    usersAffected: archiveResult.usersAffected,
  };
}
