// SYNC: Dash-AIMemory/lib/plans.ts — keep limits in sync when changing plans.
/**
 * Single source of truth for plans across the dashboard, billing, and
 * Polar webhooks. The `polarProductIdEnv` is the name of the env var that
 * holds the Polar product id — looked up lazily so the registry can be
 * imported from both server and client without leaking secrets.
 */
export type PlanId =
  | 'free'
  | 'starter'
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
  priceMonthly: number; // USD; 0 for free / contact-sales
  priceLabel: string;
  description: string;
  features: string[];
  limits: {
    apiKeys: number; // -1 = unlimited
    requestsPerDay: number; // -1 = unlimited
    memories: number; // -1 = unlimited
    storageBytes: number; // -1 = unlimited
    retentionDays: number; // -1 = unlimited retention
    listResultsMax: number; // per GET /memories; -1 = server absolute ceiling
    searchResultsMax: number; // per POST /memories/search; -1 = server absolute ceiling
  };
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
      '150 API calls / day',
      '40 memories stored',
      '1 MB storage',
      'Basic semantic search',
      '30-day memory retention',
      '1 shared group (up to 3 members)',
      'Community support',
    ],
    limits: {
      apiKeys: 1,
      requestsPerDay: 150,
      memories: 40,
      storageBytes: 1_048_576,
      retentionDays: 30,
      listResultsMax: 25,
      searchResultsMax: 10,
    },
    polarProductIdEnv: '',
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    category: 'dashboard',
    priceMonthly: 3.99,
    priceLabel: '$3.99',
    description: 'More room for daily AI workflows',
    features: [
      '500 API calls / day',
      '150 memories stored',
      '3 MB storage',
      '60-day memory retention',
      '2 shared groups (up to 5 members each)',
      'Email support',
    ],
    limits: {
      apiKeys: 2,
      requestsPerDay: 500,
      memories: 150,
      storageBytes: 3_145_728,
      retentionDays: 60,
      listResultsMax: 35,
      searchResultsMax: 15,
    },
    polarProductIdEnv: 'NEXT_PUBLIC_POLAR_PRODUCT_STARTER',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    category: 'dashboard',
    priceMonthly: 12,
    priceLabel: '$12',
    description: 'For power users and solo builders',
    features: [
      '1,500 API calls / day',
      '400 memories stored',
      '10 MB storage',
      'Advanced semantic search',
      '90-day memory retention',
      'Unlimited shared groups (up to 10 members each)',
      'Priority recall',
      'Priority email support',
      'API access',
    ],
    limits: {
      apiKeys: 5,
      requestsPerDay: 1_500,
      memories: 400,
      storageBytes: 10_485_760,
      retentionDays: 90,
      listResultsMax: 50,
      searchResultsMax: 20,
    },
    popular: true,
    polarProductIdEnv: 'NEXT_PUBLIC_POLAR_PRODUCT_PRO',
  },
  team: {
    id: 'team',
    name: 'Team',
    category: 'dashboard',
    priceMonthly: 99,
    priceLabel: '$99',
    description: 'For teams standardizing on shared memory',
    features: [
      'Everything in Pro',
      '25,000 memories stored',
      '~352 MB storage',
      'Unlimited API calls',
      'Unlimited memory retention',
      'Unlimited shared groups & members',
      'Team analytics',
      'Role-based access control',
      'Dedicated support',
    ],
    limits: {
      apiKeys: -1,
      requestsPerDay: -1,
      memories: 25_000,
      storageBytes: 368_951_296,
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
      storageBytes: 3_145_728,
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
      storageBytes: 52_428_800,
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
      storageBytes: 524_288_000,
      retentionDays: -1,
      listResultsMax: 100,
      searchResultsMax: 50,
    },
    polarProductIdEnv: 'NEXT_PUBLIC_POLAR_PRODUCT_EXT_PREMIUM',
  },
};

/** Public dashboard plans shown in billing UI and marketing. Starter is implemented but hidden. */
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
