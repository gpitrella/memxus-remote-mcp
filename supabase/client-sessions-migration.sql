-- MCP client identity per connection (which AI client connects: Claude/Cursor/
-- ChatGPT/etc). Append-only, one row per real `initialize` handshake — never
-- upserted, so history and multi-client-per-user are both preserved.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.client_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_version TEXT,
  mcp_session_id UUID,
  stateless BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_sessions_user_created
  ON public.client_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_sessions_client_name
  ON public.client_sessions(client_name, created_at DESC);

ALTER TABLE public.client_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_sessions_select_own ON public.client_sessions
  FOR SELECT
  USING (user_id = auth.uid());

-- No insert/update/delete policy for end users: rows are written server-side
-- via the service-role client only (see src/lib/client-sessions.ts), same
-- pattern as public.workforce_audit_logs.
