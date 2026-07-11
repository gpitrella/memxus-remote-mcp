/**
 * MCP-level workspace param resolution (spec §6 — Corrección Bloqueante 3).
 *
 * Normalizes the optional per-call `workspace` tool parameter into a concrete
 * `workspace_id` (or `null` for Personal), with anti-ambiguity guarantees and
 * an echo of the resolved workspace so the caller always knows where an
 * operation actually landed.
 *
 * Not SYNC'd with API-IAMemory — this is MCP-tool-surface only. Membership,
 * RBAC and billing enforcement still happen in workforce-access.ts /
 * workforce-rbac.ts / workforce-billing-state.ts as before; this module only
 * decides *which* workspace_id a call resolves to.
 */

import { supabase } from './supabase.js';
import type { WorkforceRole } from './workforce-access.js';
import { getWorkspaceBillingState, type WorkspaceBillingRow } from './workforce-billing-state.js';
import { canWriteWorkspace } from './workforce-rbac.js';

export type ResolvedWorkspace = {
  id: string | null;
  name: string;
  role?: WorkforceRole;
  writes_allowed: boolean;
};

export type WorkspaceCandidate = {
  id: string;
  name: string;
  slug: string;
  role: WorkforceRole;
  writes_allowed: boolean;
};

export type WorkspaceResolutionErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'AMBIGUOUS';

export class WorkspaceResolutionError extends Error {
  code: WorkspaceResolutionErrorCode;
  constructor(code: WorkspaceResolutionErrorCode, message: string) {
    super(message);
    this.name = 'WorkspaceResolutionError';
    this.code = code;
  }
}

export type NormalizedWorkspaceParam = {
  /** Effective workspace_id for the operation; null = Personal. */
  workspace_id: string | null;
  /** Echo of the resolved destination, always included in tool responses. */
  resolved_workspace: ResolvedWorkspace;
};

type WorkforceWorkspaceJoinRow = WorkspaceBillingRow & { name: string; slug: string };

/** List Personal-adjacent workforce workspaces the user is a member of (for name/slug/uuid resolution). */
export async function listUserWorkspaceCandidates(userId: string): Promise<WorkspaceCandidate[]> {
  const { data, error } = await supabase
    .from('workforce_workspace_members')
    .select(
      'role, workforce_workspaces(id, name, slug, subscription_status, trial_started_at, trial_ends_at, grace_ends_at, scheduled_deletion_at, created_at)'
    )
    .eq('user_id', userId);

  if (error || !data) return [];

  const candidates: WorkspaceCandidate[] = [];
  for (const row of data as unknown as Array<{
    role: string;
    workforce_workspaces: WorkforceWorkspaceJoinRow | WorkforceWorkspaceJoinRow[] | null;
  }>) {
    const wsRaw = row.workforce_workspaces;
    const ws = Array.isArray(wsRaw) ? wsRaw[0] : wsRaw;
    if (!ws) continue;
    const role = row.role as WorkforceRole;
    const billing = getWorkspaceBillingState(ws);
    candidates.push({
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      role,
      writes_allowed: canWriteWorkspace(role, billing),
    });
  }
  return candidates;
}

/** Exact, case-insensitive match against name/slug/uuid. Never partial. */
export function matchWorkspaceIdentifier(
  candidates: WorkspaceCandidate[],
  identifier: string
): WorkspaceCandidate[] {
  const norm = identifier.trim().toLowerCase();
  return candidates.filter(
    (c) => c.id.toLowerCase() === norm || c.name.toLowerCase() === norm || c.slug.toLowerCase() === norm
  );
}

function isPersonalToken(workspace?: string): boolean {
  return workspace?.trim().toLowerCase() === 'personal';
}

/**
 * Build a `resolved_workspace` echo for a direct-ID operation (get_memory,
 * update, forget), where the target workspace is determined by the memory
 * row itself, not by the `workspace` param. Used AFTER the memory has been
 * fetched/mutated, so it always reflects where the operation actually landed.
 */
export async function resolveWorkspaceEcho(
  workspaceId: string | null,
  userId: string
): Promise<ResolvedWorkspace> {
  if (!workspaceId) {
    return { id: null, name: 'Personal', writes_allowed: true };
  }
  const candidates = await listUserWorkspaceCandidates(userId);
  const match = candidates.find((c) => c.id === workspaceId);
  return {
    id: workspaceId,
    name: match?.name ?? 'Workspace',
    role: match?.role,
    writes_allowed: match?.writes_allowed ?? false,
  };
}

/**
 * For direct-ID operations (get_memory, update, forget): the target
 * workspace is always determined by the memory_id itself, never by the
 * `workspace` param (changing that would require reinterpreting the
 * ambient `workforceWorkspaceId` used for API-key-pin authorization, which
 * is out of scope here — see memory-access.ts, not touched by this module).
 *
 * If the caller passes `workspace` anyway, treat it as a confirmation
 * guard: reject with a clear error when it does not match the memory's
 * actual workspace, instead of silently operating on a different one than
 * the caller expected (defense against acting on the wrong memory).
 */
export function assertWorkspaceParamMatchesMemory(
  requestedWorkspace: string | undefined,
  echo: ResolvedWorkspace
): void {
  if (!requestedWorkspace || !requestedWorkspace.trim()) return;
  const requested = requestedWorkspace.trim().toLowerCase();
  const isPersonalRequested = requested === 'personal';
  if (isPersonalRequested) {
    if (echo.id === null) return;
    throw new WorkspaceResolutionError(
      'NOT_FOUND',
      `This memory belongs to workspace "${echo.name}", not Personal.`
    );
  }
  if (echo.id && (echo.id.toLowerCase() === requested || echo.name.toLowerCase() === requested)) {
    return;
  }
  throw new WorkspaceResolutionError(
    'NOT_FOUND',
    `This memory does not belong to workspace "${requestedWorkspace}"${echo.id ? ` (it belongs to "${echo.name}")` : ' (it belongs to Personal)'}.`
  );
}

/**
 * Discoverability hint (spec: descubribilidad §3.2) — when a `recall` query
 * mentions a workspace name/slug but no explicit `workspace` param was given,
 * suggest it. Substring match, NOT the anti-ambiguity exact match used for
 * resolution — this never changes the scope, only nudges the caller. Personal
 * stays the default even when a match is found.
 */
export async function suggestWorkspaceForQuery(
  query: string,
  userId: string
): Promise<string | null> {
  const candidates = await listUserWorkspaceCandidates(userId);
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const match = candidates.find(
    (c) => q.includes(c.name.toLowerCase()) || q.includes(c.slug.toLowerCase())
  );
  if (!match) return null;
  return `Tip: this searched your Personal memory only. To search the "${match.name}" workspace instead, pass workspace: "${match.name}".`;
}

/**
 * Normalize the `workspace` tool param BEFORE resolving scope for a call.
 *
 * Semantics (spec §6):
 * - Dedicated workforce API key (`apiKeyWorkforceWsId` set): forced to that workspace.
 *   Any `workspace` param that does not match the key's own workspace id → FORBIDDEN.
 *   No escape possible (not even to "personal").
 * - No dedicated key + `workspace` param present: resolve by EXACT case-insensitive
 *   match against name/slug/uuid of the user's own workspaces. Zero matches → NOT_FOUND.
 *   More than one match → AMBIGUOUS (never pick arbitrarily).
 * - No dedicated key + no `workspace` param (or `workspace: "personal"`): Personal,
 *   workspace_id null. Never falls back to a server-side "active context".
 */
export async function normalizeWorkspaceParam(
  params: { workspace?: string },
  userId: string,
  apiKeyWorkforceWsId?: string
): Promise<NormalizedWorkspaceParam> {
  if (apiKeyWorkforceWsId) {
    if (params.workspace && params.workspace.trim() && params.workspace.trim() !== apiKeyWorkforceWsId) {
      throw new WorkspaceResolutionError(
        'FORBIDDEN',
        'workspace param is not allowed with a dedicated workforce API key; this connection is locked to its own workspace'
      );
    }
    const candidates = await listUserWorkspaceCandidates(userId);
    const forced = candidates.find((c) => c.id === apiKeyWorkforceWsId);
    return {
      workspace_id: apiKeyWorkforceWsId,
      resolved_workspace: {
        id: apiKeyWorkforceWsId,
        name: forced?.name ?? 'Workspace',
        role: forced?.role,
        writes_allowed: forced?.writes_allowed ?? true,
      },
    };
  }

  if (params.workspace && params.workspace.trim() && !isPersonalToken(params.workspace)) {
    const candidates = await listUserWorkspaceCandidates(userId);
    const matches = matchWorkspaceIdentifier(candidates, params.workspace);
    if (matches.length === 0) {
      throw new WorkspaceResolutionError(
        'NOT_FOUND',
        `Workspace "${params.workspace}" not found or you do not have access to it`
      );
    }
    if (matches.length > 1) {
      throw new WorkspaceResolutionError(
        'AMBIGUOUS',
        'Multiple workspaces match that name; use the exact name or the workspace ID'
      );
    }
    const match = matches[0];
    return {
      workspace_id: match.id,
      resolved_workspace: {
        id: match.id,
        name: match.name,
        role: match.role,
        writes_allowed: match.writes_allowed,
      },
    };
  }

  return {
    workspace_id: null,
    resolved_workspace: { id: null, name: 'Personal', writes_allowed: true },
  };
}
