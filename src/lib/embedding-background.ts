import { supabase } from './supabase.js';
import { generateEmbedding } from './embedding.js';
import { logPerfPhase } from './mcp-perf.js';

export function scheduleEmbeddingUpdate(memoryId: string, plaintext: string): void {
  void (async () => {
    const startedAt = Date.now();
    try {
      const embedding = await generateEmbedding(plaintext);
      if (!embedding) return;

      const { error } = await supabase
        .from('memories')
        .update({ embedding })
        .eq('id', memoryId);

      if (error) {
        console.error('[embedding-background] update failed:', error.message, { memoryId });
        return;
      }

      logPerfPhase('remember_embed_async', Date.now() - startedAt, {
        memoryId,
        textLength: plaintext.length,
      });
    } catch (err) {
      console.error('[embedding-background] unexpected error:', err);
    }
  })();
}
