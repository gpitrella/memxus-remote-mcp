/**
 * Session token savings — compares WITH Memxus vs estimated baseline WITHOUT.
 */

export const ENABLE_IMPACT_SUMMARY = 'ENABLE_IMPACT_SUMMARY';

/** Avg. cold-session cost without memory: re-explain topic, grep/read repo, orient agent. */
export const EXPLORATION_OVERHEAD_TOKENS = 3_500;

/** Manual skill discovery without routing (search, extra turns). */
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

export type ImpactSessionOptions = {
  memoryBankTokens?: number;
  skillsIncluded?: boolean;
};

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

export function estimateBaselineWithoutMemxus(
  tokensWithMemxus: number,
  options: ImpactSessionOptions = {}
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

/** @deprecated Use estimateBaselineWithoutMemxus; kept for legacy callers. */
export function estimateTokensSaved(contextTokens: number, _memxusOverhead = 120): number {
  return estimateBaselineWithoutMemxus(contextTokens).tokensSaved;
}

export function computeImpact(tokensSaved: number): ImpactMetrics {
  return { tokensSaved: Math.max(0, Math.round(tokensSaved)) };
}

function formatTokenNum(n: number): string {
  if (n >= 1000) return `~${n.toLocaleString('en-US')}`;
  return `~${n}`;
}

export function buildImpactSummaryRows(impact: ImpactMetrics): ImpactSummaryRow[] {
  return [{ icon: '⚡', label: 'Tokens', value: formatTokenNum(impact.tokensSaved), unit: '' }];
}

export function formatImpactComparisonTable(comparison: ImpactSessionComparison): string {
  const { tokensWithMemxus, tokensWithoutMemxus, tokensSaved, breakdown } = comparison;
  const skillsNote = breakdown.skillsDiscovery > 0 ? ` + ~${breakdown.skillsDiscovery} skills` : '';
  const contextNote =
    breakdown.memoryBankTokens >= EXPLORATION_OVERHEAD_TOKENS
      ? `banco ~${breakdown.memoryBankTokens.toLocaleString('en-US')} tok`
      : `exploración ~${EXPLORATION_OVERHEAD_TOKENS.toLocaleString('en-US')} tok`;

  const lines = [
    '## Esta sesión: Memxus vs sin Memxus',
    '',
    '| | Sin Memxus (est.) | Con Memxus | Ahorro |',
    '|---|-------------------|------------|--------|',
    `| ⚡ Tokens | ${formatTokenNum(tokensWithoutMemxus)} | ${formatTokenNum(tokensWithMemxus)} | ${formatTokenNum(tokensSaved)} |`,
    '',
    `_Sin Memxus: repetir contexto (${contextNote}${skillsNote}). Con Memxus: contexto recuperado + skills sugeridas inline._`,
  ];
  return lines.join('\n');
}

/** @deprecated Prefer formatImpactComparisonTable for session summaries. */
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
    comparison: ImpactSessionComparison;
  };
  impact_summary_text: string;
};

export function buildImpactPayload(
  tokensWithMemxus: number,
  options: ImpactSessionOptions = {}
): ImpactPayload | null {
  if (!isImpactSummaryEnabled()) return null;
  const comparison = estimateBaselineWithoutMemxus(tokensWithMemxus, options);
  const metrics = computeImpact(comparison.tokensSaved);
  return {
    impact_summary: {
      rows: buildImpactSummaryRows(metrics),
      metrics,
      comparison,
    },
    impact_summary_text: formatImpactComparisonTable(comparison),
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
  options: ImpactSessionOptions = {}
): ImpactContextResponse {
  const base: ImpactContextResponse = { contextBlock, tokens_used: tokensUsed, truncated };
  try {
    const impact = buildImpactPayload(tokensUsed, options);
    if (!impact) return base;
    const text = `${contextBlock}\n\n${impact.impact_summary_text}`;
    return {
      contextBlock: text,
      tokens_used: tokensUsed,
      truncated,
      impact_summary: impact.impact_summary,
      impact_summary_text: impact.impact_summary_text,
    };
  } catch {
    return base;
  }
}
