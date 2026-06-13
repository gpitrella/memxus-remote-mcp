# Glama MCP troubleshooting runbook

Short operational guide for Memxus on [Glama Inspector](https://glama.ai/mcp/inspector) and Glama Connectors. Full setup: [GLAMA.md](./GLAMA.md).

## Quick triage

| Log / symptom | Layer | Action |
|---------------|-------|--------|
| `GET /oauth/authorize` 302 only | OAuth started, not finished | Complete dashboard Google login; confirm `POST /oauth/token` 200 |
| `[oauth/token]` with `customerId` + `userId` | OAuth OK | Check MCP session layer next |
| `mcp_session_miss` | MCP session | Reconnect MCP or send `initialize` again |
| `mcp_sse_conflict` or `GET /mcp` 409 | SSE proxy noise | OK if `tools/list` works; ignore failed Connection Test |
| `no valid session` on POST | Stale session / redeploy | Re-initialize; toggle MCP off/on in client |
| `GET /mcp` 400 after inactivity (Cursor) | Expired MCP session (idle > TTL) | Toggle Memxus MCP off/on in Cursor Settings |
| `mcp_session_expired` in logs | Server pruned idle session | Client must re-initialize |
| Inspector "OAuth Required" after success popup | Token not persisted | Incognito, no OAuth redirect extensions; check Railway `POST /oauth/token` |

## Railway env (production)

- **Replicas:** 1 (sessions are in-memory until shared storage exists)
- **`MCP_STATELESS`:** unset or `false` (default)
- **`MCP_SESSION_TTL_MS`:** `86400000` (24h recommended; default in code is 1h if unset)
- **`MCP_PUBLIC_URL`:** `https://mcp.memxus.com` (no trailing slash)
- **`DASHBOARD_URL`:** `https://dashboard.memxus.com`
- **`ALLOWED_REDIRECT_URIS`:** include both Glama callbacks:
  - `https://glama.ai/api/app/mcp/oauth/callback`
  - `https://glama.ai/mcp/inspector/oauth/callback`
- **`CORS_ORIGINS`** and **`MCP_ORIGIN_ALLOWLIST`:** include `https://glama.ai`

## OAuth flow checklist

1. Inspector → **Authenticate** → `GET /oauth/authorize` returns **302** to dashboard
2. Same Google account as Memxus dashboard → redirect to `glama.ai/.../oauth/callback?code=...`
3. Railway → `POST /oauth/token` **200** and log `[oauth/token] { customerId, userId }`
4. Dashboard → API Keys → new **Glama (...)** key active

Common failures:

- **`redirect_uri mismatch`** — redeploy with Glama cross-match in `redirect-allowlist.ts`; retry Authenticate
- **`invalid_redirect_uri` with `127.0.0.1`** — disable browser OAuth redirect extensions; use official Glama callback
- **`invalid_target`** — client must send `resource=https://mcp.memxus.com/mcp` or omit `resource`

## MCP session checklist

1. `POST /mcp` with `initialize` → response includes `mcp-session-id`
2. `POST /mcp` with `tools/list` + session header → **200**
3. `GET /mcp` SSE → **200** (second concurrent GET may return **409** — expected)
4. Tool call e.g. `memory_stats` → success

After Railway redeploy or idle timeout (default 1h; set `MCP_SESSION_TTL_MS=86400000` for 24h): clients must **re-initialize** (toggle MCP connection).

### Cursor (SSE / "Not connected")

After a long idle period or Railway deploy, Cursor may log:

- `Failed to open SSE stream: Bad Request`
- `no valid session and not an initialize request`
- `Maximum reconnection attempts (2) exceeded`

**Fix:** Cursor Settings → MCP → toggle Memxus off, wait 2–3s, toggle on. OAuth stays valid; only the MCP transport session expired.

## Structured logs to search

| Event | Meaning |
|-------|---------|
| `mcp_session_created` | New stateful session registered |
| `mcp_session_miss` | Request without valid session |
| `mcp_session_expired` | Idle session pruned (check `idleMinutes` vs TTL) |
| `mcp_sse_conflict` | Second SSE stream blocked (409) |
| `[oauth/token]` request fields | Token attempt (grant_type, client_id) |
| `[oauth/token]` customerId/userId | Successful token exchange |

## Smoke commands

```bash
# DCR (Inspector callback)
curl -s -X POST https://mcp.memxus.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["https://glama.ai/mcp/inspector/oauth/callback"],"client_name":"glama-smoke","token_endpoint_auth_method":"none"}'

# Protected resource metadata
curl -s https://mcp.memxus.com/.well-known/oauth-protected-resource/mcp

# MCP smoke (requires API key)
MEMXUS_API_KEY=aimem_... npm run test:smoke
```

## When to escalate

- OAuth completes (`[oauth/token]` success) but Inspector never shows Connected → Glama proxy / token persistence
- `tools/list` fails after fresh Authenticate → Memxus MCP transport (check `mcp_session_miss` logs)
- Works in Inspector but not Connectors → compare redirect URIs and client DCR registration

See also [REVIEWER.md](../REVIEWER.md) and [GLAMA.md](./GLAMA.md).
