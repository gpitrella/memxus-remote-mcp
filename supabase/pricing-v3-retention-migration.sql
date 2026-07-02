-- Pricing v3 — memory archiving (cold storage) + plan events telemetry
-- Run in Supabase SQL Editor after existing migrations.

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'memories_status_check'
  ) THEN
    ALTER TABLE public.memories
      ADD CONSTRAINT memories_status_check CHECK (status IN ('active', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_memories_user_status_created
  ON public.memories(user_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_memories_archived_purge
  ON public.memories(status, archived_at)
  WHERE status = 'archived';

-- Legacy starter plan users
UPDATE public.users SET plan = 'pro', updated_at = now()
WHERE plan = 'starter' AND subscription_status = 'active';

UPDATE public.users SET plan = 'free', updated_at = now()
WHERE plan = 'starter' AND (subscription_status IS NULL OR subscription_status != 'active');

CREATE TABLE IF NOT EXISTS public.plan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_events_user_type
  ON public.plan_events(user_id, event_type, created_at DESC);

-- Active-only storage RPC (replaces get_user_storage_bytes when columns exist)
CREATE OR REPLACE FUNCTION get_user_storage_bytes(
  p_user_id UUID,
  p_retention_cutoff TIMESTAMPTZ DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(
    octet_length(COALESCE(content, '')) +
    octet_length(COALESCE(metadata::text, '{}')) +
    CASE WHEN embedding IS NOT NULL THEN 6144 ELSE 6144 END
  ), 0)::bigint
  FROM public.memories m
  WHERE m.user_id = p_user_id
    AND (m.status = 'active' OR m.status IS NULL)
    AND (p_retention_cutoff IS NULL OR m.created_at >= p_retention_cutoff);
$$;
