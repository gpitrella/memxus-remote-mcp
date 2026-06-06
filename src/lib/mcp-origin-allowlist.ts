import {
  CANONICAL_MCP_ORIGIN_ALLOWLIST,
  config,
} from '../config.js';

const LOCAL_DEV_MCP_ORIGINS = ['http://localhost:3000', 'http://localhost:3002'] as const;

export function getMcpOriginAllowlist(): string[] {
  const configured =
    config.MCP_ORIGIN_ALLOWLIST.length > 0
      ? [...config.MCP_ORIGIN_ALLOWLIST]
      : process.env.NODE_ENV !== 'production'
        ? [...CANONICAL_MCP_ORIGIN_ALLOWLIST]
        : [];

  if (process.env.NODE_ENV !== 'production') {
    for (const origin of LOCAL_DEV_MCP_ORIGINS) {
      if (!configured.includes(origin)) configured.push(origin);
    }
  }

  return configured;
}

export function isMcpOriginAllowed(origin: string): boolean {
  return getMcpOriginAllowlist().includes(origin);
}
