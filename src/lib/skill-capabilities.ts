export const MCP_APPS_EXT = 'io.modelcontextprotocol/ui';
const LEGACY_APPS_KEYS = ['mcp_apps'] as const;
const MCP_APP_MIME = 'text/html;profile=mcp-app';

export type Surface =
  | 'code-editor'
  | 'desktop-app'
  | 'web'
  | 'mobile'
  | 'tablet'
  | 'terminal'
  | 'unknown';

export interface McpHandshakeContext {
  clientInfo?: { name?: string; version?: string };
  clientCapabilities?: Record<string, unknown>;
  negotiatedExtensions?: string[];
  extensionsDetail?: Record<string, { mimeTypes?: string[] }>;
  appsFeatures?: { directActions?: boolean };
  meta?: {
    locale?: string;
    device?: {
      type?: string;
      viewport?: { w?: number; h?: number };
    };
  };
}

export interface EffectiveCapabilities {
  surface: Surface;
  renderApps: boolean;
  canInstall: boolean;
  canUseInChat: boolean;
  hostSkipAction: boolean;
  compactLayout: boolean;
}

type CapabilityOverride = Partial<EffectiveCapabilities>;

const KNOWN_DESKTOP_APPS = new Set([
  'claude-desktop',
  'cursor',
  'vscode',
  'vscode-insiders',
  'jetbrains',
]);

const CLIENT_OVERRIDES: Record<string, CapabilityOverride> = {};

function parseCsv(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function normalizeClientName(name?: string | null): string {
  return (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '');
}

export function isKnownDesktopApp(name?: string | null): boolean {
  return KNOWN_DESKTOP_APPS.has(normalizeClientName(name));
}

function hasRoots(clientCapabilities?: Record<string, unknown>): boolean {
  if (!clientCapabilities) return false;
  return Object.prototype.hasOwnProperty.call(clientCapabilities, 'roots');
}

function hasAppsCapability(hs?: McpHandshakeContext): boolean {
  if (!hs) return false;

  if (hs.negotiatedExtensions?.includes(MCP_APPS_EXT)) {
    const detail = hs.extensionsDetail?.[MCP_APPS_EXT];
    if (!detail || detail.mimeTypes?.includes(MCP_APP_MIME)) return true;
  }

  if (LEGACY_APPS_KEYS.some((k) => hs.negotiatedExtensions?.includes(k))) return true;

  const experimental = hs.clientCapabilities?.experimental;
  if (experimental && typeof experimental === 'object') {
    const exp = experimental as Record<string, unknown>;
    if (exp.mcp_apps === true || exp.mcpApps === true) return true;
    const apps = exp.apps;
    if (apps && typeof apps === 'object') {
      const appsObj = apps as Record<string, unknown>;
      if (appsObj.enabled === true || appsObj.supported === true) return true;
    }
  }

  return false;
}

export function inferSurface(
  hs: McpHandshakeContext | undefined,
  hasApps: boolean,
  rootsAvailable: boolean,
): Surface {
  const device = hs?.meta?.device;

  if (device?.type === 'mobile') return 'mobile';
  if (device?.type === 'tablet') return 'tablet';

  const width = device?.viewport?.w;
  if (typeof width === 'number') {
    if (width < 600) return 'mobile';
    if (width < 900) return 'tablet';
  }

  if (!hasApps && !rootsAvailable) {
    return 'terminal';
  }

  if (rootsAvailable) {
    return isKnownDesktopApp(hs?.clientInfo?.name) ? 'desktop-app' : 'code-editor';
  }

  if (hasApps) {
    return 'web';
  }

  return 'unknown';
}

export function isDisabledClient(input: {
  handshake?: McpHandshakeContext;
  userId?: string;
  sessionId?: string;
}): boolean {
  const normalized = normalizeClientName(input.handshake?.clientInfo?.name);

  if (process.env.FORCE_PLAIN_TEXT === 'true') return true;

  const disabled = parseCsv(process.env.DISABLE_SKILL_CARD_FOR_CLIENTS);
  if (disabled.includes(normalized)) return true;

  const pct = Number(process.env.SKILL_CARD_ROLLOUT_PCT ?? 0);
  if (pct <= 0) return true;
  if (pct >= 100) return false;

  const bucket = stableHash(`${input.userId ?? '_'}:${input.sessionId ?? '_'}`) % 100;
  return bucket >= pct;
}

export function resolveCapabilities(hs?: McpHandshakeContext): EffectiveCapabilities {
  const renderApps = hasAppsCapability(hs);
  const rootsAvailable = hasRoots(hs?.clientCapabilities);
  const surface = inferSurface(hs, renderApps, rootsAvailable);

  const base: EffectiveCapabilities = {
    surface,
    renderApps,
    canInstall: ['code-editor', 'desktop-app', 'terminal'].includes(surface),
    canUseInChat: true,
    hostSkipAction: renderApps && hs?.appsFeatures?.directActions === true,
    compactLayout: ['mobile', 'tablet'].includes(surface),
  };

  const override = CLIENT_OVERRIDES[normalizeClientName(hs?.clientInfo?.name)] ?? {};
  return {
    ...base,
    ...override,
    renderApps: base.renderApps && (override.renderApps ?? true),
  };
}
