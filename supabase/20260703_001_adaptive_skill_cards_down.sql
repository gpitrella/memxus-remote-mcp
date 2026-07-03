DROP TABLE IF EXISTS public.community_fetch_events;
DROP TABLE IF EXISTS public.skill_sanitization_events;
DROP TABLE IF EXISTS public.skip_events;

ALTER TABLE public.skill_decisions
  DROP COLUMN IF EXISTS surface;

ALTER TABLE public.skill_decisions
  DROP COLUMN IF EXISTS lang;

ALTER TABLE public.skill_decisions
  DROP COLUMN IF EXISTS client_name;

ALTER TABLE public.skill_decisions
  DROP COLUMN IF EXISTS render_channel;

ALTER TABLE public.skills_catalog
  DROP COLUMN IF EXISTS install_allowed;

ALTER TABLE public.skills_catalog
  DROP COLUMN IF EXISTS verified_community;

ALTER TABLE public.skills_catalog
  DROP COLUMN IF EXISTS doc_url;

DROP TABLE IF EXISTS public.user_language_state;
DROP TABLE IF EXISTS public.client_capability_overrides;

DELETE FROM public.schema_migrations
WHERE version = '20260703_001_adaptive_skill_cards';
