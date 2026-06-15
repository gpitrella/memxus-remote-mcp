-- Vector search performance index (idempotent)
-- Run in Supabase SQL editor when memories.embedding has meaningful volume.
-- Requires pgvector extension (already used by search_memories_accessible).

CREATE INDEX IF NOT EXISTS idx_memories_embedding_hnsw
  ON public.memories
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;
