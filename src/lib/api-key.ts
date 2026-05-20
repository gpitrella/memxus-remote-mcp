import { createHash, randomBytes } from 'crypto';

const API_KEY_PREFIX = 'aimem_';

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(32).toString('hex')}`;
}

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function getApiKeyPrefix(apiKey: string): string {
  return apiKey.substring(0, API_KEY_PREFIX.length + 6);
}
