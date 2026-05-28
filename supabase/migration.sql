-- AI Memory Remote MCP — additive, idempotent migration
-- Run after Dash-AIMemory/supabase/migration.sql.

CREATE TABLE IF NOT EXISTS public.oauth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT UNIQUE,
  client_id TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  scope TEXT NOT NULL DEFAULT 'memories:read memories:write',
  state TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_user ON public.oauth_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON public.oauth_codes(expires_at);

CREATE TABLE IF NOT EXISTS public.oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT,
  redirect_uris TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS oauth_client_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
