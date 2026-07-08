/**
 * Canonical MCP tool manifest for smoke tests.
 * SYNC: src/mcp/tool-schemas.ts (MCP_CORE_TOOLS + v2 tool arrays)
 */

/** @typedef {'auto' | 'full' | 'core' | 'connect' | 'skills'} SmokeManifestMode */
/** @typedef {'core' | 'connect' | 'skills' | 'full'} ManifestTier */

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

export const CONNECT_TOOL_NAMES = [
  'check_connect_status',
  'connect_source',
  'list_syncable_items',
  'set_sync_selection',
];

export const SKILL_TOOL_NAMES = [
  'get_context_with_skills',
  'install_skill',
  'reset_skill_decision',
  'skip_skill',
  'suggest_skills',
  'use_skill_in_chat',
];

export const V2_TOOL_NAMES = [...CONNECT_TOOL_NAMES, ...SKILL_TOOL_NAMES];

export const ALL_KNOWN_TOOL_NAMES = [...CORE_TOOL_NAMES, ...V2_TOOL_NAMES];

/**
 * @param {string[]} present
 * @param {string[]} expected
 * @returns {string[]}
 */
function missingFromGroup(present, expected) {
  return expected.filter((t) => !present.includes(t));
}

/**
 * @param {string[]} names Tool names from tools/list (any order)
 * @param {SmokeManifestMode} mode
 * @returns {{ tier: ManifestTier, count: number }}
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

  const presentConnect = CONNECT_TOOL_NAMES.filter((t) => sorted.includes(t));
  const presentSkill = SKILL_TOOL_NAMES.filter((t) => sorted.includes(t));

  if (presentConnect.length > 0 && presentConnect.length !== CONNECT_TOOL_NAMES.length) {
    const missing = missingFromGroup(sorted, CONNECT_TOOL_NAMES);
    throw new Error(
      `Partial connect manifest: got ${presentConnect.length}/${CONNECT_TOOL_NAMES.length} connect tools. ` +
        `Missing: ${missing.join(', ')}. Present: ${presentConnect.join(', ')}.`
    );
  }

  if (presentSkill.length > 0 && presentSkill.length !== SKILL_TOOL_NAMES.length) {
    const missing = missingFromGroup(sorted, SKILL_TOOL_NAMES);
    throw new Error(
      `Partial skills manifest: got ${presentSkill.length}/${SKILL_TOOL_NAMES.length} skill tools. ` +
        `Missing: ${missing.join(', ')}. Present: ${presentSkill.join(', ')}.`
    );
  }

  const hasConnect = presentConnect.length === CONNECT_TOOL_NAMES.length;
  const hasSkills = presentSkill.length === SKILL_TOOL_NAMES.length;

  /** @type {ManifestTier} */
  let tier;
  if (!hasConnect && !hasSkills) {
    tier = 'core';
  } else if (hasConnect && !hasSkills) {
    tier = 'connect';
  } else if (!hasConnect && hasSkills) {
    tier = 'skills';
  } else {
    tier = 'full';
  }

  if (mode === 'full' && tier !== 'full') {
    throw new Error(
      `SMOKE_MANIFEST=full requires all 19 tools (tier=full). Got ${count} (tier=${tier}). ` +
        'Enable ENABLE_INAPP_CONNECT and ENABLE_SKILL_ROUTING plus user mcp_preferences on the smoke user.'
    );
  }

  if (mode === 'core' && tier !== 'core') {
    throw new Error(
      `SMOKE_MANIFEST=core requires exactly 9 tools (tier=core). Got ${count} (tier=${tier}). ` +
        'Disable v2 flags or smoke user mcp_preferences for core-only validation.'
    );
  }

  if (mode === 'connect' && tier !== 'connect') {
    throw new Error(
      `SMOKE_MANIFEST=connect requires 13 tools (tier=connect). Got ${count} (tier=${tier}). ` +
        'Enable ENABLE_INAPP_CONNECT with DISABLE_SKILLS or skill routing off on the smoke user.'
    );
  }

  if (mode === 'skills' && tier !== 'skills') {
    throw new Error(
      `SMOKE_MANIFEST=skills requires 15 tools (tier=skills). Got ${count} (tier=${tier}). ` +
        'Enable ENABLE_SKILL_ROUTING plus user skill_routing_enabled on the smoke user.'
    );
  }

  return { tier, count };
}
