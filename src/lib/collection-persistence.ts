/**
 * Centralized collection persistence layer with transparent encryption.
 * All memory_collections DB I/O MUST go through this module.
 * SYNC: RemoteMCP-AIMemory/src/lib/collection-persistence.ts
 */

import { supabase as supabaseAdmin } from './supabase.js';
import {
  prepareCollectionForStorage,
  prepareCollectionPatchForStorage,
  decryptCollectionRow,
  decryptCollectionRows,
  sortCollectionsByName,
  type CollectionRowMinimal,
  type CollectionStorageInput,
} from './collection-crypto.js';
import { computeCollectionSlugHash } from './collection-slug-hash.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseQueryResult = { data: any; error: any };

export async function insertCollectionEncrypted(
  userId: string,
  input: CollectionStorageInput & { default_memory_type?: string }
): Promise<SupabaseQueryResult> {
  const prepared = await prepareCollectionForStorage(input, userId);

  const row = {
    user_id: userId,
    slug: prepared.slug,
    name: prepared.name,
    description: prepared.description,
    icon: prepared.icon,
    slug_hash: prepared.slug_hash,
    default_memory_type: input.default_memory_type ?? 'general',
  };

  return supabaseAdmin.from('memory_collections').insert(row).select().single();
}

export async function updateCollectionBySlugEncrypted(
  userId: string,
  plaintextSlug: string,
  patch: Record<string, unknown>
): Promise<SupabaseQueryResult> {
  const existing = await findCollectionBySlugDecrypted(userId, plaintextSlug);
  if (!existing?.id) {
    return { data: null, error: { message: 'Collection not found', code: 'PGRST116' } };
  }

  const encPatch = await prepareCollectionPatchForStorage(patch, userId, plaintextSlug);

  return supabaseAdmin
    .from('memory_collections')
    .update({ ...encPatch, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select()
    .single();
}

export async function deleteCollectionBySlug(
  userId: string,
  plaintextSlug: string
): Promise<{ error: { message: string } | null }> {
  const existing = await findCollectionBySlugDecrypted(userId, plaintextSlug);
  if (!existing?.id) {
    return { error: null };
  }

  const { error } = await supabaseAdmin
    .from('memory_collections')
    .delete()
    .eq('id', existing.id);

  return { error };
}

export async function fetchCollectionsDecrypted(
  userId: string
): Promise<CollectionRowMinimal[]> {
  const { data, error } = await supabaseAdmin
    .from('memory_collections')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;

  const decrypted = await decryptCollectionRows(
    (data ?? []) as CollectionRowMinimal[],
    userId
  );

  return sortCollectionsByName(decrypted);
}

export async function findCollectionBySlugDecrypted(
  userId: string,
  plaintextSlug: string
): Promise<CollectionRowMinimal | null> {
  const slugHash = computeCollectionSlugHash(userId, plaintextSlug);

  const { data: initialData, error } = await supabaseAdmin
    .from('memory_collections')
    .select('*')
    .eq('user_id', userId)
    .eq('slug_hash', slugHash)
    .maybeSingle();

  if (error) return null;

  let data = initialData;
  if (!data) {
    const legacy = await supabaseAdmin
      .from('memory_collections')
      .select('*')
      .eq('user_id', userId)
      .eq('slug', plaintextSlug)
      .maybeSingle();
    data = legacy.data;
    if (legacy.error || !data) return null;
  }

  return decryptCollectionRow(data as CollectionRowMinimal, userId);
}

export async function upsertCollectionEncrypted(
  userId: string,
  input: CollectionStorageInput & { default_memory_type?: string }
): Promise<{ error: { message: string } | null }> {
  const existing = await findCollectionBySlugDecrypted(userId, input.slug);
  if (existing) {
    return { error: null };
  }

  const prepared = await prepareCollectionForStorage(input, userId);

  const { error } = await supabaseAdmin.from('memory_collections').insert({
    user_id: userId,
    slug: prepared.slug,
    name: prepared.name,
    description: prepared.description,
    icon: prepared.icon,
    slug_hash: prepared.slug_hash,
    default_memory_type: input.default_memory_type ?? 'general',
  });

  return { error };
}

export { decryptCollectionRow } from './collection-crypto.js';

export async function decryptFetchedCollectionRows(
  rows: Record<string, unknown>[],
  readerUserId: string
): Promise<Record<string, unknown>[]> {
  const decrypted = await decryptCollectionRows(
    rows as unknown as CollectionRowMinimal[],
    readerUserId
  );
  return decrypted as unknown as Record<string, unknown>[];
}
