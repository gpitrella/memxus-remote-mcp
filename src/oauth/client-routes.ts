import { isChatGptOAuthClient } from './chatgpt-client.js';

export const SMITHERY_REDIRECT_URI = 'https://smithery.run/oauth/callback';
export const GLAMA_APP_REDIRECT_URI = 'https://glama.ai/api/app/mcp/oauth/callback';
export const GLAMA_INSPECTOR_REDIRECT_URI = 'https://glama.ai/mcp/inspector/oauth/callback';

export const CLAUDE_REDIRECT_URIS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
] as const;

export function isSmitheryRedirectUri(uri: string): boolean {
  return uri === SMITHERY_REDIRECT_URI;
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
  return `Claude (${clientId})`;
}
