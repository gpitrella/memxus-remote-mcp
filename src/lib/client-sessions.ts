/**
 * Persists which MCP client (Claude/Cursor/ChatGPT/etc) connected for a user,
 * from the `initialize` handshake's `clientInfo`. Fire-and-forget, same
 * pattern as scheduleEmbeddingUpdate (embedding-background.ts): never blocks
 * or throws for the caller, logs on failure.
 */
import { supabase } from './supabase.js';
import type { McpHandshakeContext } from './skill-capabilities.js';

export function recordClientSession(
  userId: string,
  handshake: McpHandshakeContext | undefined,
  sessionId?: string,
  stateless = false,
): void {
  const clientInfo = handshake?.clientInfo;
  if (!clientInfo?.name) return;

  // Log point (a): same call frame as extractHandshake's result — no proxy
  // hop in this repo where clientInfo could be lost in transit.
  console.info('mcp_client_identified', {
    userId,
    clientName: clientInfo.name,
    clientVersion: clientInfo.version,
  });

  void (async () => {
    try {
      const { error } = await supabase.from('client_sessions').insert({
        user_id: userId,
        client_name: clientInfo.name,
        client_version: clientInfo.version ?? null,
        mcp_session_id: sessionId ?? null,
        stateless,
      });
      if (error) {
        console.error('[client-sessions] insert failed:', error.message, { userId });
        return;
      }
      // Log point (b): confirms the insert actually reached Supabase.
      console.info('mcp_client_session_recorded', { userId, clientName: clientInfo.name });
    } catch (err) {
      console.error('[client-sessions] unexpected error:', err);
    }
  })();
}
