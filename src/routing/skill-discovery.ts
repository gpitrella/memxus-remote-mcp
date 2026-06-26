import type { Intent, ProjectProfile, DiscoveredSkill, RoutedSkill } from './types.js';

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

type GitHubRepoResponse = { default_branch?: string };
type GitHubTreeItem = { path?: string; type?: string };
type GitHubTreeResponse = { tree?: GitHubTreeItem[] };

const DEFAULT_OFFICIAL_REPOS = [
  'anthropics/skills',
  'vercel-labs/agent-skills',
  'vercel-labs/skills',
];

const OFFICIAL_BOOST = 0.25;
const SEARCH_TIMEOUT_MS = 5000;

const githubTreeCache = new Map<string, { expiresAt: number; skills: SkillsShResult[] }>();

function getOfficialRepos(): string[] {
  const raw =
    process.env.OFFICIAL_SKILL_REPOS?.trim() || process.env.OFFICIAL_SKILL_OWNERS?.trim();
  if (!raw) return DEFAULT_OFFICIAL_REPOS;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

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

function getGithubTimeoutMs(): number {
  const raw = Number(process.env.SKILL_GITHUB_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1000 ? Math.floor(raw) : SEARCH_TIMEOUT_MS;
}

function getGithubCacheTtlMs(): number {
  const raw = Number(process.env.SKILL_GITHUB_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 3_600_000;
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

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'memxus-skill-discovery',
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchGitHubJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getGithubTimeoutMs());
  try {
    const res = await fetch(url, { signal: controller.signal, headers: githubHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function skillFromTreePath(repo: string, skillPath: string): SkillsShResult {
  let relativePath = skillPath.replace(/\/SKILL\.md$/i, '');
  if (relativePath.startsWith('skills/')) {
    relativePath = relativePath.slice('skills/'.length);
  }
  const skillId = relativePath.split('/').pop() ?? relativePath;
  const displayName = skillId.replace(/-/g, ' ');
  return {
    id: `${repo}/${relativePath}`,
    skillId,
    name: displayName,
    source: repo,
    installs: 0,
    fromGithub: true,
  };
}

function matchesSearchQuery(skill: SkillsShResult, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const haystack = `${skill.name} ${skill.skillId} ${skill.id} ${skill.source}`.toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return haystack.includes(q);
  return tokens.some((t) => haystack.includes(t));
}

async function listRepoSkills(repo: string): Promise<SkillsShResult[]> {
  const cached = githubTreeCache.get(repo);
  if (cached && cached.expiresAt > Date.now()) return cached.skills;

  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) return [];

  const meta = await fetchGitHubJson<GitHubRepoResponse>(
    `https://api.github.com/repos/${owner}/${repoName}`,
  );
  const branch = meta?.default_branch ?? 'main';
  const tree = await fetchGitHubJson<GitHubTreeResponse>(
    `https://api.github.com/repos/${owner}/${repoName}/git/trees/${branch}?recursive=1`,
  );
  if (!tree?.tree) return [];

  const skills = tree.tree
    .filter((item) => item.type === 'blob' && item.path?.endsWith('/SKILL.md'))
    .map((item) => skillFromTreePath(repo, item.path!));

  githubTreeCache.set(repo, { expiresAt: Date.now() + getGithubCacheTtlMs(), skills });
  return skills;
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

/** Clears in-memory GitHub skill tree cache (for tests). */
export function resetGithubSkillCacheForTests(): void {
  githubTreeCache.clear();
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
}): Promise<DiscoverSkillsResult> {
  const officialOwners = getOfficialOwners();
  const maxResults = getMaxResults();
  const minResults = getMinResults();
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
      const { score, reason, official } = scoreSkill(raw, searchQuery, input.profile, officialOwners);
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
        const { score, reason, official } = scoreSkill(raw, searchQuery, input.profile, officialOwners);
        scored.push(mapSkill(raw, score, reason, official));
      }
      if (scored.length >= minResults) break;
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const skills = scored.slice(0, maxResults);
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
