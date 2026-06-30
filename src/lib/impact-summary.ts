/**
 * Session impact estimates — conservative; UI always prefixes ~ .
 */

export const ENABLE_IMPACT_SUMMARY = 'ENABLE_IMPACT_SUMMARY';

const KWH_PER_1K_TOKENS = 0.0025;
const L_WATER_PER_KWH = 1.8;
const CO2_KG_PER_KWH = 0.4;

export type ImpactMetrics = {
  tokensSaved: number;
  kwh: number;
  waterLiters: number;
  co2Kg: number;
};

export type ImpactSummaryRow = {
  icon: string;
  label: string;
  value: string;
  unit: string;
};

export function isImpactSummaryEnabled(): boolean {
  return process.env[ENABLE_IMPACT_SUMMARY]?.trim().toLowerCase() === 'true';
}

export function computeImpact(tokensSaved: number): ImpactMetrics {
  const safe = Math.max(0, Math.round(tokensSaved));
  const kwh = (safe / 1000) * KWH_PER_1K_TOKENS;
  return {
    tokensSaved: safe,
    kwh: round(kwh, 2),
    waterLiters: round(kwh * L_WATER_PER_KWH, 2),
    co2Kg: round(kwh * CO2_KG_PER_KWH, 2),
  };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function formatNum(n: number): string {
  if (n >= 1000) return `~${n.toLocaleString('en-US')}`;
  return `~${n}`;
}

export function buildImpactSummaryRows(impact: ImpactMetrics): ImpactSummaryRow[] {
  return [
    { icon: '⚡', label: 'Tokens reutilizados', value: formatNum(impact.tokensSaved), unit: '' },
    { icon: '💧', label: 'Agua no evaporada', value: formatNum(impact.waterLiters), unit: 'L' },
    { icon: '🌱', label: 'CO₂ no emitido', value: formatNum(impact.co2Kg), unit: 'kg' },
    { icon: '🔋', label: 'Electricidad', value: formatNum(impact.kwh), unit: 'kWh' },
  ];
}

export function formatImpactSummaryTable(impact: ImpactMetrics): string {
  const rows = buildImpactSummaryRows(impact);
  const lines = [
    '## Esta sesión, Memxus te ahorró',
    '',
    '| | Estimado |',
    '|---|----------|',
    ...rows.map((r) => {
      const val = r.unit ? `${r.value} ${r.unit}`.trim() : r.value;
      return `| ${r.icon} ${r.label} | ${val} |`;
    }),
    '',
    '_Estimación aproximada. [Ver metodología](https://memxus.com/docs#impact)_',
  ];
  return lines.join('\n');
}

export function estimateTokensSaved(contextTokens: number, memxusOverhead = 120): number {
  return Math.max(0, contextTokens - memxusOverhead);
}

export function buildImpactPayload(tokensUsed: number): {
  impact_summary: { rows: ImpactSummaryRow[]; metrics: ImpactMetrics };
  impact_summary_text: string;
} | null {
  if (!isImpactSummaryEnabled()) return null;
  const metrics = computeImpact(estimateTokensSaved(tokensUsed));
  return {
    impact_summary: { rows: buildImpactSummaryRows(metrics), metrics },
    impact_summary_text: formatImpactSummaryTable(metrics),
  };
}
