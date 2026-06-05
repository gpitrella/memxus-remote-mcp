import { config } from '../config.js';
import {
  CLAUDE_REDIRECT_URIS,
  GLAMA_APP_REDIRECT_URI,
  GLAMA_INSPECTOR_REDIRECT_URI,
  SMITHERY_REDIRECT_URIS,
} from '../oauth/client-routes.js';

const KNOWN_MCP_REDIRECT_URIS = new Set<string>([
  ...CLAUDE_REDIRECT_URIS,
  ...SMITHERY_REDIRECT_URIS,
  GLAMA_APP_REDIRECT_URI,
  GLAMA_INSPECTOR_REDIRECT_URI,
]);

/** RFC 8252 loopback OAuth redirect for MCP desktop clients (port ignored). */
export function isLoopbackMcpCallback(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol !== 'http:') return false;
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return false;
    return u.pathname === '/callback';
  } catch {
    return false;
  }
}

/** Same loopback host + path; port differences are ignored (Claude Code DCR). */
export function loopbackRedirectUrisMatch(a: string, b: string): boolean {
  if (!isLoopbackMcpCallback(a) || !isLoopbackMcpCallback(b)) return false;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.hostname === ub.hostname && ua.pathname === ub.pathname;
  } catch {
    return false;
  }
}

export function isKnownMcpRedirectUri(uri: string): boolean {
  return KNOWN_MCP_REDIRECT_URIS.has(uri);
}

/** Returns true when redirect URI is allowed (empty allowlist = permissive for local dev). */
export function isRedirectUriAllowed(uri: string): boolean {
  const allowed = config.ALLOWED_REDIRECT_URIS;
  if (allowed.length === 0) return true;
  if (allowed.includes(uri)) return true;
  if (isKnownMcpRedirectUri(uri)) return true;
  if (isLoopbackMcpCallback(uri)) return true;
  return false;
}

export function filterAllowedRedirectUris(uris: string[]): {
  allowed: string[];
  rejected: string[];
} {
  const allowed: string[] = [];
  const rejected: string[] = [];
  for (const uri of uris) {
    if (isRedirectUriAllowed(uri)) allowed.push(uri);
    else rejected.push(uri);
  }
  return { allowed, rejected };
}

/** Exact match, or loopback callback with port-agnostic comparison. */
export function redirectUrisMatch(requested: string, registered: string): boolean {
  if (requested === registered) return true;
  return loopbackRedirectUrisMatch(requested, registered);
}

export function isRedirectUriRegistered(requested: string, registered: string[]): boolean {
  return registered.some((r) => redirectUrisMatch(requested, r));
}

export function validateRedirectUris(uris: string[]): string | null {
  const { allowed, rejected } = filterAllowedRedirectUris(uris);
  if (allowed.length === 0) {
    const sample = rejected[0] ?? 'unknown';
    return `redirect_uri not allowed: ${sample}`;
  }
  return null;
}
