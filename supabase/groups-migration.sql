-- Memxus Groups — shared consumer groups (idempotent)
-- Run after workforce-migration.sql in Supabase SQL Editor.

-- ─────────────────────────────────────────────
-- Shared groups (consumer, not Workforce B2B)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  type TEXT NOT NULL DEFAULT 'general',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shared_groups_type_check CHECK (
    type IN ('family', 'sports_team', 'school', 'friends', 'club', 'work_simple', 'general')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_groups_owner_slug
  ON public.shared_groups(owner_user_id, slug)
  WHERE slug IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shared_groups_owner
  ON public.shared_groups(owner_user_id)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- Group membership
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_group_members (
  group_id UUID NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id),
  CONSTRAINT shared_group_members_role_check CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  CONSTRAINT shared_group_members_status_check CHECK (status IN ('invited', 'active', 'removed'))
);

CREATE INDEX IF NOT EXISTS idx_shared_group_members_user
  ON public.shared_group_members(user_id, status);

-- ─────────────────────────────────────────────
-- Group invites (token-based, Workforce pattern)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member',
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shared_group_invites_role_check CHECK (role IN ('admin', 'member', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_shared_group_invites_group
  ON public.shared_group_invites(group_id);

CREATE INDEX IF NOT EXISTS idx_shared_group_invites_email
  ON public.shared_group_invites(email);

-- ─────────────────────────────────────────────
-- Memories: group scope
-- ─────────────────────────────────────────────
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.shared_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_memories_group_id
  ON public.memories(group_id)
  WHERE group_id IS NOT NULL;

-- Extend scope check to include group
ALTER TABLE public.memories DROP CONSTRAINT IF EXISTS memories_scope_check;
ALTER TABLE public.memories ADD CONSTRAINT memories_scope_check
  CHECK (scope IN ('personal', 'workforce', 'group'));

ALTER TABLE public.memories DROP CONSTRAINT IF EXISTS memories_group_scope_check;
ALTER TABLE public.memories ADD CONSTRAINT memories_group_scope_check
  CHECK (
    (scope = 'group' AND group_id IS NOT NULL)
    OR (scope <> 'group' AND group_id IS NULL)
  );

-- ─────────────────────────────────────────────
-- RLS: update memories select policy (add group branch)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS workforce_memories_select ON public.memories;
CREATE POLICY workforce_memories_select ON public.memories
  FOR SELECT USING (
    (scope = 'personal' AND user_id = auth.uid())
    OR (
      scope = 'workforce'
      AND workforce_workspace_id IN (
        SELECT workspace_id FROM public.workforce_workspace_members
        WHERE user_id = auth.uid()
      )
    )
    OR (
      scope = 'group'
      AND group_id IN (
        SELECT group_id FROM public.shared_group_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Groups tables: members can read their groups
ALTER TABLE public.shared_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_group_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shared_groups_select ON public.shared_groups;
CREATE POLICY shared_groups_select ON public.shared_groups
  FOR SELECT USING (
    deleted_at IS NULL
    AND id IN (
      SELECT group_id FROM public.shared_group_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS shared_group_members_select ON public.shared_group_members;
CREATE POLICY shared_group_members_select ON public.shared_group_members
  FOR SELECT USING (
    group_id IN (
      SELECT group_id FROM public.shared_group_members m
      WHERE m.user_id = auth.uid() AND m.status = 'active'
    )
  );

-- ─────────────────────────────────────────────
-- Accessible vector search (groups + workforce cross-member)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_memories_accessible(
  p_user_id UUID,
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.6,
  p_group_ids UUID[] DEFAULT NULL,
  p_workforce_workspace_ids UUID[] DEFAULT NULL,
  p_include_personal BOOL DEFAULT TRUE,
  p_collection TEXT DEFAULT NULL,
  p_memory_type TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  content TEXT,
  memory_type TEXT,
  importance FLOAT,
  tags TEXT[],
  metadata JSONB,
  collection TEXT,
  thread_id UUID,
  scope TEXT,
  group_id UUID,
  workforce_workspace_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.user_id,
    m.content,
    m.memory_type,
    m.importance,
    m.tags,
    COALESCE(m.metadata, '{}'::jsonb),
    m.collection,
    m.thread_id,
    m.scope,
    m.group_id,
    m.workforce_workspace_id,
    m.created_at,
    m.updated_at,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM memories m
  WHERE m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
    AND (
      (p_include_personal AND m.scope = 'personal' AND m.user_id = p_user_id)
      OR (
        m.scope = 'group'
        AND p_group_ids IS NOT NULL
        AND cardinality(p_group_ids) > 0
        AND m.group_id = ANY(p_group_ids)
      )
      OR (
        m.scope = 'workforce'
        AND p_workforce_workspace_ids IS NOT NULL
        AND cardinality(p_workforce_workspace_ids) > 0
        AND m.workforce_workspace_id = ANY(p_workforce_workspace_ids)
      )
    )
    AND (p_collection IS NULL OR m.collection = p_collection)
    AND (p_memory_type IS NULL OR m.memory_type = p_memory_type)
    AND (p_tags IS NULL OR cardinality(p_tags) = 0 OR m.tags @> p_tags)
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
