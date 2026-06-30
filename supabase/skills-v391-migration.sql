-- Memxus Skills v3.9.1 — catalog + user decisions (idempotent)

CREATE TABLE IF NOT EXISTS public.skills_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  applies_to_stack JSONB NOT NULL DEFAULT '{}'::jsonb,
  instructions TEXT,
  url TEXT,
  source TEXT NOT NULL DEFAULT 'official'
    CHECK (source IN ('official', 'community')),
  install_command TEXT,
  instructions_cached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.skill_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  collection TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('used_in_chat', 'installed', 'skipped')),
  chat_session_id TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, collection, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_decisions_user_collection
  ON public.skill_decisions (user_id, collection);

CREATE INDEX IF NOT EXISTS idx_skill_decisions_skip_lookup
  ON public.skill_decisions (user_id, collection, action, decided_at DESC);

INSERT INTO public.skills_catalog (skill_id, name, description, source, url, install_command, applies_to_stack)
VALUES
  ('anthropics/skills/supabase', 'Supabase', 'Supabase setup and migrations', 'official',
   'https://github.com/anthropics/skills', 'npx skills add anthropics/skills@supabase',
   '{"db":["supabase"]}'::jsonb),
  ('anthropics/skills/nextjs', 'Next.js', 'Next.js app patterns', 'official',
   'https://github.com/anthropics/skills', 'npx skills add anthropics/skills@nextjs',
   '{"framework":["next.js","nextjs"]}'::jsonb),
  ('anthropics/skills/mcp-server', 'MCP Server', 'Build MCP servers', 'official',
   'https://github.com/anthropics/skills', 'npx skills add anthropics/skills@mcp-server',
   '{"framework":["mcp"]}'::jsonb)
ON CONFLICT (skill_id) DO NOTHING;
