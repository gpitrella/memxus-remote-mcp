import { isChatGptOAuthClient } from './chatgpt-client.js';

/** Smithery CLI/setup and Smithery Connect upstream OAuth callbacks (exact URIs only). */
export const SMITHERY_REDIRECT_URIS = [
  'https://smithery.run/oauth/callback',
  'https://smithery.ai/oauth/callback',
  'https://smithery.ai/connect/callback',
  /** Smithery Connect upstream DCR (txBytes 113 when rejected). */
  'https://auth.smithery.ai/connect',
] as const;

export const SMITHERY_REDIRECT_URI = SMITHERY_REDIRECT_URIS[0];
export const GLAMA_APP_REDIRECT_URI = 'https://glama.ai/api/app/mcp/oauth/callback';
export const GLAMA_INSPECTOR_REDIRECT_URI = 'https://glama.ai/mcp/inspector/oauth/callback';

export const CLAUDE_REDIRECT_URIS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
] as const;

/** VS Code Copilot MCP gallery OAuth (DCR + token exchange). */
export const VS_CODE_REDIRECT_URIS = [
  'https://vscode.dev/redirect',
  'http://127.0.0.1:33418',
] as const;

/** Gemini CLI remote MCP OAuth (DCR + loopback callback on port 7777). */
export const GEMINI_CLI_REDIRECT_URIS = ['http://localhost:7777/oauth/callback'] as const;

export function isSmitheryRedirectUri(uri: string): boolean {
  return (SMITHERY_REDIRECT_URIS as readonly string[]).includes(uri);
}

export function isGlamaAppRedirectUri(uri: string): boolean {
  return uri === GLAMA_APP_REDIRECT_URI;
}

export function isGlamaInspectorRedirectUri(uri: string): boolean {
  return uri === GLAMA_INSPECTOR_REDIRECT_URI;
}

export function isClaudeRedirectUri(uri: string): boolean {
  return (CLAUDE_REDIRECT_URIS as readonly string[]).includes(uri);
}

/** VS Code loopback OAuth uses root path (not /callback). Port may vary on token exchange. */
export function isVsCodeLoopbackRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol !== 'http:') return false;
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return false;
    return u.pathname === '/' || u.pathname === '';
  } catch {
    return false;
  }
}

export function isVsCodeRedirectUri(uri: string): boolean {
  return (
    (VS_CODE_REDIRECT_URIS as readonly string[]).includes(uri) || isVsCodeLoopbackRedirect(uri)
  );
}

/** Gemini CLI loopback OAuth uses /oauth/callback; port may vary on token exchange. */
export function isGeminiCliLoopbackRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol !== 'http:') return false;
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return false;
    return u.pathname === '/oauth/callback';
  } catch {
    return false;
  }
}

export function isGeminiCliRedirectUri(uri: string): boolean {
  return (
    (GEMINI_CLI_REDIRECT_URIS as readonly string[]).includes(uri) ||
    isGeminiCliLoopbackRedirect(uri)
  );
}

/** Smithery/Glama app use browser-heavy OAuth; Claude uses the same 302 path. */
export function isMarketplaceBrowserRedirectUri(uri: string): boolean {
  return isSmitheryRedirectUri(uri) || isGlamaAppRedirectUri(uri);
}

export function acceptsHtmlResponse(acceptHeader: string | undefined): boolean {
  if (!acceptHeader) return false;
  return acceptHeader.includes('text/html');
}

/**
 * Option A (current): always 302 to dashboard. HTML landing reserved for a future flag.
 */
export function shouldServeAuthorizeHtmlLanding(
  acceptHeader: string | undefined,
  redirectUri: string
): boolean {
  void acceptHeader;
  void redirectUri;
  return false;
}

export function apiKeyNameForOAuthClient(
  clientId: string,
  redirectUri: string,
  workforceWorkspaceId?: string
): string {
  if (workforceWorkspaceId) return `Claude Workforce (${clientId})`;
  if (isChatGptOAuthClient(clientId)) return `ChatGPT (${clientId})`;
  if (isSmitheryRedirectUri(redirectUri)) return `Smithery (${clientId})`;
  if (isGlamaAppRedirectUri(redirectUri) || isGlamaInspectorRedirectUri(redirectUri)) {
    return `Glama (${clientId})`;
  }
  if (isVsCodeRedirectUri(redirectUri)) return `VS Code (${clientId})`;
  if (isGeminiCliRedirectUri(redirectUri)) return `Gemini CLI (${clientId})`;
  return `Claude (${clientId})`;
}
