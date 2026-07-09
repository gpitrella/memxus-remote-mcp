/**
 * Workforce billing state — single source of truth for trial/grace/active gates.
 * SYNC: API-IAMemory/src/lib/workforce-billing-state.ts
 */

import { supabase } from './supabase.js';

export const WORKFORCE_TRIAL_DAYS = Number(process.env.WORKFORCE_TRIAL_DAYS ?? 14);
export const WORKFORCE_TRIAL_GRACE_DAYS = Number(process.env.WORKFORCE_TRIAL_GRACE_DAYS ?? 15);

export type WorkforceSubscriptionStatus =
  | 'pending'
  | 'trialing'
  | 'trial_expired'
  | 'active'
  | 'canceled'
  | 'scheduled_for_deletion'
  | 'archived';

export type WorkspaceBillingRow = {
  id: string;
  subscription_status: string;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  grace_ends_at?: string | null;
  scheduled_deletion_at?: string | null;
  created_at?: string | null;
  polar_subscription_id?: string | null;
};

export type BillingState = {
  status: WorkforceSubscriptionStatus;
  readsAllowed: boolean;
  writesAllowed: boolean;
  daysRemaining?: number;
  trialEndsAt?: string;
  graceEndsAt?: string;
};

export type BillingDenied = {
  ok: false;
  status: 402 | 404;
  code: 'SUBSCRIPTION_REQUIRED' | 'NOT_FOUND' | 'WORKSPACE_ARCHIVED';
  message: string;
};

export type BillingGranted = { ok: true; state: BillingState };

export type BillingGateResult = BillingGranted | BillingDenied;

function addDays(iso: string, days: number): Date {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.ceil((toMs - fromMs) / (24 * 60 * 60 * 1000)));
}

/** Derive effective billing state from row + now (UTC). */
export function getWorkspaceBillingState(ws: WorkspaceBillingRow, now = Date.now()): BillingState {
  const stored = ws.subscription_status as WorkforceSubscriptionStatus;

  if (stored === 'active') {
    return { status: 'active', readsAllowed: true, writesAllowed: true };
  }
  if (stored === 'archived') {
    return { status: 'archived', readsAllowed: false, writesAllowed: false };
  }
  if (stored === 'canceled') {
    return { status: 'canceled', readsAllowed: true, writesAllowed: false };
  }
  if (stored === 'pending') {
    return { status: 'pending', readsAllowed: false, writesAllowed: false };
  }

  const startIso = ws.trial_started_at ?? ws.created_at ?? new Date().toISOString();
  const trialEnd = ws.trial_ends_at
    ? new Date(ws.trial_ends_at).getTime()
    : addDays(startIso, WORKFORCE_TRIAL_DAYS).getTime();
  const graceEnd = ws.grace_ends_at
    ? new Date(ws.grace_ends_at).getTime()
    : addDays(new Date(trialEnd).toISOString(), WORKFORCE_TRIAL_GRACE_DAYS).getTime();

  const trialEndsAt = new Date(trialEnd).toISOString();
  const graceEndsAt = new Date(graceEnd).toISOString();

  if (now < trialEnd) {
    return {
      status: 'trialing',
      readsAllowed: true,
      writesAllowed: true,
      daysRemaining: daysBetween(now, trialEnd),
      trialEndsAt,
      graceEndsAt,
    };
  }
  if (now < graceEnd) {
    return {
      status: 'trial_expired',
      readsAllowed: true,
      writesAllowed: false,
      trialEndsAt,
      graceEndsAt,
    };
  }
  if (stored === 'scheduled_for_deletion' || ws.scheduled_deletion_at) {
    return {
      status: 'scheduled_for_deletion',
      readsAllowed: true,
      writesAllowed: false,
      trialEndsAt,
      graceEndsAt,
    };
  }

  return {
    status: 'scheduled_for_deletion',
    readsAllowed: true,
    writesAllowed: false,
    trialEndsAt,
    graceEndsAt,
  };
}

export async function fetchWorkspaceBillingRow(
  workspaceId: string
): Promise<WorkspaceBillingRow | null> {
  const { data, error } = await supabase
    .from('workforce_workspaces')
    .select(
      'id, subscription_status, trial_started_at, trial_ends_at, grace_ends_at, scheduled_deletion_at, created_at, polar_subscription_id'
    )
    .eq('id', workspaceId)
    .maybeSingle();

  if (error || !data) return null;
  return data as WorkspaceBillingRow;
}

export async function assertWorkspaceReadsAllowed(
  workspaceId: string
): Promise<BillingGateResult> {
  const row = await fetchWorkspaceBillingRow(workspaceId);
  if (!row) {
    return {
      ok: false,
      status: 404,
      code: 'NOT_FOUND',
      message: 'Workspace not found',
    };
  }
  const state = getWorkspaceBillingState(row);
  if (!state.readsAllowed) {
    return {
      ok: false,
      status: 402,
      code: state.status === 'archived' ? 'WORKSPACE_ARCHIVED' : 'SUBSCRIPTION_REQUIRED',
      message:
        state.status === 'archived'
          ? 'This workspace has been archived.'
          : 'Workforce subscription required.',
    };
  }
  return { ok: true, state };
}

export async function assertWorkspaceWritesAllowed(
  workspaceId: string
): Promise<BillingGateResult> {
  const readGate = await assertWorkspaceReadsAllowed(workspaceId);
  if (!readGate.ok) return readGate;
  if (!readGate.state.writesAllowed) {
    return {
      ok: false,
      status: 402,
      code: 'SUBSCRIPTION_REQUIRED',
      message:
        readGate.state.status === 'trial_expired'
          ? 'Trial expired. Upgrade to continue writing.'
          : 'Workforce subscription required. Complete payment to continue.',
    };
  }
  return readGate;
}
