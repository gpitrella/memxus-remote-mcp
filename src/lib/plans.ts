// SYNC: Dash-AIMemory/lib/plans.ts — keep limits in sync when changing plans.
/**
 * Single source of truth for plans across the dashboard, billing, and
 * Polar webhooks. The `polarProductIdEnv` is the name of the env var that
 * holds the Polar product id — looked up lazily so the registry can be
 * imported from both server and client without leaking secrets.
 */
export type PlanId =
  | 'free'
  | 'pro'
  | 'team'
  | 'enterprise'
  | 'ext-starter'
  | 'ext-plus'
  | 'ext-premium';

export type PlanCategory = 'dashboard' | 'extension';

const MB = 1024 * 1024;

export interface LaunchPromo {
  pricePerMonth: number;
  durationMonths: number;
  maxRedemptions: number;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  category: PlanCategory;
  priceMonthly: number; // USD; 0 for free / contact-sales
  priceLabel: string;
  description: string;
  features: string[];
  limits: {
    apiKeys: number; // -1 = unlimited
    requestsPerDay: number; // -1 = unlimited
    memories: number; // -1 = unlimited (user-facing)
    storageBytes: number; // -1 = no published cap; Pro/Team use explicit bytes
    fairUseStorageBytes?: number; // Free internal guard (not shown on cards)
    retentionDays: number; // -1 = permanent
    coldArchiveDays?: number; // Free: days archived before purge
    listResultsMax: number;
    searchResultsMax: number;
  };
  launchPromo?: LaunchPromo;
  popular?: boolean;
  /** No Polar checkout — link to sales instead (Enterprise). */
  contactSalesOnly?: boolean;
  polarProductIdEnv: string;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    category: 'dashboard',
    priceMonthly: 0,
    priceLabel: '$0',
    description: 'Perfect for trying MCP, GPT Actions, or the SDK',
    features: [
      'Unlimited memories · 30-day history',
      '150 API calls / day',
      '1 shared group (up to 3 members)',
      'Basic semantic search',
      'Community support',
    ],
    limits: {
      apiKeys: 1,
      requestsPerDay: 150,
      memories: -1,
      storageBytes: -1,
      fairUseStorageBytes: 5 * MB,
      retentionDays: 30,
      coldArchiveDays: 90,
      listResultsMax: 25,
      searchResultsMax: 10,
    },
    polarProductIdEnv: '',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    category: 'dashboard',
    priceMonthly: 12,
    priceLabel: '$12',
    description: 'For power users and solo builders',
    features: [
      'Permanent memory — your AI never forgets',
      'Unlimited memories',
      '1,500 API calls / day',
      'Advanced semantic search',
      'Unlimited shared groups (up to 10 members each)',
      'Priority recall',
      'Priority email support',
      'API access',
    ],
    limits: {
      apiKeys: 5,
      requestsPerDay: 1_500,
      memories: -1,
      storageBytes: 25 * MB,
      retentionDays: -1,
      listResultsMax: 50,
      searchResultsMax: 20,
    },
    launchPromo: { pricePerMonth: 6, durationMonths: 12, maxRedemptions: 100 },
    popular: true,
    polarProductIdEnv: 'NEXT_PUBLIC_POLAR_PRODUCT_PRO',
  },
  team: {
    id: 'team',
    name: 'Team',
    category: 'dashboard',
    priceMonthly: 149,
    priceLabel: '$149',
    description: 'For teams standardizing on shared memory',
    features: [
      'Everything in Pro',
      'Shared, permanent team memory',
      'Unlimited memories & members',
      'Unlimited API calls',
      'Team analytics',
      'Role-based access control',
      'Dedicated support',
    ],
    limits: {
      apiKeys: -1,
      requestsPerDay: -1,
      memories: -1,
      storageBytes: 352 * MB,
      retentionDays: -1,
      listResultsMax: 100,
      searchResultsMax: 50,
    },
    polarProductIdEnv: 'NEXT_PUBLIC_POLAR_PRODUCT_TEAM',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    category: 'dashboard',
    priceMonthly: 0,
    priceLabel: 'Contact Sales',
    description: 'For regulated or large-scale deployments',
    contactSalesOnly: true,
    features: [
      'Everything in Team',
      'Unlimited memories & storage',
      'Unlimited workspaces',
      'SLA 99.95% uptime',
      'SSO / SAML authentication',
      'Audit logs',
      'Custom integrations',
      'Dedicated support manager',
    ],
    limits: {
      apiKeys: -1,
      requestsPerDay: -1,
      memories: -1,
      storageBytes: -1,
      retentionDays: -1,
      listResultsMax: 200,
      searchResultsMax: 100,
    },
    polarProductIdEnv: '',
  },
  'ext-starter': {
    id: 'ext-starter',
    name: 'Extension Starter',
    category: 'extension',
    priceMonthly: 3,
    priceLabel: '$3',
    description: 'Browser memory, getting started',
    features: ['Single browser', '500 memories', 'Local sync'],
    limits: {
      apiKeys: 0,
      requestsPerDay: 500,
      memories: 500,
      storageBytes: 3 * MB,
      retentionDays: 30,
      listResultsMax: 25,
      searchResultsMax: 10,
    },
    polarProductIdEnv: 'NEXT_PUBLIC_POLAR_PRODUCT_EXT_STARTER',
  },
  'ext-plus': {
    id: 'ext-plus',
    name: 'Extension Plus',
    category: 'extension',
    priceMonthly: 9,
    priceLabel: '$9',
    description: 'Daily AI workflows',
    features: ['All browsers', '5,000 memories', 'Cloud sync'],
    limits: {
      apiKeys: 0,
      requestsPerDay: 5_000,
      memories: 5_000,
      storageBytes: 50 * MB,
      retentionDays: 90,
      listResultsMax: 50,
      searchResultsMax: 20,
    },
    polarProductIdEnv: 'NEXT_PUBLIC_POLAR_PRODUCT_EXT_PLUS',
  },
  'ext-premium': {
    id: 'ext-premium',
    name: 'Extension Premium',
    category: 'extension',
    priceMonthly: 29,
    priceLabel: '$29',
    description: 'Heavy AI usage',
    features: ['All browsers', '50,000 memories', 'Priority recall'],
    limits: {
      apiKeys: 0,
      requestsPerDay: 50_000,
      memories: 50_000,
      storageBytes: 500 * MB,
      retentionDays: -1,
      listResultsMax: 100,
      searchResultsMax: 50,
    },
    polarProductIdEnv: 'NEXT_PUBLIC_POLAR_PRODUCT_EXT_PREMIUM',
  },
};

/** Public dashboard plans shown in billing UI and marketing. */
export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'team', 'enterprise'];
/** Personal dashboard plans that bill through Polar subscriptions. */
export const DASHBOARD_PAID_PLAN_IDS: PlanId[] = ['pro', 'team'];
/** Legacy extension SKUs — kept for webhook/backfill; not sold in UI. */
export const EXTENSION_PLAN_ORDER: PlanId[] = ['ext-starter', 'ext-plus', 'ext-premium'];
/** Chrome extension upgrade page — same Polar products as /billing. */
export const EXTENSION_UPGRADE_PLAN_ORDER: PlanId[] = ['pro', 'team'];
/** Public pricing page tiers (excludes Enterprise contact-sales). */
export const PUBLIC_PRICING_PLANS = ['Free', 'Pro', 'Team'] as const;

/** Legacy DB value — maps to pro (active sub) or free. */
export function normalizeLegacyPlanId(
  planId: string | null | undefined,
  subscriptionStatus?: string | null
): PlanId {
  if (planId === 'starter') {
    return subscriptionStatus === 'active' ? 'pro' : 'free';
  }
  if (planId && planId in PLANS) {
    return planId as PlanId;
  }
  return 'free';
}

export function getPlan(planId: string | null | undefined): PlanDefinition {
  const id = normalizeLegacyPlanId(planId);
  return PLANS[id];
}

/** Server-side: look up the Polar product id for a plan id. */
export function getPolarProductId(planId: PlanId): string {
  const def = PLANS[planId];
  if (!def?.polarProductIdEnv) return '';
  return process.env[def.polarProductIdEnv] || '';
}

/** Reverse lookup: given a Polar product id, find the plan id. */
export function planIdFromProduct(productId: string | null | undefined): PlanId | null {
  if (!productId) return null;
  for (const id of Object.keys(PLANS) as PlanId[]) {
    if (getPolarProductId(id) === productId) return id;
  }
  // Legacy Starter product id — treat as Pro if still configured
  const legacyStarter = process.env.NEXT_PUBLIC_POLAR_PRODUCT_STARTER;
  if (legacyStarter && legacyStarter === productId) return 'pro';
  return null;
}

export function getEffectiveStorageLimit(limits: PlanDefinition['limits']): number {
  if (limits.fairUseStorageBytes != null) return limits.fairUseStorageBytes;
  if (limits.storageBytes === -1) return -1;
  return limits.storageBytes;
}
