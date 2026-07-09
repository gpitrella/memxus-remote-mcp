-- AI Memory — memory_collections encryption support (idempotent)
-- Run after collections-migration.sql in Supabase SQL Editor.
-- Backfill slug_hash + encrypt fields via API-IAMemory/scripts/migrate-encrypt-collections.mjs

ALTER TABLE public.memory_collections
  ADD COLUMN IF NOT EXISTS slug_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_collections_user_slug_hash
  ON public.memory_collections(user_id, slug_hash)
  WHERE slug_hash IS NOT NULL;

-- After migrate-encrypt-collections.mjs completes, drop legacy unique on plaintext slug:
-- ALTER TABLE public.memory_collections DROP CONSTRAINT IF EXISTS memory_collections_user_id_slug_key;
