import { timingSafeEqual } from 'crypto';
import { config } from '../config.js';

/** Stored in oauth_codes when ChatGPT Actions omits PKCE (OpenAI limitation). */
export const CHATGPT_PKCE_PLACEHOLDER = 'chatgpt-no-pkce';
export const CHATGPT_PKCE_METHOD = 'plain';

/** Test-only overrides (see chatgpt-client.test.ts). */
let testChatGptEnabledOverride: boolean | undefined;
let testChatGptSecretOverride: string | undefined;

export function _testSetChatGptOAuthEnabled(enabled: boolean | undefined): void {
  testChatGptEnabledOverride = enabled;
}

export function _testSetChatGptClientSecret(secret: string | undefined): void {
  testChatGptSecretOverride = secret;
}

function chatGptClientSecret(): string | undefined {
  return testChatGptSecretOverride ?? config.CHATGPT_OAUTH_CLIENT_SECRET;
}

export function chatgptOAuthEnabled(): boolean {
  if (testChatGptEnabledOverride !== undefined) return testChatGptEnabledOverride;
  return Boolean(chatGptClientSecret() && config.CHATGPT_OAUTH_REDIRECT_URI);
}

export function isChatGptOAuthClient(clientId: string | undefined): boolean {
  if (!clientId || !chatgptOAuthEnabled()) return false;
  return clientId === config.CHATGPT_OAUTH_CLIENT_ID;
}

export function isChatGptRedirectUri(uri: string): boolean {
  return chatgptOAuthEnabled() && uri === config.CHATGPT_OAUTH_REDIRECT_URI;
}

export function isChatGptPkceBypass(codeChallenge: string, codeChallengeMethod: string): boolean {
  return codeChallenge === CHATGPT_PKCE_PLACEHOLDER && codeChallengeMethod === CHATGPT_PKCE_METHOD;
}

export function validateChatGptClientSecret(secret: string | undefined): boolean {
  const expected = chatGptClientSecret();
  if (!expected || !secret) return false;
  const a = Buffer.from(secret, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type AuthorizePkceResolution =
  | { ok: true; codeChallenge: string; codeChallengeMethod: string }
  | { ok: false; error: string; error_description: string };

/** Pure helper for authorize PKCE rules (tested without HTTP). */
export function resolveAuthorizePkce(
  clientId: string,
  codeChallenge: string | undefined,
  codeChallengeMethod = 'S256'
): AuthorizePkceResolution {
  if (isChatGptOAuthClient(clientId)) {
    if (codeChallenge) {
      return {
        ok: false,
        error: 'invalid_request',
        error_description: 'ChatGPT OAuth client must not send code_challenge (PKCE not supported)',
      };
    }
    return {
      ok: true,
      codeChallenge: CHATGPT_PKCE_PLACEHOLDER,
      codeChallengeMethod: CHATGPT_PKCE_METHOD,
    };
  }

  if (!codeChallenge) {
    return {
      ok: false,
      error: 'invalid_request',
      error_description: 'code_challenge required (PKCE)',
    };
  }
  if (codeChallengeMethod !== 'S256') {
    return {
      ok: false,
      error: 'invalid_request',
      error_description: 'only S256 supported',
    };
  }
  return { ok: true, codeChallenge, codeChallengeMethod };
}

export type TokenRequestResolution =
  | { ok: true; requiresPkceVerifier: boolean; requiresClientSecret: boolean }
  | { ok: false; error: string; error_description?: string };

/** Pure helper for token endpoint requirements (tested without HTTP). */
export function resolveTokenRequirements(
  clientId: string | undefined,
  codeVerifier: string | undefined,
  clientSecret: string | undefined
): TokenRequestResolution {
  if (isChatGptOAuthClient(clientId)) {
    if (!validateChatGptClientSecret(clientSecret)) {
      return { ok: false, error: 'invalid_client' };
    }
    if (codeVerifier) {
      return {
        ok: false,
        error: 'invalid_request',
        error_description: 'code_verifier must not be sent for ChatGPT OAuth client',
      };
    }
    return { ok: true, requiresPkceVerifier: false, requiresClientSecret: true };
  }

  if (!codeVerifier) {
    return { ok: false, error: 'invalid_request' };
  }
  return { ok: true, requiresPkceVerifier: true, requiresClientSecret: false };
}

export function apiKeyNameForOAuthClient(clientId: string, workforceWorkspaceId?: string): string {
  if (workforceWorkspaceId) return `Claude Workforce (${clientId})`;
  if (isChatGptOAuthClient(clientId)) return `ChatGPT (${clientId})`;
  return `Claude (${clientId})`;
}
