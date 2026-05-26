// SYNC: Dash-AIMemory/lib/plan-enforcement.ts
import { supabase } from './supabase.js';
import { getPlan, PLANS, type PlanDefinition, type PlanId } from './plans.js';

export type PlanLimitCode = 'PLAN_LIMIT_MEMORY' | 'PLAN_LIMIT_DAILY';

export const BILLING_UPGRADE_URL =
  process.env.BILLING_UPGRADE_URL || 'https://ia-memory-dashboard.vercel.app/billing';

export class PlanLimitError extends Error {
  readonly code: PlanLimitCode;
  readonly upgradeUrl: string;

  constructor(code: PlanLimitCode, message: string) {
    super(message);
    this.name = 'PlanLimitError';
    this.code = code;
    this.upgradeUrl = BILLING_UPGRADE_URL;
  }
}

export interface UserPlanContext {
  userId: string;
  planId: PlanId;
  subscriptionStatus: string | null;
  plan: PlanDefinition;
  limits: PlanDefinition['limits'];
}

const PAID_PLANS = new Set<PlanId>(['pro', 'team', 'enterprise']);

export function isPlanLimitsEnabled(): boolean {
  return process.env.PLAN_LIMITS_ENABLED !== 'false';
}

export function effectivePlanId(
  planId: string | null | undefined,
  subscriptionStatus: string | null | undefined
): PlanId {
  const id: PlanId = planId && planId in PLANS ? (planId as PlanId) : 'free';
  if (PAID_PLANS.has(id) && subscriptionStatus !== 'active') {
    return 'free';
  }
  return id;
}

export async function loadUserPlan(userId: string): Promise<UserPlanContext | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, plan, subscription_status')
    .eq('id', userId)
    .single();

  if (error || !data) return null;

  const planId = effectivePlanId(data.plan, data.subscription_status);
  const plan = getPlan(planId);

  return {
    userId: data.id,
    planId,
    subscriptionStatus: data.subscription_status,
    plan,
    limits: plan.limits,
  };
}

function startOfDayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function getMemoryCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) return 0;
  return count ?? 0;
}

export async function getDailyUsageCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfDayUtc());

  if (error) return 0;
  return count ?? 0;
}

export function isOverMemoryLimit(memoryCount: number, limits: PlanDefinition['limits']): boolean {
  if (limits.memories === -1) return false;
  return memoryCount >= limits.memories;
}

export function isOverDailyLimit(dailyUsage: number, limits: PlanDefinition['limits']): boolean {
  if (limits.requestsPerDay === -1) return false;
  return dailyUsage >= limits.requestsPerDay;
}

export interface AssertPlanLimitsOptions {
  userId: string;
  toolOrEndpoint: string;
  isForget?: boolean;
  isWriteMemory?: boolean;
}

export async function assertWithinPlanLimits(opts: AssertPlanLimitsOptions): Promise<UserPlanContext> {
  if (!isPlanLimitsEnabled()) {
    const ctx = await loadUserPlan(opts.userId);
    if (!ctx) throw new Error('User plan context unavailable');
    return ctx;
  }

  if (opts.isForget) {
    const ctx = await loadUserPlan(opts.userId);
    if (!ctx) throw new Error('User plan context unavailable');
    return ctx;
  }

  const ctx = await loadUserPlan(opts.userId);
  if (!ctx) throw new Error('User plan context unavailable');

  const [memoryCount, dailyUsage] = await Promise.all([
    getMemoryCount(opts.userId),
    getDailyUsageCount(opts.userId),
  ]);

  if (isOverDailyLimit(dailyUsage, ctx.limits)) {
    throw new PlanLimitError(
      'PLAN_LIMIT_DAILY',
      `Daily API limit reached (${ctx.limits.requestsPerDay} requests/day on ${ctx.plan.name}). Upgrade at ${BILLING_UPGRADE_URL}`
    );
  }

  if (opts.isWriteMemory && isOverMemoryLimit(memoryCount, ctx.limits)) {
    throw new PlanLimitError(
      'PLAN_LIMIT_MEMORY',
      `Memory storage limit reached (${ctx.limits.memories} on ${ctx.plan.name}). Delete memories with forget or upgrade at ${BILLING_UPGRADE_URL}`
    );
  }

  if (!opts.isWriteMemory && isOverMemoryLimit(memoryCount, ctx.limits)) {
    throw new PlanLimitError(
      'PLAN_LIMIT_MEMORY',
      `You have ${memoryCount} memories but your ${ctx.plan.name} plan allows ${ctx.limits.memories}. Use forget to delete memories or upgrade at ${BILLING_UPGRADE_URL}`
    );
  }

  return ctx;
}

export function formatPlanLimitToolError(err: PlanLimitError): string {
  return `${err.message}`;
}

export interface LogUsageInput {
  userId: string;
  apiKeyId?: string | null;
  endpoint: string;
  method?: string | null;
  status?: string;
  latencyMs?: number;
  tokensUsed?: number;
}

export function logUsage(input: LogUsageInput): void {
  void supabase
    .from('usage_logs')
    .insert({
      user_id: input.userId,
      api_key_id: input.apiKeyId ?? null,
      endpoint: input.endpoint,
      method: input.method ?? null,
      status: input.status ?? 'success',
      latency_ms: input.latencyMs ?? 0,
      tokens_used: input.tokensUsed ?? 0,
    })
    .then(({ error }) => {
      if (error) {
        console.error('[plan-enforcement] logUsage failed:', error.message);
      }
    });
}
