/**
 * Glama build-check bridge: spawns local HTTP MCP server and exposes it on stdio
 * via mcp-proxy startStdioServer. Glama wraps this as: mcp-proxy -- node scripts/glama-build-bridge.mjs
 *
 * Child stdout must NOT inherit — Express logs would corrupt MCP stdio.
 */
import { spawn } from 'node:child_process';
import { startStdioServer, ServerType } from 'mcp-proxy';

const PORT = process.env.PORT ?? '3002';
const BASE = `http://127.0.0.1:${PORT}`;
const MCP_URL = `${BASE}/mcp`;

function buildChildEnv() {
  const defaults = {
    NODE_ENV: 'test',
    PORT: String(PORT),
    MCP_PUBLIC_URL: BASE,
    DASHBOARD_URL: 'http://127.0.0.1:3000',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'glama-build-check-key-20ch',
    MCP_ORIGIN_ALLOWLIST: 'https://glama.ai',
    CORS_ORIGINS: 'https://glama.ai',
    DISABLE_SKILLS: 'true',
  };
  return { ...process.env, ...defaults };
}

async function waitForHealth(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* server still starting */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Memxus MCP did not become healthy at ${BASE}/health`);
}

const child = spawn('node', ['dist/index.js'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: buildChildEnv(),
});

child.stdout?.on('data', (chunk) => process.stderr.write(chunk));
child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
child.on('exit', (code) => process.exit(code ?? 1));

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});
process.on('SIGINT', () => {
  child.kill('SIGINT');
});

await waitForHealth();
await startStdioServer({
  serverType: ServerType.HTTPStream,
  url: MCP_URL,
});
