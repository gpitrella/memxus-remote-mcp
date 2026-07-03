CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_capability_overrides (
  client_name TEXT PRIMARY KEY,
  render_apps BOOLEAN,
  can_install BOOLEAN,
  force_surface TEXT CHECK (
    force_surface IN (
      'code-editor',
      'desktop-app',
      'web',
      'mobile',
      'tablet',
      'terminal',
      'unknown'
    )
  ),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS language TEXT CHECK (language IN ('en','es','pt'));

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS language_locked BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS last_detected_language TEXT CHECK (last_detected_language IN ('en','es','pt'));

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS lang_streak INTEGER NOT NULL DEFAULT 0;

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS lang_updated_at TIMESTAMPTZ;

ALTER TABLE skills_catalog
  ADD COLUMN IF NOT EXISTS doc_url TEXT;

ALTER TABLE skills_catalog
  ADD COLUMN IF NOT EXISTS verified_community BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE skills_catalog
  ADD COLUMN IF NOT EXISTS install_allowed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE skill_decisions
  ADD COLUMN IF NOT EXISTS render_channel TEXT CHECK (render_channel IN ('card','plain'));

ALTER TABLE skill_decisions
  ADD COLUMN IF NOT EXISTS client_name TEXT;

ALTER TABLE skill_decisions
  ADD COLUMN IF NOT EXISTS lang TEXT CHECK (lang IN ('en','es','pt'));

ALTER TABLE skill_decisions
  ADD COLUMN IF NOT EXISTS surface TEXT;

CREATE TABLE IF NOT EXISTS skip_events (
  correlation_id UUID PRIMARY KEY,
  user_id UUID,
  skill_id TEXT NOT NULL,
  client_name TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('direct','sendMessage')),
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS skill_sanitization_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id TEXT,
  field TEXT NOT NULL CHECK (field IN ('doc_url','install_command','summary','name')),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_fetch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_host TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','timeout','rate_limited','circuit_open','error')),
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version)
VALUES ('20260703_001_adaptive_skill_cards')
ON CONFLICT (version) DO NOTHING;
