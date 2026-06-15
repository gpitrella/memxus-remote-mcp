import { config } from '../config.js';
import { getCachedEmbedding, setCachedEmbedding } from './embedding-cache.js';
import { logPerfPhase } from './mcp-perf.js';

export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!config.OPENAI_API_KEY) return null;
  const cached = getCachedEmbedding(text);
  if (cached) {
    logPerfPhase('embedding_cache_hit', 0, { textLength: text.length });
    return cached;
  }

  const startedAt = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: 'text-embedding-ada-002', input: text }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    const embedding = json.data?.[0]?.embedding ?? null;
    if (embedding) {
      setCachedEmbedding(text, embedding);
      logPerfPhase('embedding_openai', Date.now() - startedAt, {
        textLength: text.length,
        cached: false,
      });
    }
    return embedding;
  } catch {
    return null;
  }
}
