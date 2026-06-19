-- Run once in Supabase SQL editor before deploying Pricing V2 storage enforcement.
-- SYNC: API-IAMemory/supabase/user-storage-rpc.sql

CREATE OR REPLACE FUNCTION get_user_storage_bytes(
  p_user_id UUID,
  p_retention_cutoff TIMESTAMPTZ DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    COALESCE(octet_length(m.content), 0) +
    COALESCE(octet_length(m.metadata::text), 0) +
    CASE
      WHEN m.embedding IS NOT NULL THEN COALESCE(pg_column_size(m.embedding), 6144)
      ELSE 6144
    END
  ), 0)::BIGINT
  FROM memories m
  WHERE m.user_id = p_user_id
    AND (p_retention_cutoff IS NULL OR m.created_at >= p_retention_cutoff);
$$;

GRANT EXECUTE ON FUNCTION get_user_storage_bytes(UUID, TIMESTAMPTZ) TO service_role;
