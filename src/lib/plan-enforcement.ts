// SYNC: Dash-AIMemory/lib/plan-enforcement.ts
import { supabase } from './supabase.js';
import { getPlan, PLANS, type PlanDefinition, type PlanId } from './plans.js';

export type PlanLimitCode = 'PLAN_LIMIT_MEMORY' | 'PLAN_LIMIT_DAILY';

export const BILLING_UPGRADE_URL =
  process.env.BILLING_UPGRADE_URL || 'https://dashboard.memxus.com/billing';

export class PlanLimitError extends Error {
  readonly code: PlanLimitCode;
  readonly status: number;
  readonly upgradeUrl: string;
  readonly warnings?: PlanWarningState;

  constructor(code: PlanLimitCode, message: string, warnings?: PlanWarningState) {
    super(message);
    this.name = 'PlanLimitError';
    this.code = code;
    this.status = code === 'PLAN_LIMIT_DAILY' ? 429 : 403;
    this.upgradeUrl = BILLING_UPGRADE_URL;
    this.warnings = warnings;
  }
}

export interface UserPlanContext {
  userId: string;
  planId: PlanId;
  subscriptionStatus: string | null;
  plan: PlanDefinition;
  limits: PlanDefinition['limits'];
  dailyUsage?: number;
  memoryCount?: number;
  planWarnings?: PlanWarningState;
}

export type PlanWarningLevel = 'none' | 'approaching' | 'critical';

export interface PlanWarning {
  resource: 'memory' | 'daily';
  level: Exclude<PlanWarningLevel, 'none'>;
  current: number;
  limit: number;
  percent: number;
  message: string;
}

export interface PlanWarningState {
  level: PlanWarningLevel;
  warnings: PlanWarning[];
  message: string | null;
}

const WARN_APPROACHING_RATIO = 0.8;
const WARN_CRITICAL_RATIO = 0.95;

export const ABSOLUTE_RESULT_CEILING = 200;
export const DEFAULT_LIST_RESULTS = 20;
export const DEFAULT_SEARCH_RESULTS = 10;

export interface DailyRateLimitState {
  limit: number;
  remaining: number;
  resetUnix: number;
}

export function endOfDayUtcUnix(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);
  return Math.floor(d.getTime() / 1000);
}

export function clampResultLimit(
  requested: unknown,
  planMax: number,
  defaultWhenOmitted: number,
  absoluteCeiling = ABSOLUTE_RESULT_CEILING
): number {
  const cap = planMax < 0 ? absoluteCeiling : planMax;
  if (requested === undefined || requested === null || requested === '') {
    return Math.min(defaultWhenOmitted, cap);
  }
  const n = Number(requested);
  if (!Number.isFinite(n)) {
    return Math.min(defaultWhenOmitted, cap);
  }
  return Math.min(Math.max(1, Math.floor(n)), cap);
}

export function resolveListLimit(
  limits: PlanDefinition['limits'],
  requested?: unknown
): number {
  return clampResultLimit(requested, limits.listResultsMax, DEFAULT_LIST_RESULTS);
}

export function resolveSearchLimit(
  limits: PlanDefinition['limits'],
  requested?: unknown
): number {
  return clampResultLimit(requested, limits.searchResultsMax, DEFAULT_SEARCH_RESULTS);
}

export function buildDailyRateLimitState(
  limits: PlanDefinition['limits'],
  dailyUsage: number
): DailyRateLimitState {
  const limit = limits.requestsPerDay;
  const resetUnix = endOfDayUtcUnix();
  if (limit === -1) {
    return { limit: -1, remaining: -1, resetUnix };
  }
  return {
    limit,
    remaining: Math.max(0, limit - dailyUsage),
    resetUnix,
  };
}

export async function getDailyRateLimitState(userId: string): Promise<DailyRateLimitState | null> {
  const ctx = await loadUserPlan(userId);
  if (!ctx) return null;
  const dailyUsage = await getDailyUsageCount(userId);
  return buildDailyRateLimitState(ctx.limits, dailyUsage);
}

export function isPlanWarningsEnabled(): boolean {
  return process.env.ENABLE_PLAN_WARNINGS === 'true';
}

function warningLevelForRatio(ratio: number): PlanWarningLevel {
  if (ratio >= WARN_CRITICAL_RATIO) return 'critical';
  if (ratio >= WARN_APPROACHING_RATIO) return 'approaching';
  return 'none';
}

function maxWarningLevel(a: PlanWarningLevel, b: PlanWarningLevel): PlanWarningLevel {
  if (a === 'critical' || b === 'critical') return 'critical';
  if (a === 'approaching' || b === 'approaching') return 'approaching';
  return 'none';
}

function buildResourceWarning(
  resource: 'memory' | 'daily',
  current: number,
  limit: number,
  planName: string
): PlanWarning | null {
  if (limit === -1) return null;
  const ratio = current / limit;
  const level = warningLevelForRatio(ratio);
  if (level === 'none') return null;

  const percent = Math.min(100, Math.round(ratio * 100));
  const resourceLabel = resource === 'memory' ? 'memory storage' : 'daily API quota';
  const message =
    level === 'critical'
      ? `You have used ${percent}% of your ${resourceLabel} (${current}/${limit} on ${planName}). Upgrade at ${BILLING_UPGRADE_URL}`
      : `You are approaching your ${resourceLabel} limit (${current}/${limit}, ${percent}% on ${planName}). Upgrade at ${BILLING_UPGRADE_URL}`;

  return { resource, level, current, limit, percent, message };
}

export function buildPlanWarningState(
  limits: PlanDefinition['limits'],
  memoryCount: number,
  dailyUsage: number,
  planName: string
): PlanWarningState {
  if (!isPlanWarningsEnabled()) {
    return { level: 'none', warnings: [], message: null };
  }

  const warnings: PlanWarning[] = [];
  const memoryWarn = buildResourceWarning('memory', memoryCount, limits.memories, planName);
  if (memoryWarn) warnings.push(memoryWarn);
  const dailyWarn = buildResourceWarning('daily', dailyUsage, limits.requestsPerDay, planName);
  if (dailyWarn) warnings.push(dailyWarn);

  let level: PlanWarningLevel = 'none';
  for (const w of warnings) {
    level = maxWarningLevel(level, w.level);
  }

  const message = warnings.length > 0 ? warnings.map((w) => w.message).join(' ') : null;
  return { level, warnings, message };
}

export function getRetentionCutoffIso(retentionDays: number): string | null {
  if (retentionDays === -1) return null;
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - retentionDays);
  return d.toISOString();
}

export function pruneExpiredMemoriesForUser(
  userId: string,
  limits: PlanDefinition['limits']
): void {
  const cutoff = getRetentionCutoffIso(limits.retentionDays);
  if (!cutoff) return;

  void supabase
    .from('memories')
    .delete()
    .eq('user_id', userId)
    .lt('created_at', cutoff)
    .then(({ error }) => {
      if (error) {
        console.error('[plan-enforcement] pruneExpiredMemoriesForUser failed:', error.message);
      }
    });
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

export async function getMemoryCount(
  userId: string,
  limits?: PlanDefinition['limits']
): Promise<number> {
  let query = supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (limits) {
    const cutoff = getRetentionCutoffIso(limits.retentionDays);
    if (cutoff) {
      query = query.gte('created_at', cutoff);
    }
  }

  const { count, error } = await query;

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
    pruneExpiredMemoriesForUser(opts.userId, ctx.limits);
    const [memoryCount, dailyUsage] = await Promise.all([
      getMemoryCount(opts.userId, ctx.limits),
      getDailyUsageCount(opts.userId),
    ]);
    ctx.dailyUsage = dailyUsage;
    ctx.memoryCount = memoryCount;
    ctx.planWarnings = buildPlanWarningState(ctx.limits, memoryCount, dailyUsage, ctx.plan.name);
    return ctx;
  }

  if (opts.isForget) {
    const ctx = await loadUserPlan(opts.userId);
    if (!ctx) throw new Error('User plan context unavailable');
    const dailyUsage = await getDailyUsageCount(opts.userId);
    ctx.dailyUsage = dailyUsage;
    return ctx;
  }

  const ctx = await loadUserPlan(opts.userId);
  if (!ctx) throw new Error('User plan context unavailable');

  pruneExpiredMemoriesForUser(opts.userId, ctx.limits);

  const [memoryCount, dailyUsage] = await Promise.all([
    getMemoryCount(opts.userId, ctx.limits),
    getDailyUsageCount(opts.userId),
  ]);

  const warnState = buildPlanWarningState(ctx.limits, memoryCount, dailyUsage, ctx.plan.name);
  ctx.dailyUsage = dailyUsage;
  ctx.memoryCount = memoryCount;
  ctx.planWarnings = warnState;

  if (isOverDailyLimit(dailyUsage, ctx.limits)) {
    throw new PlanLimitError(
      'PLAN_LIMIT_DAILY',
      `Daily API limit reached (${ctx.limits.requestsPerDay} requests/day on ${ctx.plan.name}). Upgrade at ${BILLING_UPGRADE_URL}`,
      warnState
    );
  }

  if (opts.isWriteMemory && isOverMemoryLimit(memoryCount, ctx.limits)) {
    throw new PlanLimitError(
      'PLAN_LIMIT_MEMORY',
      `Memory storage limit reached (${ctx.limits.memories} on ${ctx.plan.name}). Delete memories with forget or upgrade at ${BILLING_UPGRADE_URL}`,
      warnState
    );
  }

  if (!opts.isWriteMemory && isOverMemoryLimit(memoryCount, ctx.limits)) {
    throw new PlanLimitError(
      'PLAN_LIMIT_MEMORY',
      `You have ${memoryCount} memories but your ${ctx.plan.name} plan allows ${ctx.limits.memories}. Use forget to delete memories or upgrade at ${BILLING_UPGRADE_URL}`,
      warnState
    );
  }

  return ctx;
}

export function formatPlanLimitToolError(err: PlanLimitError): string {
  if (!err.warnings?.message || err.warnings.level === 'none') {
    return err.message;
  }
  return `${err.message}\n\n${err.warnings.message}`;
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
