/**
 * Collection encryption/decryption boundary layer.
 * Handles slug, name, description, icon encryption transparently.
 * SYNC: RemoteMCP-AIMemory/src/lib/collection-crypto.ts
 */

import {
  decryptString,
  encryptString,
  isEncrypted,
  isEncryptionEnabled,
} from './encryption.js';
import { getOrCreateUserDek } from './dek.js';
import { computeCollectionSlugHash } from './collection-slug-hash.js';

export interface CollectionRowMinimal {
  id?: string;
  user_id: string;
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  slug_hash?: string | null;
  default_memory_type?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CollectionStorageInput {
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  default_memory_type?: string;
}

function encryptOptionalField(dek: Buffer, value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (isEncrypted(value)) return value;
  return encryptString(dek, value);
}

function decryptOptionalField(dek: Buffer, value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (!isEncrypted(value)) return value;
  return decryptString(dek, value);
}

// ─── Write path ───────────────────────────────────────────────────────────────

export async function prepareCollectionForStorage(
  input: CollectionStorageInput,
  userId: string
): Promise<{
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  slug_hash: string;
}> {
  const slugHash = computeCollectionSlugHash(userId, input.slug);

  if (!isEncryptionEnabled()) {
    return {
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      slug_hash: slugHash,
    };
  }

  if (isEncrypted(input.slug)) {
    return {
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      slug_hash: slugHash,
    };
  }

  const dek = await getOrCreateUserDek(userId);

  return {
    slug: encryptString(dek, input.slug),
    name: encryptString(dek, input.name),
    description: encryptOptionalField(dek, input.description),
    icon: encryptOptionalField(dek, input.icon),
    slug_hash: slugHash,
  };
}

export async function prepareCollectionPatchForStorage(
  patch: Record<string, unknown>,
  userId: string,
  plaintextSlug: string
): Promise<Record<string, unknown>> {
  const result = { ...patch };

  if (!isEncryptionEnabled()) {
    result.slug_hash = computeCollectionSlugHash(userId, plaintextSlug);
    return result;
  }

  const dek = await getOrCreateUserDek(userId);

  if (typeof result.name === 'string' && !isEncrypted(result.name)) {
    result.name = encryptString(dek, result.name);
  }
  if (result.description !== undefined) {
    const desc = result.description as string | null;
    if (desc != null && desc !== '' && !isEncrypted(desc)) {
      result.description = encryptString(dek, desc);
    }
  }
  if (result.icon !== undefined) {
    const icon = result.icon as string | null;
    if (icon != null && icon !== '' && !isEncrypted(icon)) {
      result.icon = encryptString(dek, icon);
    }
  }

  result.slug_hash = computeCollectionSlugHash(userId, plaintextSlug);
  return result;
}

// ─── Read path ────────────────────────────────────────────────────────────────

export async function decryptCollectionRow<T extends CollectionRowMinimal>(
  row: T,
  readerUserId: string
): Promise<T | null> {
  if (row.user_id !== readerUserId) {
    console.warn(`[collection-crypto] Reader ${readerUserId} cannot decrypt collection for ${row.user_id}`);
    return null;
  }

  const needsDecrypt =
    isEncrypted(row.slug) ||
    isEncrypted(row.name) ||
    (row.description != null && isEncrypted(row.description)) ||
    (row.icon != null && isEncrypted(row.icon));

  if (!needsDecrypt) {
    return row;
  }

  try {
    const dek = await getOrCreateUserDek(readerUserId);

    const decryptedSlug = isEncrypted(row.slug) ? decryptString(dek, row.slug) : row.slug;
    const decryptedName = isEncrypted(row.name) ? decryptString(dek, row.name) : row.name;
    const decryptedDescription = decryptOptionalField(dek, row.description);
    const decryptedIcon = decryptOptionalField(dek, row.icon);

    return {
      ...row,
      slug: decryptedSlug,
      name: decryptedName,
      description: decryptedDescription,
      icon: decryptedIcon,
    };
  } catch (err) {
    const e = err as Error & { code?: string };
    console.error(
      `[collection-crypto] Decrypt failed for collection=${row.id}:`,
      e.code || e.message
    );
    return null;
  }
}

export async function decryptCollectionRows<T extends CollectionRowMinimal>(
  rows: T[],
  readerUserId: string
): Promise<T[]> {
  if (rows.length === 0) return [];

  const results = await Promise.all(
    rows.map((row) => decryptCollectionRow(row, readerUserId))
  );
  return results.filter((r): r is NonNullable<typeof r> => r !== null) as T[];
}

export function sortCollectionsByName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name));
}
