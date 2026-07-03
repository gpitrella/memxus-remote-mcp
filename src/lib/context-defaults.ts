/** Internal defaults for MCP context tools (not applied to public API without explicit params). */
export const MCP_SEARCH_DEFAULTS = {
  min_similarity: 0.72,
} as const;

export const MCP_CONTEXT_DEFAULTS = {
  min_similarity: MCP_SEARCH_DEFAULTS.min_similarity,
  max_tokens_budget: 1500,
} as const;
