import { config } from '../config.js';
import {
  CLAUDE_REDIRECT_URIS,
  GLAMA_APP_REDIRECT_URI,
  GLAMA_INSPECTOR_REDIRECT_URI,
  SMITHERY_REDIRECT_URIS,
  VS_CODE_REDIRECT_URIS,
  GEMINI_CLI_REDIRECT_URIS,
  isVsCodeLoopbackRedirect,
  isGeminiCliLoopbackRedirect,
} from '../oauth/client-routes.js';

const KNOWN_MCP_REDIRECT_URIS = new Set<string>([
  ...CLAUDE_REDIRECT_URIS,
  ...SMITHERY_REDIRECT_URIS,
  ...VS_CODE_REDIRECT_URIS,
  ...GEMINI_CLI_REDIRECT_URIS,
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

function isGlamaOfficialRedirect(uri: string): boolean {
  return uri === GLAMA_APP_REDIRECT_URI || uri === GLAMA_INSPECTOR_REDIRECT_URI;
}

function hasGlamaOfficialRedirect(registered: string[]): boolean {
  return registered.some(isGlamaOfficialRedirect);
}

/** Glama Connectors and Inspector share OAuth clients but use different official callbacks. */
function glamaOfficialCrossMatch(a: string, b: string): boolean {
  return isGlamaOfficialRedirect(a) && isGlamaOfficialRedirect(b);
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

/** VS Code loopback uses root path; port differences are ignored on token exchange. */
export function vsCodeLoopbackRedirectUrisMatch(a: string, b: string): boolean {
  if (!isVsCodeLoopbackRedirect(a) || !isVsCodeLoopbackRedirect(b)) return false;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.hostname === ub.hostname;
  } catch {
    return false;
  }
}

/** Gemini CLI loopback uses /oauth/callback; port differences are ignored on token exchange. */
export function geminiCliLoopbackRedirectUrisMatch(a: string, b: string): boolean {
  if (!isGeminiCliLoopbackRedirect(a) || !isGeminiCliLoopbackRedirect(b)) return false;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.hostname === ub.hostname;
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
  if (isVsCodeLoopbackRedirect(uri)) return true;
  if (isGeminiCliLoopbackRedirect(uri)) return true;
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

/** Exact match, loopback port-agnostic, or Glama app/inspector cross-match. */
export function redirectUrisMatch(requested: string, registered: string): boolean {
  if (requested === registered) return true;
  if (loopbackRedirectUrisMatch(requested, registered)) return true;
  if (vsCodeLoopbackRedirectUrisMatch(requested, registered)) return true;
  if (geminiCliLoopbackRedirectUrisMatch(requested, registered)) return true;
  if (glamaOfficialCrossMatch(requested, registered)) return true;
  return false;
}

export function isRedirectUriRegistered(requested: string, registered: string[]): boolean {
  if (registered.some((r) => redirectUrisMatch(requested, r))) return true;
  if (isLoopbackMcpCallback(requested) && hasGlamaOfficialRedirect(registered)) return true;
  return false;
}

export function validateRedirectUris(uris: string[]): string | null {
  const { allowed, rejected } = filterAllowedRedirectUris(uris);
  if (allowed.length === 0) {
    const sample = rejected[0] ?? 'unknown';
    return `redirect_uri not allowed: ${sample}`;
  }
  return null;
}
