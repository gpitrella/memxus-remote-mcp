import 'dotenv/config';
import { z } from 'zod';

function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, '');
}

/** Trim + strip trailing slash before Zod `.url()` (Railway often copies URLs with `/`). */
function normalizeEnvUrl(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  return stripTrailingSlash(raw.trim());
}

const envUrl = z.preprocess(normalizeEnvUrl, z.string().url());

/** Canonical browser origins for MCP marketplaces (Railway / .env.example). */
export const CANONICAL_CORS_ORIGINS = [
  'https://claude.ai',
  'https://claude.com',
  'https://api.anthropic.com',
  'https://glama.ai',
] as const;

export const CANONICAL_MCP_ORIGIN_ALLOWLIST = [
  ...CANONICAL_CORS_ORIGINS,
  'https://claudedesktop.anthropic.com',
] as const;

const schema = z.object({
  PORT: z.coerce.number().default(3002),
  MCP_PUBLIC_URL: envUrl,
  DASHBOARD_URL: envUrl,
  SUPABASE_URL: envUrl,
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  OPENAI_API_KEY: z.string().optional().default(''),
  OAUTH_CLIENT_ID: z.string().default('aimemory-claude'),
  ALLOWED_REDIRECT_URIS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    ),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    ),
  /** Browser Origin allowlist for POST/GET/DELETE /mcp only. Required in production. */
  MCP_ORIGIN_ALLOWLIST: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    ),
  CHATGPT_OAUTH_CLIENT_ID: z.string().default('memxus-chatgpt'),
  CHATGPT_OAUTH_CLIENT_SECRET: z.string().min(16).optional(),
  CHATGPT_OAUTH_REDIRECT_URI: z.preprocess(normalizeEnvUrl, z.string().url()).optional(),
  GLAMA_MAINTAINER_EMAIL: z.string().email().default('gabriel98_@hotmail.com'),
});

/**
 * MCP transport mode (env var, read in mcp/transport.ts):
 * - Default: stateful (`MCP_STATELESS` unset or `false`) — required for Claude web, Smithery, and Glama.
 * - Set `MCP_STATELESS=true` only for single-shot JSON clients; breaks SSE and session-based tool reload.
 */

const parsed = schema.parse(process.env);

if (process.env.NODE_ENV === 'production') {
  if (parsed.ALLOWED_REDIRECT_URIS.length === 0) {
    // eslint-disable-next-line no-console
    console.error(
      '[startup] ALLOWED_REDIRECT_URIS must be set in production (comma-separated OAuth redirect URIs)'
    );
    process.exit(1);
  }
  if (parsed.MCP_ORIGIN_ALLOWLIST.length === 0) {
    // eslint-disable-next-line no-console
    console.error('[startup] MCP_ORIGIN_ALLOWLIST must be set in production');
    process.exit(1);
  }
  if (parsed.CORS_ORIGINS.length === 0) {
    // eslint-disable-next-line no-console
    console.error('[startup] CORS_ORIGINS must be set in production');
    process.exit(1);
  }
}

export const config = {
  ...parsed,
  MCP_PUBLIC_URL: stripTrailingSlash(parsed.MCP_PUBLIC_URL),
  DASHBOARD_URL: stripTrailingSlash(parsed.DASHBOARD_URL),
  CODE_TTL_SECONDS: 600,
  TOKEN_TTL_SECONDS: 31536000,
  SUPPORTED_SCOPES: [
    'memories:read',
    'memories:write',
    'memories:delete',
    'sources:read',
    'sources:write',
  ] as const,
};

export type AppConfig = typeof config;

/** Production uses env only; dev/test fall back to canonical list when unset. */
export function getEffectiveCorsOrigins(): string[] {
  if (config.CORS_ORIGINS.length > 0) return config.CORS_ORIGINS;
  if (process.env.NODE_ENV !== 'production') return [...CANONICAL_CORS_ORIGINS];
  return [];
}
