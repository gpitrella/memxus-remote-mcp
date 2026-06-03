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
    .default('https://claude.ai,https://claude.com,https://api.anthropic.com')
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

const parsed = schema.parse(process.env);

if (process.env.NODE_ENV === 'production' && parsed.ALLOWED_REDIRECT_URIS.length === 0) {
  // eslint-disable-next-line no-console
  console.error(
    '[startup] ALLOWED_REDIRECT_URIS must be set in production (comma-separated OAuth redirect URIs)'
  );
  process.exit(1);
}

export const config = {
  ...parsed,
  MCP_PUBLIC_URL: stripTrailingSlash(parsed.MCP_PUBLIC_URL),
  DASHBOARD_URL: stripTrailingSlash(parsed.DASHBOARD_URL),
  CODE_TTL_SECONDS: 600,
  TOKEN_TTL_SECONDS: 31536000,
  SUPPORTED_SCOPES: ['memories:read', 'memories:write', 'memories:delete'] as const,
};

export type AppConfig = typeof config;
