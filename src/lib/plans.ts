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

export interface PlanDefinition {
  id: PlanId;
  name: string;
  category: PlanCategory;
  priceMonthly: number; // USD
  priceLabel: string;
  description: string;
  features: string[];
  limits: {
    apiKeys: number; // -1 = unlimited
    requestsPerDay: number;
    memories: number;
  };
  popular?: boolean;
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
      '100 API calls / day',
      '500 memories stored',
      'Basic semantic search',
      '7-day memory retention',
      'Community support',
    ],
    limits: { apiKeys: 1, requestsPerDay: 100, memories: 500 },
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
      '10,000 API calls / day',
      '5,000 memories stored',
      'Advanced semantic search',
      '90-day memory retention',
      'Priority recall',
      'Priority email support',
      'API access',
    ],
    limits: { apiKeys: 5, requestsPerDay: 10_000, memories: 5_000 },
    popular: true,
    polarProductIdEnv: 'NEXT_PUBLIC_POLAR_PRODUCT_PRO',
  },
  team: {
    id: 'team',
    name: 'Team',
    category: 'dashboard',
    priceMonthly: 49,
    priceLabel: '$49',
    description: 'For teams standardizing on shared memory',
    features: [
      'Everything in Pro',
      '25,000 memories stored',
      'Unlimited API calls',
      'Unlimited memory retention',
      'Team analytics',
      'Role-based access control',
      'Dedicated support',
    ],
    limits: { apiKeys: -1, requestsPerDay: -1, memories: 25_000 },
    polarProductIdEnv: 'NEXT_PUBLIC_POLAR_PRODUCT_TEAM',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    category: 'dashboard',
    priceMonthly: 199,
    priceLabel: '$199',
    description: 'For regulated or large-scale deployments',
    features: [
      'Everything in Team',
      'Unlimited memories',
      'Unlimited workspaces',
      'SLA 99.95% uptime',
      'SSO / SAML authentication',
      'Audit logs',
      'Custom integrations',
      'Dedicated support manager',
    ],
    limits: { apiKeys: -1, requestsPerDay: -1, memories: -1 },
    polarProductIdEnv: 'NEXT_PUBLIC_POLAR_PRODUCT_ENTERPRISE',
  },
  'ext-starter': {
    id: 'ext-starter',
    name: 'Extension Starter',
    category: 'extension',
    priceMonthly: 3,
    priceLabel: '$3',
    description: 'Browser memory, getting started',
    features: ['Single browser', '500 memories', 'Local sync'],
    limits: { apiKeys: 0, requestsPerDay: 500, memories: 500 },
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
    limits: { apiKeys: 0, requestsPerDay: 5_000, memories: 5_000 },
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
    limits: { apiKeys: 0, requestsPerDay: 50_000, memories: 50_000 },
    polarProductIdEnv: 'NEXT_PUBLIC_POLAR_PRODUCT_EXT_PREMIUM',
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'team', 'enterprise'];
export const EXTENSION_PLAN_ORDER: PlanId[] = ['ext-starter', 'ext-plus', 'ext-premium'];

export function getPlan(planId: string | null | undefined): PlanDefinition {
  if (planId && planId in PLANS) {
    return PLANS[planId as PlanId];
  }
  return PLANS.free;
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
  return null;
}
