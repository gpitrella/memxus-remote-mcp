-- Backfill memory_collections from existing memories.collection slugs (idempotent).
-- Run once in Supabase SQL Editor after collections-migration.sql.

INSERT INTO public.memory_collections (user_id, slug, name, description, default_memory_type)
SELECT DISTINCT
  m.user_id,
  m.collection,
  CASE m.collection
    WHEN 'project:ai-memory' THEN 'AI Memory (proyecto)'
    WHEN 'personal:preferences' THEN 'Preferencias personales'
    ELSE m.collection
  END,
  NULL,
  CASE m.collection
    WHEN 'personal:preferences' THEN 'preference'
    ELSE 'fact'
  END
FROM public.memories m
WHERE m.collection IS NOT NULL
ON CONFLICT (user_id, slug) DO NOTHING;
