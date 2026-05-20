import { createHash } from 'crypto';

export function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function verifyChallenge(verifier: string, challenge: string, method: string): boolean {
  if (method === 'plain') return verifier === challenge;
  if (method !== 'S256') return false;
  const computed = base64UrlEncode(createHash('sha256').update(verifier).digest());
  return computed === challenge;
}
