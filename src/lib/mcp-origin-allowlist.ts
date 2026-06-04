import { config } from '../config.js';

/** Anthropic + local dev origins for browser MCP clients (Claude Connectors Directory). */
export const DEFAULT_MCP_ORIGIN_ALLOWLIST = [
  'https://claude.ai',
  'https://claude.com',
  'https://claudedesktop.anthropic.com',
  'https://api.anthropic.com',
  'http://localhost:3000',
  'http://localhost:3002',
] as const;

export function getMcpOriginAllowlist(): string[] {
  const configured = config.MCP_ORIGIN_ALLOWLIST;
  if (configured.length > 0) return configured;
  return [...DEFAULT_MCP_ORIGIN_ALLOWLIST];
}

export function isMcpOriginAllowed(origin: string): boolean {
  return getMcpOriginAllowlist().includes(origin);
}
