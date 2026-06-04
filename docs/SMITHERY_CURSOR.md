# Smithery + Cursor (Memxus production)

Global MCP for maintainers working across API-IAMemory, Dash-AIMemory, Landing-IAMemory, and RemoteMCP-AIMemory.

## Install (one time)

```bash
npx -y smithery mcp add memxus/memxus --client cursor --force
```

Restart Cursor after install.

## Authenticate

1. Open [smithery.run/memxus/memxus/setup](https://smithery.run/memxus/memxus/setup) in a **clean browser session** (incognito; disable extensions that rewrite OAuth to localhost).
2. Sign in with the same Google account you use on [dashboard.memxus.com](https://dashboard.memxus.com).
3. Complete authorization when redirected to the dashboard.
4. In Cursor: **Settings → Tools & MCP** → `memxus` → **Connect** (should no longer show "Needs authentication").
5. Confirm **8 tools**: remember, recall, get_context, list_memories, get_memory, list_collections, forget, memory_stats.

## Verify from CLI

```bash
npx -y smithery mcp list
# status should not be auth_required after setup

npx -y smithery tool list memxus
npx -y smithery tool call memxus memory_stats '{}'
```

## Server prerequisites (production)

Railway **MCP-AIMemory** service:

| Variable | Expected |
|----------|----------|
| `MCP_PUBLIC_URL` | `https://mcp.memxus.com` (no trailing slash) |
| `DASHBOARD_URL` | `https://dashboard.memxus.com` |
| `ALLOWED_REDIRECT_URIS` | Must include `https://smithery.run/oauth/callback` |

Smoke checks (after deploy):

```bash
curl -s https://mcp.memxus.com/.well-known/oauth-protected-resource/mcp
# resource must be https://mcp.memxus.com/mcp

curl -sI -X POST https://mcp.memxus.com/mcp -H "Content-Type: application/json" -d "{}"
# Expect WWW-Authenticate with resource_metadata=.../oauth-protected-resource/mcp

curl -s https://mcp.memxus.com/.well-known/oauth-authorization-server
curl -s https://mcp.memxus.com/health

curl -s -X POST https://mcp.memxus.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["https://smithery.run/oauth/callback"],"client_name":"smithery-check","token_endpoint_auth_method":"none"}'
# Expect 201 with client_id
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `auth_required` / Needs authentication | OAuth not finished | Complete setup URL; restart Cursor |
| `upstream_auth_failed` on smithery.ai/connect | MCP OAuth discovery mismatch (fixed in RemoteMCP: resource `/mcp`, path well-known, `WWW-Authenticate`) | Redeploy RemoteMCP, then retry setup |
| `Connection failed` on smithery.ai/connect | Extension redirect or stale deploy | Incognito; confirm deploy includes RFC 9728 fix |
| `couldn't authenticate with upstream server` | Token not issued or dashboard login failed | Same Google account as dashboard; user must exist in DB |
| Duplicate MCP entries | Manual Bearer + Smithery | Keep only Smithery `memxus` in `~/.cursor/mcp.json` |
| 8 tools missing after connect | Stale Cursor session | Toggle MCP off/on or restart Cursor |

Do **not** add per-repo `.cursor/mcp.json` with API keys.

## Fallback (contingency only)

Bearer to `https://mcp.memxus.com/mcp` with `aimem_*` from dashboard API keys. See [REVIEWER.md](../REVIEWER.md) § Cursor Bearer fallback.

## Smithery support escalation

If DCR returns **201** for `https://smithery.run/oauth/callback` but setup still fails, contact Smithery support with:

- Setup URL used: `https://smithery.run/memxus/memxus/setup`
- `authId` from failed `smithery.ai/connect?...` URL (no secrets)
- Timestamp (UTC)
- `npx -y smithery mcp list` output (redact tokens)
- Output of `curl -s https://mcp.memxus.com/.well-known/oauth-authorization-server`
- Confirmation: `POST /oauth/register` with smithery callback → 201

Listing: [smithery.ai/servers/memxus/memxus](https://smithery.ai/servers/memxus/memxus)
