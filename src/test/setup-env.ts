/**
 * Used by `npm test` only (via node --import). Sets dummy env when vars are missing
 * so config.ts Zod parse succeeds in CI and fresh clones without a .env file.
 * Does not override existing values from .env or the shell.
 */
const defaults: Record<string, string> = {
  MCP_PUBLIC_URL: 'http://localhost:3002',
  DASHBOARD_URL: 'http://localhost:3000',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-for-ci-only',
  MCP_ORIGIN_ALLOWLIST:
    'https://claude.ai,https://claude.com,https://claudedesktop.anthropic.com,https://api.anthropic.com,https://glama.ai',
  CORS_ORIGINS: 'https://claude.ai,https://claude.com,https://api.anthropic.com,https://glama.ai',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
