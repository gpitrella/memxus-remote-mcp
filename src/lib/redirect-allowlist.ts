import { config } from '../config.js';

/** Returns true when redirect URI is allowed (empty allowlist = permissive for local dev). */
export function isRedirectUriAllowed(uri: string): boolean {
  const allowed = config.ALLOWED_REDIRECT_URIS;
  if (allowed.length === 0) return true;
  return allowed.includes(uri);
}

export function validateRedirectUris(uris: string[]): string | null {
  for (const uri of uris) {
    if (!isRedirectUriAllowed(uri)) {
      return `redirect_uri not allowed: ${uri}`;
    }
  }
  return null;
}
