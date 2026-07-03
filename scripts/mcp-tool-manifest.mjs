/**
 * Canonical MCP tool manifest for smoke tests.
 * SYNC: src/mcp/tool-schemas.ts (MCP_CORE_TOOLS + v2 tool arrays)
 */

/** @typedef {'auto' | 'full' | 'core'} SmokeManifestMode */

export const CORE_TOOL_NAMES = [
  'forget',
  'get_context',
  'get_memory',
  'list_collections',
  'list_memories',
  'memory_stats',
  'recall',
  'remember',
  'update',
];

export const V2_TOOL_NAMES = [
  'check_connect_status',
  'connect_source',
  'get_context_with_skills',
  'install_skill',
  'list_syncable_items',
  'reset_skill_decision',
  'set_sync_selection',
  'skip_skill',
  'suggest_skills',
  'use_skill_in_chat',
];

export const ALL_KNOWN_TOOL_NAMES = [...CORE_TOOL_NAMES, ...V2_TOOL_NAMES];

/**
 * @param {string[]} names Tool names from tools/list (any order)
 * @param {SmokeManifestMode} mode
 * @returns {{ tier: 'core' | 'full', count: number }}
 */
export function validateToolManifest(names, mode = 'auto') {
  const sorted = [...names].sort();
  const count = sorted.length;
  const knownSet = new Set(ALL_KNOWN_TOOL_NAMES);

  const missingCore = CORE_TOOL_NAMES.filter((t) => !sorted.includes(t));
  if (missingCore.length > 0) {
    throw new Error(
      `Missing core tools: ${missingCore.join(', ')}.\nGot (${count}): ${sorted.join(', ')}`
    );
  }

  const unknown = sorted.filter((t) => !knownSet.has(t));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown tools: ${unknown.join(', ')}. Update scripts/mcp-tool-manifest.mjs if intentional.\nGot (${count}): ${sorted.join(', ')}`
    );
  }

  const presentV2 = V2_TOOL_NAMES.filter((t) => sorted.includes(t));
  const tier = presentV2.length === V2_TOOL_NAMES.length ? 'full' : 'core';

  if (count !== CORE_TOOL_NAMES.length && count !== ALL_KNOWN_TOOL_NAMES.length) {
    throw new Error(
      `Partial v2 manifest: got ${count} tools (expected 9 core or 19 full). ` +
        `Present v2: ${presentV2.join(', ') || '(none)'}. ` +
        'Enable both ENABLE_INAPP_CONNECT and ENABLE_SKILL_ROUTING plus user mcp_preferences, or expect core-only.'
    );
  }

  if (tier === 'core' && presentV2.length > 0) {
    throw new Error(
      `Inconsistent manifest: ${presentV2.length} v2 tools present but not all ${V2_TOOL_NAMES.length}. ` +
        `Partial v2: ${presentV2.join(', ')}`
    );
  }

  if (mode === 'full' && tier !== 'full') {
    throw new Error(
      `SMOKE_MANIFEST=full requires all 19 tools. Got ${count} (core-only). ` +
        'Enable ENABLE_* flags and v2 mcp_preferences on the smoke user.'
    );
  }

  if (mode === 'core' && tier !== 'core') {
    throw new Error(
      `SMOKE_MANIFEST=core requires exactly 9 tools. Got ${count}. ` +
        'Disable v2 flags or smoke user mcp_preferences for core-only validation.'
    );
  }

  return { tier, count };
}
