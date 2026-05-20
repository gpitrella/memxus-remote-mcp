import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3002),
  MCP_PUBLIC_URL: z.string().url(),
  DASHBOARD_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
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
});

function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, '');
}

const parsed = schema.parse(process.env);

export const config = {
  ...parsed,
  MCP_PUBLIC_URL: stripTrailingSlash(parsed.MCP_PUBLIC_URL),
  DASHBOARD_URL: stripTrailingSlash(parsed.DASHBOARD_URL),
  CODE_TTL_SECONDS: 600,
  TOKEN_TTL_SECONDS: 31536000,
  SUPPORTED_SCOPES: ['memories:read', 'memories:write', 'memories:delete'] as const,
};

export type AppConfig = typeof config;
