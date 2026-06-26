# MCP Session Resilience — Implementation Plan

## Problem

Stateful MCP sessions live in process memory (`Map`). After Railway deploy, idle TTL, or restart, clients keep a stale `mcp-session-id`. `POST /mcp` with `tools/call` returns **400** even though OAuth bearer is still valid.

Plan changes and DB updates do **not** require reconnect; session loss does.

## Recommended approach (this stage)

**Graceful degradation — stateless fallback for tool execution**, not Redis session persistence.

| Layer | Behavior |
|-------|----------|
| `initialize`, SSE (`GET /mcp`), `DELETE /mcp` | Stateful (unchanged) |
| `tools/call` (+ list methods) with stale/missing session | Stateless one-shot via existing `handleStatelessPost` |
| Auth, plan limits, rate limits | Unchanged (per request) |

## Why not Redis persistence

`Session` holds live `StreamableHTTPServerTransport`, SSE state, and connected MCP `Server` — not serializable. Redis only makes sense with multi-replica + sticky routing or a full transport refactor. Out of scope for current scale.

## Implementation scope

### 1. `transport.ts`

- Add `STATELESS_POST_FALLBACK_METHODS`: `tools/call`, `tools/list`, `resources/list`, `resources/templates/list`, `prompts/list`.
- In `handleStatefulPost`, when session is missing and request is not `initialize`:
  - If method is in fallback set → log `mcp_session_miss` with `stateless_fallback` → `handleStatelessPost`.
  - Else → keep existing 400.

### 2. `public-discovery.ts`

- On `initialize` with valid Bearer, always `next()` (even if client sends stale `mcp-session-id`) so a real session is created instead of a stub response.

### 3. Tests (`transport.test.ts`, `public-discovery.test.ts`)

- `tools/call` without session does not return "no valid session".
- `tools/list` without session still 400 (discovery handles no-session-id before transport; transport gate unchanged for unknown methods).
- `initialize` + Bearer + stale session id passes through discovery.
- GET/DELETE without session still 400.

### 4. Docs

- Update `REVIEWER.md` / `GLAMA_TROUBLESHOOTING.md` with fallback behavior post-deploy.

### 5. Ops (no code)

- `MCP_SESSION_TTL_MS=86400000` on Railway.
- Single replica until multi-instance needs shared SSE.

## Out of scope

- Redis / external session store
- `MCP_STATELESS=true` globally (breaks Claude web SSE)
- Changing OAuth or plan cache

## Success criteria

- After deploy, `tools/call` works without user reconnecting MCP in Claude.
- ESLint + `npm test` pass.
- No regression on session creation, SSE, or 401 auth.

## Rollback

Remove fallback branch in `handleStatefulPost`; revert discovery `initialize` guard. No DB or env migration required.
