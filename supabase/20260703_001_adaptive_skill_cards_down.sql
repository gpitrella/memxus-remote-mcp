DROP TABLE IF EXISTS community_fetch_events;
DROP TABLE IF EXISTS skill_sanitization_events;
DROP TABLE IF EXISTS skip_events;

ALTER TABLE skill_decisions
  DROP COLUMN IF EXISTS surface;

ALTER TABLE skill_decisions
  DROP COLUMN IF EXISTS lang;

ALTER TABLE skill_decisions
  DROP COLUMN IF EXISTS client_name;

ALTER TABLE skill_decisions
  DROP COLUMN IF EXISTS render_channel;

ALTER TABLE skills_catalog
  DROP COLUMN IF EXISTS install_allowed;

ALTER TABLE skills_catalog
  DROP COLUMN IF EXISTS verified_community;

ALTER TABLE skills_catalog
  DROP COLUMN IF EXISTS doc_url;

ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS lang_updated_at;

ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS lang_streak;

ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS last_detected_language;

ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS language_locked;

ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS language;

DROP TABLE IF EXISTS client_capability_overrides;

DELETE FROM schema_migrations
WHERE version = '20260703_001_adaptive_skill_cards';
