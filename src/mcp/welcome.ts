/**
 * First-tool-call welcome message (onboarding). Fires on `recall`/`get_context`
 * instead of `initialize` because many MCP clients render tool-call results in
 * the chat but not the initialize response.
 */
import { getStats, saveMemory } from './tools.js';
import type { MemoryRow } from './memory-types.js';

// TODO(copy-review): worded for an LLM to surface naturally in the chat, not
// for the MCP client to render literally. Get human sign-off before shipping.
const WELCOME_MEMORY_CONTENT =
  "Welcome to Memxus! This is your first memory — I'll remember things you " +
  "tell me to save (facts, preferences, decisions, project context) and " +
  "recall them later so you don't have to repeat yourself. Try asking me to " +
  "remember something, or search what's already here.";

/**
 * If this user has never saved anything, creates a one-time welcome memory
 * and returns it. Returns null (no-op) once the user has any real memory.
 *
 * `deps` defaults to the real getStats/saveMemory (used by server.ts) and
 * exists only so tests can substitute fakes — ESM named exports can't be
 * mocked in place (node:test's mock.method requires a configurable property,
 * which module namespace exports aren't).
 */
export async function maybeCreateWelcomeMemory(
  userId: string,
  workforceWorkspaceId?: string,
  deps: { getStats: typeof getStats; saveMemory: typeof saveMemory } = { getStats, saveMemory },
): Promise<MemoryRow | null> {
  const stats = await deps.getStats(userId, workforceWorkspaceId);
  if (stats.total !== 0) return null;

  // Cheap race guard for two near-simultaneous first tool calls (e.g. an eager
  // client firing recall + get_context back to back): re-check immediately
  // before inserting. Does not eliminate the race, just shrinks the window —
  // a rare duplicate welcome memory is a low-stakes UX annoyance, not a
  // correctness bug worth DB-level locking.
  const recheck = await deps.getStats(userId, workforceWorkspaceId);
  if (recheck.total !== 0) return null;

  return deps.saveMemory({
    userId,
    workforceWorkspaceId,
    content: WELCOME_MEMORY_CONTENT,
    type: 'general',
    tags: ['system_welcome'],
    importance: 0.3,
  });
}
