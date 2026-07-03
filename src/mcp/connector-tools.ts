import { createSign } from 'crypto';
import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';
import {
  getUserMcpPreferences,
  isSkillRoutingActiveForUser,
} from '../lib/mcp-preferences.js';
import { surfaceSkills } from '../routing/skill-surfacing.js';
import type { RoutedSkill } from '../routing/types.js';

export function mapActiveSkillsForResponse(skills: RoutedSkill[]) {
  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    instructionsRepo: s.instructionsRepo,
    installCommand: s.installCommand,
    sourceUrl: s.sourceUrl,
    official: s.official,
    score: s.score,
    reason: s.reason,
  }));
}

async function maybeSurfaceSkills(p: {
  userId: string;
  trigger: 'post_sync' | 'onboarding' | 'assign_project';
  topic: string;
  collection?: string | null;
  memorySnippets?: string[];
}): Promise<{ skills: RoutedSkill[]; skillsMessage: string; discoveryDegraded: boolean } | null> {
  const prefs = await getUserMcpPreferences(p.userId);
  if (!isSkillRoutingActiveForUser(prefs)) return null;
  const surfaced = await surfaceSkills({
    trigger: p.trigger,
    topic: p.topic,
    collection: p.collection,
    memorySnippets: p.memorySnippets,
    userId: p.userId,
  });
  return {
    skills: surfaced.skills,
    skillsMessage: surfaced.skillsMessage,
    discoveryDegraded: surfaced.discoveryDegraded,
  };
}

export type ConnectorProvider = 'github' | 'notion';

function buildSyncSkillTopic(
  provider: ConnectorProvider,
  projectSlug?: string,
  itemIds?: string[],
): string {
  if (projectSlug?.trim()) {
    const slug = projectSlug.trim().toLowerCase().replace(/^project:/, '');
    return `project:${slug}`;
  }
  if (itemIds?.length) {
    return itemIds.join(' ');
  }
  return provider === 'github' ? 'github repository typescript node' : 'notion documentation';
}

type ConnectorInstallRow = {
  id: string;
  platform: string;
  external_id: string;
  user_id: string;
  status: string;
  collection_slug: string | null;
  metadata: Record<string, unknown>;
  last_synced_at: string | null;
};

function isEnvFlagEnabled(flag: string): boolean {
  return process.env[flag]?.trim().toLowerCase() === 'true';
}

/** Aligns with Dash-AIMemory/lib/connector-installs.ts resolveExternalId */
function resolveExternalId(userId: string, platform: ConnectorProvider): string {
  if (platform === 'notion' && !isEnvFlagEnabled('FEATURE_CONNECTOR_NOTION_V2')) {
    return userId;
  }
  return `user:${userId}`;
}

function externalIdCandidates(userId: string, platform: ConnectorProvider): string[] {
  const primary = resolveExternalId(userId, platform);
  const ids = [primary];
  if (platform === 'notion') {
    if (primary !== userId) ids.push(userId);
    if (primary !== `user:${userId}`) ids.push(`user:${userId}`);
  }
  return [...new Set(ids)];
}

async function getUserInstall(
  userId: string,
  provider: ConnectorProvider
): Promise<ConnectorInstallRow | null> {
  for (const externalId of externalIdCandidates(userId, provider)) {
    const { data } = await supabase
      .from('connector_installs')
      .select('*')
      .eq('platform', provider)
      .eq('external_id', externalId)
      .eq('status', 'active')
      .maybeSingle();
    if (data) return data as ConnectorInstallRow;
  }
  return null;
}

function createGitHubAppJwt(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId })
  ).toString('base64url');
  const signInput = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signInput);
  sign.end();
  const signature = sign.sign(privateKeyPem.replace(/\\n/g, '\n'));
  return `${signInput}.${signature.toString('base64url')}`;
}

async function getGitHubInstallationToken(
  appId: string,
  privateKeyPem: string,
  installationId: number
): Promise<string> {
  const jwt = createGitHubAppJwt(appId, privateKeyPem);
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );
  if (!res.ok) throw new Error(`GitHub installation token failed: ${res.status}`);
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error('GitHub installation token missing');
  return json.token;
}

async function listGitHubRepos(installationToken: string): Promise<
  Array<{ id: string; label: string; meta: Record<string, unknown> }>
> {
  const repos: Array<{ id: string; label: string; meta: Record<string, unknown> }> = [];
  let page = 1;
  for (;;) {
    const res = await fetch(
      `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${installationToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );
    if (!res.ok) throw new Error(`GitHub list repos failed: ${res.status}`);
    const json = (await res.json()) as {
      repositories?: Array<{
        id: number;
        full_name: string;
        private: boolean;
        language: string | null;
        updated_at: string;
      }>;
    };
    const batch = json.repositories ?? [];
    for (const r of batch) {
      repos.push({
        id: r.full_name,
        label: r.full_name,
        meta: { private: r.private, lang: r.language, updated: r.updated_at, repoId: r.id },
      });
    }
    if (batch.length < 100) break;
    page += 1;
  }
  return repos;
}

type NotionSearchResult = {
  id: string;
  label: string;
  meta: Record<string, unknown>;
};

async function listNotionPages(accessToken: string): Promise<NotionSearchResult[]> {
  const res = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: { value: 'page', property: 'object' },
      page_size: 50,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion search failed: ${res.status} ${err.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    results?: Array<{
      id: string;
      object: string;
      icon?: { type: string; emoji?: string };
      properties?: Record<string, { title?: Array<{ plain_text?: string }> }>;
    }>;
  };
  return (json.results ?? []).map((page) => {
    const titleProp = Object.values(page.properties ?? {}).find((p) => p.title);
    const title = titleProp?.title?.map((t) => t.plain_text ?? '').join('') || 'Untitled';
    return {
      id: page.id,
      label: title,
      meta: {
        type: page.object,
        icon: page.icon?.emoji ?? null,
      },
    };
  });
}

export async function connectSource(p: {
  userId: string;
  provider: ConnectorProvider;
  projectSlug?: string;
}): Promise<{ authUrl: string; pollToken: string; message: string }> {
  const url = new URL('/integrations', config.DASHBOARD_URL);
  url.searchParams.set('connect', p.provider);
  if (p.projectSlug?.trim()) {
    url.searchParams.set('project_slug', p.projectSlug.trim());
  }
  const pollToken = `connect:${p.provider}:${p.userId}`;
  const message =
    p.provider === 'github'
      ? 'Open the link to install the Memxus GitHub App and authorize repository access.'
      : 'Open the link to connect Notion via OAuth and grant page access.';
  return { authUrl: url.toString(), pollToken, message };
}

export async function listSyncableItems(p: {
  userId: string;
  provider: ConnectorProvider;
}): Promise<{ items: Array<{ id: string; label: string; meta: Record<string, unknown> }> }> {
  const install = await getUserInstall(p.userId, p.provider);
  if (!install) {
    throw new Error(`${p.provider} is not connected. Use connect_source first.`);
  }

  if (p.provider === 'github') {
    const appId = process.env.GITHUB_APP_ID?.trim();
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
    if (!appId || !privateKey) throw new Error('GitHub connector not configured on server');

    const installationId = install.metadata?.github_installation_id;
    if (typeof installationId !== 'number' && typeof installationId !== 'string') {
      throw new Error('GitHub installation missing — reconnect via connect_source');
    }

    const token = await getGitHubInstallationToken(appId, privateKey, Number(installationId));
    const items = await listGitHubRepos(token);
    const allowed = Array.isArray(install.metadata?.allowed_repos)
      ? (install.metadata.allowed_repos as { fullName: string }[]).map((r) => r.fullName)
      : [];
    return {
      items: items.map((item) => ({
        ...item,
        meta: { ...item.meta, selected: allowed.includes(item.id) },
      })),
    };
  }

  const accessToken = install.metadata?.notion_access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('Notion token missing — reconnect via connect_source');
  }
  const items = await listNotionPages(accessToken);
  const allowed = Array.isArray(install.metadata?.allowed_pages)
    ? (install.metadata.allowed_pages as { id: string }[]).map((pg) => pg.id)
    : [];
  return {
    items: items.map((item) => ({
      ...item,
      meta: { ...item.meta, selected: allowed.includes(item.id) },
    })),
  };
}

type SyncPageResult = { pageId: string; ok: boolean; detail?: string };

async function syncNotionPage(p: {
  gatewayUrl: string;
  secret: string;
  userId: string;
  pageId: string;
  projectSlug?: string;
}): Promise<SyncPageResult> {
  const body: Record<string, unknown> = {
    userId: p.userId,
    pageId: p.pageId,
  };
  if (p.projectSlug?.trim()) body.projectSlug = p.projectSlug.trim();

  const res = await fetch(`${p.gatewayUrl}/notion/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-connectors-secret': p.secret,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return {
      pageId: p.pageId,
      ok: false,
      detail: data.error ?? `sync failed (${res.status})`,
    };
  }
  return { pageId: p.pageId, ok: true };
}

async function triggerSync(p: {
  userId: string;
  provider: ConnectorProvider;
  projectSlug?: string;
}): Promise<{ ok: boolean; detail?: string; pagesSynced?: number; pageErrors?: SyncPageResult[] }> {
  const gatewayUrl = process.env.CONNECTORS_GATEWAY_URL?.trim()?.replace(/\/$/, '');
  const secret = process.env.CONNECTORS_INTERNAL_SECRET?.trim();
  if (!gatewayUrl || !secret) {
    return { ok: false, detail: 'Connectors gateway not configured' };
  }

  const install = await getUserInstall(p.userId, p.provider);

  if (p.provider === 'notion') {
    const pages = Array.isArray(install?.metadata?.allowed_pages)
      ? (install.metadata.allowed_pages as { id: string }[])
      : [];
    if (!pages.length) {
      return { ok: false, detail: 'No Notion pages selected' };
    }

    const pageErrors: SyncPageResult[] = [];
    let synced = 0;
    for (const page of pages) {
      if (!page.id) continue;
      const result = await syncNotionPage({
        gatewayUrl,
        secret,
        userId: p.userId,
        pageId: page.id,
        projectSlug: p.projectSlug,
      });
      if (result.ok) {
        synced += 1;
      } else {
        pageErrors.push(result);
      }
    }

    return {
      ok: synced > 0,
      pagesSynced: synced,
      pageErrors: pageErrors.length ? pageErrors : undefined,
      detail:
        pageErrors.length && synced === 0
          ? pageErrors.map((e) => `${e.pageId}: ${e.detail}`).join('; ')
          : pageErrors.length
            ? `Synced ${synced}/${pages.length}; ${pageErrors.length} failed`
            : undefined,
    };
  }

  const externalId = resolveExternalId(p.userId, 'github');
  const body: Record<string, unknown> = { externalId };
  if (p.projectSlug?.trim()) body.projectSlug = p.projectSlug.trim();

  const res = await fetch(`${gatewayUrl}/github/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-connectors-secret': secret,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, detail: data.error ?? `sync failed (${res.status})` };
  }
  return { ok: true };
}

export async function setSyncSelection(p: {
  userId: string;
  provider: ConnectorProvider;
  itemIds: string[];
  projectSlug?: string;
}): Promise<{
  ok: boolean;
  selected: number;
  sync?: { ok: boolean; detail?: string };
  suggested_skills?: ReturnType<typeof mapActiveSkillsForResponse>;
  skills_message?: string;
  discovery_degraded?: boolean;
}> {
  if (!p.itemIds.length) throw new Error('itemIds must not be empty');

  const install = await getUserInstall(p.userId, p.provider);
  if (!install) {
    throw new Error(`${p.provider} is not connected. Use connect_source first.`);
  }

  const meta = { ...(install.metadata ?? {}) };
  if (p.projectSlug?.trim()) {
    meta.project_slug = p.projectSlug.trim().toLowerCase().replace(/^project:/, '');
  }

  if (p.provider === 'github') {
    const items = await listSyncableItems({ userId: p.userId, provider: 'github' });
    const byId = new Map(items.items.map((i) => [i.id, i]));
    const allowedRepos = p.itemIds
      .map((id) => {
        const item = byId.get(id);
        const repoId = item?.meta?.repoId;
        return repoId != null ? { repoId: Number(repoId), fullName: id } : null;
      })
      .filter((r): r is { repoId: number; fullName: string } => r != null);
    if (!allowedRepos.length) throw new Error('No valid GitHub repositories in itemIds');
    meta.allowed_repos = allowedRepos;
  } else {
    meta.allowed_pages = p.itemIds.map((id) => ({ id }));
  }

  const { error } = await supabase
    .from('connector_installs')
    .update({
      metadata: meta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', install.id);

  if (error) throw new Error(`Failed to save selection: ${error.message}`);

  const sync = await triggerSync({
    userId: p.userId,
    provider: p.provider,
    projectSlug: p.projectSlug,
  });

  let skillPayload: {
    suggested_skills?: ReturnType<typeof mapActiveSkillsForResponse>;
    skills_message?: string;
    discovery_degraded?: boolean;
  } = {};

  if (sync.ok) {
    const collection = p.projectSlug?.trim()
      ? `project:${p.projectSlug.trim().toLowerCase().replace(/^project:/, '')}`
      : null;
    const surfaced = await maybeSurfaceSkills({
      userId: p.userId,
      trigger: 'post_sync',
      topic: buildSyncSkillTopic(p.provider, p.projectSlug, p.itemIds),
      collection,
    });
    if (surfaced) {
      skillPayload = {
        suggested_skills: mapActiveSkillsForResponse(surfaced.skills),
        skills_message: surfaced.skillsMessage,
        discovery_degraded: surfaced.discoveryDegraded,
      };
    }
  }

  return { ok: true, selected: p.itemIds.length, sync, ...skillPayload };
}

export async function isSourceConnected(
  userId: string,
  provider: ConnectorProvider
): Promise<boolean> {
  const install = await getUserInstall(userId, provider);
  return install != null;
}

export function parseConnectPollToken(
  pollToken: string,
  userId: string
): { provider: ConnectorProvider } | null {
  const match = /^connect:(github|notion):([0-9a-f-]{36})$/i.exec(pollToken.trim());
  if (!match || match[2].toLowerCase() !== userId.toLowerCase()) return null;
  return { provider: match[1].toLowerCase() as ConnectorProvider };
}

export async function checkConnectStatus(p: {
  userId: string;
  pollToken: string;
}): Promise<{
  connected: boolean;
  provider: ConnectorProvider;
  message: string;
  suggested_skills?: ReturnType<typeof mapActiveSkillsForResponse>;
  skills_message?: string;
  discovery_degraded?: boolean;
}> {
  const parsed = parseConnectPollToken(p.pollToken, p.userId);
  if (!parsed) {
    throw new Error('Invalid poll_token for this user');
  }
  const connected = await isSourceConnected(p.userId, parsed.provider);
  let message = connected
    ? `${parsed.provider} is connected and ready.`
    : `Waiting for ${parsed.provider} authorization — open the connect link in your browser.`;

  let skillPayload: {
    suggested_skills?: ReturnType<typeof mapActiveSkillsForResponse>;
    skills_message?: string;
    discovery_degraded?: boolean;
  } = {};

  if (connected) {
    const install = await getUserInstall(p.userId, parsed.provider);
    const onboardingShown = install?.metadata?.skills_onboarding_shown_at;
    if (!onboardingShown && install) {
      const surfaced = await maybeSurfaceSkills({
        userId: p.userId,
        trigger: 'onboarding',
        topic: buildSyncSkillTopic(parsed.provider),
        collection: typeof install.metadata?.project_slug === 'string'
          ? `project:${String(install.metadata.project_slug).replace(/^project:/, '')}`
          : null,
      });
      if (surfaced) {
        skillPayload = {
          suggested_skills: mapActiveSkillsForResponse(surfaced.skills),
          skills_message: surfaced.skillsMessage,
          discovery_degraded: surfaced.discoveryDegraded,
        };
        message = `${message}\n\n${surfaced.skillsMessage}`;
        const meta = { ...(install.metadata ?? {}), skills_onboarding_shown_at: new Date().toISOString() };
        await supabase
          .from('connector_installs')
          .update({ metadata: meta, updated_at: new Date().toISOString() })
          .eq('id', install.id);
      }
    }
  }

  return { connected, provider: parsed.provider, message, ...skillPayload };
}
