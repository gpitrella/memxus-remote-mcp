/**
 * Session token savings — real injected token counts (auditable).
 */

export const ENABLE_IMPACT_SUMMARY = 'ENABLE_IMPACT_SUMMARY';

/** @deprecated Legacy baseline constant; not used for user-facing copy. */
export const EXPLORATION_OVERHEAD_TOKENS = 3_500;

/** @deprecated Legacy baseline constant; not used for user-facing copy. */
export const SKILLS_DISCOVERY_OVERHEAD_TOKENS = 800;

export type ImpactMetrics = {
  tokensSaved: number;
};

export type ImpactSummaryRow = {
  icon: string;
  label: string;
  value: string;
  unit: string;
};

/** @deprecated Legacy options for sin/con comparison; not used by buildImpactPayload. */
export type ImpactSessionOptions = {
  memoryBankTokens?: number;
  skillsIncluded?: boolean;
};

/** @deprecated Legacy comparison model; not used for user-facing copy. */
export type ImpactSessionComparison = {
  tokensWithMemxus: number;
  tokensWithoutMemxus: number;
  tokensSaved: number;
  breakdown: {
    contextOrExploration: number;
    skillsDiscovery: number;
    memoryBankTokens: number;
  };
};

export function isImpactSummaryEnabled(): boolean {
  return process.env[ENABLE_IMPACT_SUMMARY]?.trim().toLowerCase() === 'true';
}

/** @deprecated Legacy baseline; not used for user-facing copy. */
export function estimateBaselineWithoutMemxus(
  tokensWithMemxus: number,
  options: ImpactSessionOptions = {},
): ImpactSessionComparison {
  const memoryBankTokens = Math.max(0, Math.round(options.memoryBankTokens ?? 0));
  const contextOrExploration = Math.max(memoryBankTokens, EXPLORATION_OVERHEAD_TOKENS);
  const skillsDiscovery = options.skillsIncluded ? SKILLS_DISCOVERY_OVERHEAD_TOKENS : 0;
  const tokensWithoutMemxus = contextOrExploration + skillsDiscovery;
  const tokensWith = Math.max(0, Math.round(tokensWithMemxus));
  const tokensSaved = Math.max(0, tokensWithoutMemxus - tokensWith);

  return {
    tokensWithMemxus: tokensWith,
    tokensWithoutMemxus,
    tokensSaved,
    breakdown: {
      contextOrExploration,
      skillsDiscovery,
      memoryBankTokens,
    },
  };
}

/** @deprecated Use formatContextReuseSummary; kept for legacy callers. */
export function estimateTokensSaved(contextTokens: number, _memxusOverhead = 120): number {
  return Math.max(0, Math.round(contextTokens));
}

export function computeImpact(tokensSaved: number): ImpactMetrics {
  return { tokensSaved: Math.max(0, Math.round(tokensSaved)) };
}

function formatTokenNum(n: number): string {
  if (n >= 1000) return `~${n.toLocaleString('en-US')}`;
  return `~${n}`;
}

export function formatContextReuseSummary(tokensInjected: number): string {
  const n = Math.max(0, Math.round(tokensInjected));
  return `⚡ ${formatTokenNum(n)} tokens de contexto reutilizados — Contexto de tu proyecto que Memxus recuperó y no tuviste que reescribir.`;
}

export function formatSkillInjectedSummary(skillName: string, tokensInjected: number): string {
  const n = Math.max(0, Math.round(tokensInjected));
  return `🧩 Skill '${skillName}' cargada — ${formatTokenNum(n)} tokens de guía inyectados — Mejores prácticas que el LLM ahora conoce sin gastar la conversación en definirlas.`;
}

export function buildImpactSummaryRows(impact: ImpactMetrics): ImpactSummaryRow[] {
  return [{ icon: '⚡', label: 'Tokens', value: formatTokenNum(impact.tokensSaved), unit: '' }];
}

/** @deprecated Legacy sin/con table; not used for user-facing copy. */
export function formatImpactComparisonTable(comparison: ImpactSessionComparison): string {
  const { tokensWithMemxus, tokensWithoutMemxus, tokensSaved } = comparison;
  const lines = [
    '## Esta sesión: Memxus vs sin Memxus',
    '',
    '| | Sin Memxus (est.) | Con Memxus | Ahorro |',
    '|---|-------------------|------------|--------|',
    `| ⚡ Tokens | ${formatTokenNum(tokensWithoutMemxus)} | ${formatTokenNum(tokensWithMemxus)} | ${formatTokenNum(tokensSaved)} |`,
  ];
  return lines.join('\n');
}

/** @deprecated Legacy table format. */
export function formatImpactSummaryTable(impact: ImpactMetrics): string {
  const rows = buildImpactSummaryRows(impact);
  const lines = [
    '## Esta sesión, Memxus te ahorró',
    '',
    '| | Estimado |',
    '|---|----------|',
    ...rows.map((r) => `| ${r.icon} ${r.label} | ${r.value} |`),
  ];
  return lines.join('\n');
}

export type ImpactPayload = {
  impact_summary: {
    rows: ImpactSummaryRow[];
    metrics: ImpactMetrics;
    tokens_injected: number;
  };
  impact_summary_text: string;
};

export function buildImpactPayload(tokensInjected: number): ImpactPayload | null {
  if (!isImpactSummaryEnabled()) return null;
  const tokens = Math.max(0, Math.round(tokensInjected));
  const metrics = computeImpact(tokens);
  return {
    impact_summary: {
      rows: buildImpactSummaryRows(metrics),
      metrics,
      tokens_injected: tokens,
    },
    impact_summary_text: formatContextReuseSummary(tokens),
  };
}

export function buildSkillImpactFields(
  skillName: string,
  tokensInjected: number,
): { skill_tokens_used: number; skill_impact_text: string } | null {
  if (!isImpactSummaryEnabled()) return null;
  const tokens = Math.max(0, Math.round(tokensInjected));
  return {
    skill_tokens_used: tokens,
    skill_impact_text: formatSkillInjectedSummary(skillName, tokens),
  };
}

export type ImpactContextResponse = {
  contextBlock: string;
  tokens_used: number;
  truncated: boolean;
  impact_summary?: ImpactPayload['impact_summary'];
  impact_summary_text?: string;
};

export function applyImpactToContextResponse(
  contextBlock: string,
  tokensUsed: number,
  truncated: boolean,
): ImpactContextResponse {
  const base: ImpactContextResponse = { contextBlock, tokens_used: tokensUsed, truncated };
  try {
    const impact = buildImpactPayload(tokensUsed);
    if (!impact) return base;
    return {
      contextBlock,
      tokens_used: tokensUsed,
      truncated,
      impact_summary: impact.impact_summary,
      impact_summary_text: impact.impact_summary_text,
    };
  } catch {
    return base;
  }
}
