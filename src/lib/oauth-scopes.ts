/** OAuth scope helpers for MCP connect and memory tools. */

import { config } from '../config.js';
import { isInAppConnectEnabled } from './feature-flags.js';

export function parseOAuthScopes(scopeStr: string | undefined): Set<string> {
  if (!scopeStr?.trim()) return new Set();
  return new Set(scopeStr.trim().split(/\s+/).filter(Boolean));
}

export function tokenHasScopes(scopeStr: string | undefined, required: string[]): boolean {
  const granted = parseOAuthScopes(scopeStr);
  return required.every((s) => granted.has(s));
}

export function assertOAuthScopes(
  scopeStr: string | undefined,
  required: string[],
  opts?: { isOAuthToken?: boolean }
): void {
  if (!opts?.isOAuthToken) return;
  if (!tokenHasScopes(scopeStr, required)) {
    throw new Error(`Missing required OAuth scope(s): ${required.join(', ')}`);
  }
}

export function assertMemoryReadScope(
  scopeStr: string | undefined,
  opts?: { isOAuthToken?: boolean }
): void {
  assertOAuthScopes(scopeStr, ['memories:read'], opts);
}

export function assertMemoryWriteScope(
  scopeStr: string | undefined,
  opts?: { isOAuthToken?: boolean }
): void {
  assertOAuthScopes(scopeStr, ['memories:write'], opts);
}

export function assertMemoryDeleteScope(
  scopeStr: string | undefined,
  opts?: { isOAuthToken?: boolean }
): void {
  assertOAuthScopes(scopeStr, ['memories:delete'], opts);
}

export function getDefaultOAuthScope(): string {
  const scopes: string[] = ['memories:read', 'memories:write', 'memories:delete'];
  if (isInAppConnectEnabled()) {
    scopes.push('sources:read', 'sources:write');
  }
  return scopes.join(' ');
}

export type NormalizeScopesResult =
  | { ok: true; scope: string }
  | { ok: false; error: string; error_description?: string };

export function normalizeRequestedOAuthScopes(requested: string | undefined): NormalizeScopesResult {
  const supported = new Set<string>(config.SUPPORTED_SCOPES);
  const raw = requested?.trim() || getDefaultOAuthScope();
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { ok: false, error: 'invalid_scope', error_description: 'Empty scope' };
  }
  for (const part of parts) {
    if (!supported.has(part)) {
      return {
        ok: false,
        error: 'invalid_scope',
        error_description: `Unsupported scope: ${part}`,
      };
    }
  }
  return { ok: true, scope: [...new Set(parts)].join(' ') };
}

export function listOAuthScopeDescriptions(): Array<{ scope: string; description: string }> {
  const base = [
    { scope: 'memories:read', description: 'Search and read memories' },
    { scope: 'memories:write', description: 'Create and update memories' },
    { scope: 'memories:delete', description: 'Delete memories' },
  ];
  if (isInAppConnectEnabled()) {
    base.push(
      { scope: 'sources:read', description: 'List GitHub repos and Notion pages to sync' },
      { scope: 'sources:write', description: 'Connect sources and save sync selection' }
    );
  }
  return base;
}
