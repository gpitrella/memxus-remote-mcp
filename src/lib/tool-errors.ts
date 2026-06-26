import { z } from 'zod';

const INTERNAL_ERROR_PREFIXES = [
  'saveMemory:',
  'appendToMemory:',
  'searchMemories:',
  'listMemories:',
  'listCollections:',
  'deleteMemory:',
  'updateMemory:',
  'getStats:',
];

function shouldSanitize(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.SANITIZE_TOOL_ERRORS === 'true';
}

/** User-safe tool error text for MCP clients (marketplace review). */
export function sanitizeToolError(err: unknown, toolName: string): string {
  if (err instanceof z.ZodError) {
    return 'Invalid tool arguments.';
  }

  const message = err instanceof Error ? err.message : 'Unknown error';

  if (message === 'Memory not found') {
    return message;
  }

  if (message.startsWith('Unknown tool:')) {
    return message;
  }

  if (!shouldSanitize()) {
    return message;
  }

  const looksInternal =
    INTERNAL_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix)) ||
    /postgres|supabase|pgrst|jwt|sql/i.test(message);

  if (looksInternal) {
    return `The ${toolName} operation failed. Please try again.`;
  }

  return message;
}
