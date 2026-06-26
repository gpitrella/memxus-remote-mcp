import type { Intent, ProjectProfile, DiscoveredSkill, RoutedSkill } from './types.js';

export type SkillsShResult = {
  id: string;
  skillId: string;
  name: string;
  installs?: number;
  source: string;
};

type SkillsShResponse = {
  skills?: SkillsShResult[];
  count?: number;
};

const DEFAULT_OFFICIAL_OWNERS = [
  'anthropics/skills',
  'vercel-labs/agent-skills',
  'vercel-labs/skills',
  'cursor-skills',
];

const OFFICIAL_BOOST = 0.25;
const SEARCH_TIMEOUT_MS = 5000;

function getOfficialOwners(): string[] {
  const raw = process.env.OFFICIAL_SKILL_OWNERS?.trim();
  if (!raw) return DEFAULT_OFFICIAL_OWNERS;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function getSkillsShApiUrl(): string {
  return process.env.SKILLS_SH_API_URL?.trim() || 'https://skills.sh/api/search';
}

function getMinResults(): number {
  const raw = Number(process.env.SKILL_DISCOVERY_MIN_RESULTS);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 2;
}

function getMaxResults(): number {
  const raw = Number(process.env.SKILL_DISCOVERY_MAX_RESULTS);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 2;
}

function isOfficialSource(source: string, owners: string[]): boolean {
  const normalized = source.toLowerCase();
  return owners.some((o) => normalized === o.toLowerCase() || normalized.startsWith(`${o.toLowerCase()}/`));
}

function buildSearchQueries(input: {
  profile: ProjectProfile;
  intent: Intent;
  query: string;
  memorySnippets?: string[];
}): string[] {
  const stack = input.profile.stack.slice(0, 3).join(' ');
  const queries = [
    [input.query, input.intent.action, stack, input.profile.domain].filter(Boolean).join(' ').trim(),
    [input.profile.domain, stack, input.intent.action].filter(Boolean).join(' ').trim(),
    stack || input.profile.domain,
    'software engineering best practices',
  ];
  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
}

function mapSkill(raw: SkillsShResult, score: number, reason: string, official: boolean): RoutedSkill {
  const installCommand = `npx skills add ${raw.source}@${raw.skillId}`;
  const sourceUrl = `https://skills.sh/${raw.id}`;
  const skill: DiscoveredSkill = {
    id: raw.id,
    name: raw.name,
    description: `Agent skill from ${raw.source} (${raw.installs ?? 0} installs on skills.sh).`,
    owner: raw.source.split('/')[0] ?? raw.source,
    repo: raw.source,
    skillId: raw.skillId,
    sourceUrl,
    installCommand,
    official,
  };
  return { ...skill, score, reason };
}

function scoreSkill(
  raw: SkillsShResult,
  searchQuery: string,
  profile: ProjectProfile,
  officialOwners: string[],
): { score: number; reason: string; official: boolean } {
  const official = isOfficialSource(raw.source, officialOwners);
  const q = searchQuery.toLowerCase();
  const name = raw.name.toLowerCase();
  const source = raw.source.toLowerCase();
  let score = 0.35;
  const reasons: string[] = [];

  if (name.split(/[-_]/).some((part) => part.length > 2 && q.includes(part))) {
    score += 0.2;
    reasons.push('name match');
  }
  for (const token of profile.stack) {
    if (token.length > 2 && (name.includes(token.toLowerCase()) || source.includes(token.toLowerCase()))) {
      score += 0.1;
      reasons.push(`stack:${token}`);
    }
  }
  if (official) {
    score += OFFICIAL_BOOST;
    reasons.push('official source');
  }
  const installBoost = Math.min(0.15, Math.log10((raw.installs ?? 1) + 1) * 0.03);
  score += installBoost;

  return {
    score: Math.min(0.99, score),
    reason: reasons.join(', ') || 'skills.sh match',
    official,
  };
}

async function fetchSkillsSh(query: string, limit: number): Promise<SkillsShResult[]> {
  const url = new URL(getSkillsShApiUrl());
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'memxus-skill-discovery' },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as SkillsShResponse;
    return json.skills ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export type DiscoverSkillsResult = {
  skills: RoutedSkill[];
  discoveryDegraded: boolean;
};

export async function discoverSkills(input: {
  profile: ProjectProfile;
  intent: Intent;
  query: string;
  memorySnippets?: string[];
}): Promise<DiscoverSkillsResult> {
  const officialOwners = getOfficialOwners();
  const maxResults = getMaxResults();
  const minResults = getMinResults();
  const queries = buildSearchQueries(input);
  const seen = new Set<string>();
  const scored: RoutedSkill[] = [];
  let anyFetchOk = false;

  for (const searchQuery of queries) {
    const rawSkills = await fetchSkillsSh(searchQuery, 20);
    if (rawSkills.length > 0) anyFetchOk = true;

    for (const raw of rawSkills) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      const { score, reason, official } = scoreSkill(raw, searchQuery, input.profile, officialOwners);
      scored.push(mapSkill(raw, score, reason, official));
    }
    if (scored.length >= minResults) break;
  }

  scored.sort((a, b) => b.score - a.score);
  const skills = scored.slice(0, maxResults);

  return {
    skills,
    discoveryDegraded: !anyFetchOk || skills.length < minResults,
  };
}

export function formatSkillsBlock(skills: RoutedSkill[], header?: string): string {
  if (skills.length === 0) {
    return [
      '=== Suggested Official Skills (approval required) ===',
      'No skills could be discovered right now — use general engineering practices.',
      '=== End Skills Suggestion ===',
    ].join('\n');
  }

  const skillLines = skills
    .map(
      (s, i) =>
        `[${i + 1}] ${s.name}${s.official ? ' (official)' : ''} — ${s.reason}\n` +
        `    ${s.description}\n` +
        `    Install: ${s.installCommand}\n` +
        `    More: ${s.sourceUrl}`,
    )
    .join('\n');

  return [
    header ?? '=== Suggested Official Skills (approval required) ===',
    'These skills are SUGGESTED based on your project context. Confirm before the agent applies them.',
    '',
    skillLines,
    '',
    'Reply to approve which skill(s) to use, or continue without skills.',
    '=== End Skills Suggestion ===',
  ].join('\n');
}
