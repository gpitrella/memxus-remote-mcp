/**
 * User MCP preferences — SYNC: Dash-AIMemory/lib/mcp-preferences.ts
 * SYNC: API-IAMemory/src/lib/mcp-preferences.ts
 */

import { supabase } from './supabase.js';
import {
  isInAppConnectEnabled,
  isSkillRoutingEnabled,
} from './feature-flags.js';
import { isSupportedLanguage, type SupportedLanguage } from './i18n.js';

export type MemoryVisibilityPreference = 'private' | 'shared';

export interface UserMcpPreferences {
  in_app_connect_enabled: boolean;
  skill_routing_enabled: boolean;
  default_memory_visibility: MemoryVisibilityPreference;
  include_group_memories_in_context: boolean;
  language: SupportedLanguage | null;
  language_locked: boolean;
}

export const DEFAULT_USER_MCP_PREFERENCES: UserMcpPreferences = {
  in_app_connect_enabled: false,
  skill_routing_enabled: false,
  default_memory_visibility: 'private',
  include_group_memories_in_context: false,
  language: null,
  language_locked: false,
};

export function parseMcpPreferencesJson(raw: unknown): UserMcpPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_USER_MCP_PREFERENCES };
  }
  const obj = raw as Record<string, unknown>;
  return {
    in_app_connect_enabled:
      typeof obj.in_app_connect_enabled === 'boolean'
        ? obj.in_app_connect_enabled
        : DEFAULT_USER_MCP_PREFERENCES.in_app_connect_enabled,
    skill_routing_enabled:
      typeof obj.skill_routing_enabled === 'boolean'
        ? obj.skill_routing_enabled
        : DEFAULT_USER_MCP_PREFERENCES.skill_routing_enabled,
    default_memory_visibility:
      obj.default_memory_visibility === 'shared' ? 'shared' : 'private',
    include_group_memories_in_context:
      typeof obj.include_group_memories_in_context === 'boolean'
        ? obj.include_group_memories_in_context
        : DEFAULT_USER_MCP_PREFERENCES.include_group_memories_in_context,
    language: isSupportedLanguage(obj.language) ? obj.language : null,
    language_locked:
      typeof obj.language_locked === 'boolean'
        ? obj.language_locked
        : DEFAULT_USER_MCP_PREFERENCES.language_locked,
  };
}

export function mergeMcpPreferences(
  current: UserMcpPreferences,
  patch: Partial<UserMcpPreferences>,
): UserMcpPreferences {
  return { ...current, ...patch };
}

export async function getUserMcpPreferences(userId: string): Promise<UserMcpPreferences> {
  const { data, error } = await supabase
    .from('users')
    .select('mcp_preferences')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return { ...DEFAULT_USER_MCP_PREFERENCES };
  }
  return parseMcpPreferencesJson(data.mcp_preferences);
}

export function isInAppConnectActiveForUser(prefs: UserMcpPreferences): boolean {
  return isInAppConnectEnabled() && prefs.in_app_connect_enabled;
}

export function isSkillRoutingActiveForUser(prefs: UserMcpPreferences): boolean {
  return isSkillRoutingEnabled() && prefs.skill_routing_enabled;
}

export function resolveDefaultReadVisibility(
  prefs: UserMcpPreferences,
  explicit?: 'private' | 'shared' | 'all',
): 'private' | 'shared' | 'all' {
  if (explicit) return explicit;
  return prefs.include_group_memories_in_context ? 'all' : 'private';
}
