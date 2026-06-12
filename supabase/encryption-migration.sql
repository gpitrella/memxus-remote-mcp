-- =============================================================================
-- Phase 2: App-Level Memory Encryption — Key Tables
-- =============================================================================
-- Run ONCE per Supabase project. Idempotent (IF NOT EXISTS).
-- These tables store wrapped (encrypted) DEKs only — never plaintext key material.
-- user_id references public.users (same as memories, api_keys) — not auth.users.
-- Access: service_role only. No anon/authenticated policies.
-- =============================================================================

-- ─── User DEKs (one per user_id, wrapped with MASTER_ENCRYPTION_KEY) ──────────
CREATE TABLE IF NOT EXISTS public.user_keys (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  wrapped_dek TEXT NOT NULL,       -- mxe1:base64(iv || ciphertext || tag)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ
);

-- ─── Group DEKs (one per group, wrapped per-member with member's UDEK) ────────
CREATE TABLE IF NOT EXISTS public.group_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.shared_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  wrapped_dek TEXT NOT NULL,       -- GDEK wrapped with this user's UDEK
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

-- ─── Workforce DEKs (one per workspace, wrapped per-member with member's UDEK) ─
CREATE TABLE IF NOT EXISTS public.workforce_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workforce_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  wrapped_dek TEXT NOT NULL,       -- WDEK wrapped with this user's UDEK
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

-- ─── RLS: service_role only (no policies = deny all for anon/authenticated) ────
ALTER TABLE public.user_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_keys ENABLE ROW LEVEL SECURITY;

-- ─── Indexes for lookup performance ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_group_keys_group_id ON public.group_keys(group_id);
CREATE INDEX IF NOT EXISTS idx_group_keys_user_id ON public.group_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_workforce_keys_workspace_id ON public.workforce_keys(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workforce_keys_user_id ON public.workforce_keys(user_id);
