-- Aggregated memory stats for accessible scopes (idempotent)
-- Run in Supabase SQL editor after groups-migration.sql

CREATE OR REPLACE FUNCTION get_accessible_memory_stats(
  p_user_id UUID,
  p_group_ids UUID[] DEFAULT NULL,
  p_workforce_workspace_ids UUID[] DEFAULT NULL,
  p_include_personal BOOL DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH accessible AS (
    SELECT m.memory_type, m.collection
    FROM memories m
    WHERE (
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
  ),
  type_agg AS (
    SELECT memory_type, COUNT(*)::INT AS cnt
    FROM accessible
    GROUP BY memory_type
  ),
  coll_agg AS (
    SELECT COALESCE(collection, '(uncategorized)') AS collection, COUNT(*)::INT AS cnt
    FROM accessible
    GROUP BY COALESCE(collection, '(uncategorized)')
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*)::INT FROM accessible),
    'by_type', COALESCE((SELECT jsonb_object_agg(memory_type, cnt) FROM type_agg), '{}'::JSONB),
    'by_collection', COALESCE((SELECT jsonb_object_agg(collection, cnt) FROM coll_agg), '{}'::JSONB)
  )
  INTO result;

  RETURN COALESCE(
    result,
    jsonb_build_object('total', 0, 'by_type', '{}'::JSONB, 'by_collection', '{}'::JSONB)
  );
END;
$$;
