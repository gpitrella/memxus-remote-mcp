-- Memxus Workforce — additive migration (idempotent)
-- Run after migration.sql in Supabase SQL Editor.
-- Mirror this file in API-IAMemory/supabase/ and RemoteMCP-AIMemory/supabase/.

-- =============================================================================
-- Preflight: align schema with API runtime expectations
-- =============================================================================

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Note: `embedding` VECTOR column is added by collections-migration.sql

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.oauth_codes
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- =============================================================================
-- Workforce tenant tables (separate from legacy org/workspaces)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workforce_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'workforce',
  seats_purchased INTEGER NOT NULL DEFAULT 10,
  seats_used INTEGER NOT NULL DEFAULT 1,
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  subscription_status TEXT NOT NULL DEFAULT 'pending',
  polar_customer_id TEXT,
  polar_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workforce_workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workforce_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.workforce_workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workforce_workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workforce_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workforce_workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workforce_members_user
  ON public.workforce_workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workforce_members_workspace
  ON public.workforce_workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workforce_audit_workspace
  ON public.workforce_audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workforce_invites_token
  ON public.workforce_workspace_invites(token);

ALTER TABLE public.workforce_workspaces
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS polar_customer_id TEXT;

UPDATE public.workforce_workspaces
SET subscription_status = 'active'
WHERE subscription_status = 'pending'
  AND polar_subscription_id IS NOT NULL;

-- =============================================================================
-- Memories: workforce scope (personal unchanged by default)
-- =============================================================================

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS workforce_workspace_id UUID REFERENCES public.workforce_workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'personal';

CREATE INDEX IF NOT EXISTS idx_memories_workforce_workspace
  ON public.memories(workforce_workspace_id)
  WHERE workforce_workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memories_scope_user
  ON public.memories(user_id, scope);

-- =============================================================================
-- RLS (defense in depth)
-- =============================================================================

ALTER TABLE public.workforce_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_audit_logs ENABLE ROW LEVEL SECURITY;

-- Members can read their workspaces
DROP POLICY IF EXISTS workforce_workspaces_select ON public.workforce_workspaces;
CREATE POLICY workforce_workspaces_select ON public.workforce_workspaces
  FOR SELECT USING (
    id IN (
      SELECT workspace_id FROM public.workforce_workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS workforce_members_select ON public.workforce_workspace_members;
CREATE POLICY workforce_members_select ON public.workforce_workspace_members
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workforce_workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

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
  );
