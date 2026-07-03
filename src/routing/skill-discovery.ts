import { DISCOVERY_POOL_SIZE } from './skill-dedup.js';
import type { Intent, ProjectProfile, DiscoveredSkill, RoutedSkill } from './types.js';
import {
  getOfficialRepos,
  isOfficialRepo,
  listRepoSkills,
} from '../lib/skill-upstream.js';

export type SkillsShResult = {
  id: string;
  skillId: string;
  name: string;
  installs?: number;
  source: string;
  fromGithub?: boolean;
};

type SkillsShResponse = {
  skills?: SkillsShResult[];
  count?: number;
};

const OFFICIAL_BOOST = 0.25;
const SEARCH_TIMEOUT_MS = 5000;

function getOfficialOwners(): string[] {
  return getOfficialRepos();
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
  return owners.some(
    (o) => normalized === o.toLowerCase() || normalized.startsWith(`${o.toLowerCase()}/`),
  );
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

function matchesSearchQuery(skill: SkillsShResult, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const haystack = `${skill.name} ${skill.skillId} ${skill.id} ${skill.source}`.toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return haystack.includes(q);
  return tokens.some((t) => haystack.includes(t));
}

export async function fetchOfficialRepoSkills(
  query: string,
  limit: number,
): Promise<SkillsShResult[]> {
  const repos = getOfficialRepos();
  const seen = new Set<string>();
  const matched: SkillsShResult[] = [];

  for (const repo of repos) {
    const repoSkills = await listRepoSkills(repo);
    for (const skill of repoSkills) {
      if (seen.has(skill.id)) continue;
      if (!matchesSearchQuery(skill, query)) continue;
      seen.add(skill.id);
      matched.push(skill);
    }
  }

  if (matched.length < limit) {
    for (const repo of repos) {
      const repoSkills = await listRepoSkills(repo);
      for (const skill of repoSkills) {
        if (seen.has(skill.id)) continue;
        seen.add(skill.id);
        matched.push(skill);
        if (matched.length >= limit) break;
      }
      if (matched.length >= limit) break;
    }
  }

  return matched.slice(0, limit);
}

function mapSkill(raw: SkillsShResult, score: number, reason: string, official: boolean): RoutedSkill {
  const installCommand = `npx skills add ${raw.source}@${raw.skillId}`;
  const sourceUrl = raw.fromGithub
    ? `https://github.com/${raw.source}/tree/HEAD/${raw.id.replace(`${raw.source}/`, '')}`
    : `https://skills.sh/${raw.id}`;
  const installNote = raw.fromGithub
    ? 'official GitHub skill registry'
    : `${raw.installs ?? 0} installs on skills.sh`;
  const skill: DiscoveredSkill = {
    id: raw.id,
    name: raw.name,
    description: `Agent skill from ${raw.source} (${installNote}).`,
    owner: raw.source.split('/')[0] ?? raw.source,
    repo: raw.source,
    skillId: raw.skillId,
    instructionsRepo: raw.source,
    sourceUrl,
    installCommand,
    official,
  };
  return { ...skill, score, reason, installs: raw.installs ?? 0 };
}

function isBannedMatch(text: string, bannedTokens: string[]): boolean {
  const lower = text.toLowerCase();
  return bannedTokens.some((t) => t.length > 2 && lower.includes(t));
}

function scoreSkill(
  raw: SkillsShResult,
  searchQuery: string,
  profile: ProjectProfile,
  officialOwners: string[],
  bannedTokens: string[] = [],
): { score: number; reason: string; official: boolean } | null {
  const official = isOfficialSource(raw.source, officialOwners) || isOfficialRepo(raw.source);
  const q = searchQuery.toLowerCase();
  const name = raw.name.toLowerCase();
  const source = raw.source.toLowerCase();

  if (isBannedMatch(name, bannedTokens) && !profile.stack.some((t) => name.includes(t.toLowerCase()))) {
    return null;
  }

  let score = raw.fromGithub ? 0.4 : 0.35;
  const reasons: string[] = [];

  if (name.split(/[-_\s]/).some((part) => part.length > 2 && q.includes(part))) {
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
  if (raw.fromGithub) {
    reasons.push('github registry');
  }
  const installBoost = Math.min(0.15, Math.log10((raw.installs ?? 1) + 1) * 0.03);
  score += installBoost;

  return {
    score: Math.min(0.99, score),
    reason: reasons.join(', ') || (raw.fromGithub ? 'github match' : 'skills.sh match'),
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
  bannedTokens?: string[];
}): Promise<DiscoverSkillsResult> {
  const officialOwners = getOfficialOwners();
  const maxResults = getMaxResults();
  const minResults = getMinResults();
  const bannedTokens = input.bannedTokens ?? [];
  const queries = buildSearchQueries(input);
  const seen = new Set<string>();
  const scored: RoutedSkill[] = [];
  let anySkillsShOk = false;

  for (const searchQuery of queries) {
    const rawSkills = await fetchSkillsSh(searchQuery, 20);
    if (rawSkills.length > 0) anySkillsShOk = true;

    for (const raw of rawSkills) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      const scoredSkill = scoreSkill(raw, searchQuery, input.profile, officialOwners, bannedTokens);
      if (!scoredSkill) continue;
      const { score, reason, official } = scoredSkill;
      scored.push(mapSkill(raw, score, reason, official));
    }
    if (scored.length >= minResults) break;
  }

  let anyGithubOk = false;
  if (scored.length < minResults || !anySkillsShOk) {
    for (const searchQuery of queries) {
      const githubSkills = await fetchOfficialRepoSkills(searchQuery, 40);
      if (githubSkills.length > 0) anyGithubOk = true;

      for (const raw of githubSkills) {
        if (seen.has(raw.id)) continue;
        seen.add(raw.id);
        const scoredSkill = scoreSkill(raw, searchQuery, input.profile, officialOwners, bannedTokens);
        if (!scoredSkill) continue;
        const { score, reason, official } = scoredSkill;
        scored.push(mapSkill(raw, score, reason, official));
      }
      if (scored.length >= minResults) break;
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const poolSize = Math.max(maxResults, DISCOVERY_POOL_SIZE);
  const skills = scored.slice(0, poolSize);
  const anyFetchOk = anySkillsShOk || anyGithubOk;

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
