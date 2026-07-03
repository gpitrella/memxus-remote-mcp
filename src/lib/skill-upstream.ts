type GitHubRepoResponse = { default_branch?: string };
type GitHubTreeItem = { path?: string; type?: string };
type GitHubTreeResponse = { tree?: GitHubTreeItem[] };

export type UpstreamLocation = {
  repo: string;
  relativePath: string;
};

export type UpstreamSkill = {
  id: string;
  skillId: string;
  name: string;
  source: string;
  installs: number;
  fromGithub: true;
};

const DEFAULT_OFFICIAL_REPOS = [
  'anthropics/skills',
  'vercel-labs/agent-skills',
  'vercel-labs/skills',
  'supabase/agent-skills',
];

const SEARCH_TIMEOUT_MS = 5000;
const githubTreeCache = new Map<string, { expiresAt: number; skills: UpstreamSkill[] }>();

export function getOfficialRepos(): string[] {
  const raw =
    process.env.OFFICIAL_SKILL_REPOS?.trim() || process.env.OFFICIAL_SKILL_OWNERS?.trim();
  if (!raw) return DEFAULT_OFFICIAL_REPOS;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function isOfficialRepo(repo?: string | null): boolean {
  if (!repo) return false;
  const normalized = repo.toLowerCase();
  return getOfficialRepos().some((candidate) => candidate.toLowerCase() === normalized);
}

function getGithubTimeoutMs(): number {
  const raw = Number(process.env.SKILL_GITHUB_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1000 ? Math.floor(raw) : SEARCH_TIMEOUT_MS;
}

function getGithubCacheTtlMs(): number {
  const raw = Number(process.env.SKILL_GITHUB_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 120_000;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'memxus-skill-upstream',
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function fetchGitHubJson<T>(url: string): Promise<T | null> {
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

function normalizeRelativePath(skillPath: string): string {
  let relativePath = skillPath.replace(/\/SKILL\.md$/i, '');
  if (relativePath.startsWith('skills/')) {
    relativePath = relativePath.slice('skills/'.length);
  }
  return relativePath;
}

function toUpstreamSkill(repo: string, path: string): UpstreamSkill {
  const relativePath = normalizeRelativePath(path);
  const skillId = relativePath.split('/').pop() ?? relativePath;
  return {
    id: `${repo}/${relativePath}`,
    skillId,
    name: skillId.replace(/-/g, ' '),
    source: repo,
    installs: 0,
    fromGithub: true,
  };
}

export async function listRepoSkills(repo: string): Promise<UpstreamSkill[]> {
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
    .map((item) => toUpstreamSkill(repo, item.path!));

  githubTreeCache.set(repo, { expiresAt: Date.now() + getGithubCacheTtlMs(), skills });
  return skills;
}

function normalizeSkillPathId(skillPathId: string): string {
  return skillPathId.replace(/\/SKILL\.md$/i, '').replace(/^skills\//, '').trim();
}

function toLocation(repo: string, absoluteId: string): UpstreamLocation {
  return {
    repo,
    relativePath: absoluteId.replace(`${repo}/`, ''),
  };
}

function skillMatchesPath(skill: UpstreamSkill, skillPathId: string): boolean {
  const normalized = normalizeSkillPathId(skillPathId);
  if (!normalized) return false;
  if (skill.skillId === normalized) return true;
  if (skill.id.endsWith(`/${normalized}`)) return true;
  if (skill.id.endsWith(`/${normalized.replace(/^skills\//, '')}`)) return true;
  return false;
}

export async function resolveUpstreamLocation(
  skillPathId: string,
  hintRepo?: string,
): Promise<UpstreamLocation | null> {
  const repos = hintRepo
    ? [hintRepo, ...getOfficialRepos().filter((repo) => repo !== hintRepo)]
    : getOfficialRepos();

  for (const repo of repos) {
    const skills = await listRepoSkills(repo);
    const match = skills.find((skill) => skillMatchesPath(skill, skillPathId));
    if (match) {
      return toLocation(repo, match.id);
    }
  }

  return null;
}

/** Clears in-memory GitHub skill tree cache (for tests). */
export function resetGithubSkillCacheForTests(): void {
  githubTreeCache.clear();
}
