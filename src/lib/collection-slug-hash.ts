/**
 * Deterministic slug hash for encrypted collection lookups.
 * SYNC: RemoteMCP-AIMemory/src/lib/collection-slug-hash.ts
 */

import { createHmac, createHash } from 'node:crypto';
import { loadMasterKey, isEncryptionEnabled } from './encryption.js';

/**
 * Deterministic hash of userId:normalizedSlug for blind-index lookups.
 * Returns 64-char hex string.
 */
export function computeCollectionSlugHash(userId: string, slug: string): string {
  const payload = `${userId}:${slug}`;
  if (!isEncryptionEnabled()) {
    return createHash('sha256').update(payload).digest('hex');
  }
  const mk = loadMasterKey();
  return createHmac('sha256', mk).update(payload).digest('hex');
}
