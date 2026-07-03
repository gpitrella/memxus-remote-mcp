# Memxus MCP — Reviewer guide

Use this document when testing Memxus for marketplace review (Claude Connectors, ChatGPT Apps, Cursor, Smithery).

## Production URLs

| Surface | URL |
|---------|-----|
| Landing | https://www.memxus.com/ |
| Install hub | https://www.memxus.com/install |
| Dashboard | https://dashboard.memxus.com/ |
| MCP endpoint | https://mcp.memxus.com/mcp |
| Privacy policy | https://www.memxus.com/privacy |
| MCP docs | https://www.memxus.com/docs/mcp |
| Usage examples | https://www.memxus.com/docs/mcp/examples |

## Test account setup

1. Open https://dashboard.memxus.com/login and sign in with Google.
2. Go to **API Keys** → delete the auto-created "Default Key" if present (plaintext is not shown).
3. Click **Create new key** and copy the `aimem_*` value (shown once).
4. Optional: run the seed script (maintainers only) to load demo memories tagged `reviewer-demo`.

**Credentials for review:** Share test account email + API key privately in the submission form — do not commit secrets to git.

## Claude (OAuth — recommended)

1. Open https://www.memxus.com/install
2. Click **Connect with One Click** (Claude tab).
3. Authorize with Google when redirected to the dashboard.
4. In Claude, ask: *"What do you remember about my reviewer demo preferences?"*
5. Expected: Claude calls `recall` or `get_context` and returns seeded content.

## Cursor (Smithery — recommended for maintainers)

One **global** install covers API-IAMemory, Dash-AIMemory, Landing-IAMemory, and RemoteMCP-AIMemory (no per-repo `mcp.json`).

Full guide: [docs/SMITHERY_CURSOR.md](docs/SMITHERY_CURSOR.md)

```bash
npx -y smithery mcp add memxus/memxus --client cursor --force
```

1. Complete OAuth in a **clean browser** (incognito): [smithery.run/memxus/memxus/setup](https://smithery.run/memxus/memxus/setup)
2. Use the **same Google account** as [dashboard.memxus.com](https://dashboard.memxus.com).
3. Restart Cursor.
4. Keep a **single** `memxus` entry in `~/.cursor/mcp.json` (Smithery URL only). Remove `memxus-local` stdio and manual `https://mcp.memxus.com/mcp` + Bearer duplicates.
5. Expected: **8 tools** — remember, recall, get_context, list_memories, get_memory, list_collections, forget, memory_stats.

Verify:

```bash
npx -y smithery mcp list
npx -y smithery tool list memxus
```

Production prerequisites: `MCP_PUBLIC_URL=https://mcp.memxus.com`, `DASHBOARD_URL=https://dashboard.memxus.com`, and `https://smithery.run/oauth/callback` in `ALLOWED_REDIRECT_URIS`. DCR smoke:

```bash
curl -s -X POST https://mcp.memxus.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["https://smithery.run/oauth/callback"],"client_name":"smithery-smoke","token_endpoint_auth_method":"none"}'
```

### Smithery troubleshooting

| Symptom | Fix |
|---------|-----|
| `Needs authentication` / `auth_required` | Finish setup URL; Connect in Cursor; restart Cursor |
| `Connection failed` / upstream auth | Incognito without OAuth redirect extensions; retry setup |
| DCR 201 but setup still fails | Escalate to Smithery — see [docs/SMITHERY_CURSOR.md](docs/SMITHERY_CURSOR.md) § Smithery support escalation |

Listing: [smithery.ai/servers/memxus/memxus](https://smithery.ai/servers/memxus/memxus)

## Glama (OAuth)

Full guide: [docs/GLAMA.md](docs/GLAMA.md)

1. Add MCP URL `https://mcp.memxus.com/mcp` in Glama.
2. OAuth with Google via dashboard redirect (same account as dashboard.memxus.com).
3. Do **not** use browser extensions that rewrite OAuth to `http://127.0.0.1:.../callback`.
4. Expected: **8 tools**; API key name **Glama (...)** in dashboard after connect.

Smoke:

```bash
curl -s https://mcp.memxus.com/.well-known/oauth-authorization-server/mcp
```

## VS Code (OAuth — recommended from MCP gallery)

1. Open **Chat: Open Customizations** → **MCP Servers** (or Extensions → search `@mcp memxus`).
2. Click **Install** on Memxus → confirm trust.
3. Complete OAuth (Google sign-in via dashboard when prompted).
4. Expected: **8 tools** — remember, recall, get_context, list_memories, get_memory, list_collections, forget, memory_stats.

DCR smoke (after deploy with VS Code redirect allowlist):

```bash
curl -s -X POST https://mcp.memxus.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["https://vscode.dev/redirect","http://127.0.0.1:33418"],"client_name":"vscode-smoke","token_endpoint_auth_method":"none"}'
```

Registry listing: `com.memxus/memxus` on [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io).

## Antigravity IDE (OAuth — recommended)

1. Add Memxus to `~/.gemini/antigravity/mcp_config.json`:

```json
{
  "mcpServers": {
    "memxus": {
      "serverUrl": "https://mcp.memxus.com/mcp"
    }
  }
}
```

2. Antigravity IDE → Settings → Customizations → Installed MCP Servers → **Authenticate** on memxus.
3. Complete Google sign-in via dashboard when the browser opens → Approve on consent screen.
4. When redirected to `antigravity.google/oauth-callback`, **copy the authorization code** and paste it into the Antigravity dialog.
5. Expected: **9 core tools**; API key name **Antigravity (...)** in dashboard after connect.

Troubleshooting: [docs/ANTIGRAVITY_TROUBLESHOOTING.md](docs/ANTIGRAVITY_TROUBLESHOOTING.md).

DCR smoke:

```bash
curl -s -X POST https://mcp.memxus.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["https://antigravity.google/oauth-callback"],"client_name":"antigravity-smoke","token_endpoint_auth_method":"none"}'
```

Bearer fallback: dashboard API key in `mcp_config.json` with `Authorization: Bearer aimem_...` header (see install page).

## Gemini CLI (OAuth — recommended)

1. Install [Gemini CLI](https://geminicli.com/docs/).
2. Add Memxus to `~/.gemini/settings.json` (or project `.gemini/settings.json`):

```json
{
  "mcpServers": {
    "memxus": {
      "httpUrl": "https://mcp.memxus.com/mcp"
    }
  }
}
```

3. Run `gemini` and authenticate: `/mcp auth memxus` (or connect when prompted after 401).
4. Complete Google sign-in via dashboard when the browser opens.
5. Expected: **8 tools**; API key name **Gemini CLI (...)** in dashboard after connect.

Bearer fallback:

```bash
gemini mcp add --transport http memxus https://mcp.memxus.com/mcp \
  -H "Authorization: Bearer aimem_YOUR_KEY"
```

DCR smoke (after deploy with Gemini CLI redirect allowlist):

```bash
curl -s -X POST https://mcp.memxus.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["http://localhost:7777/oauth/callback"],"client_name":"gemini-cli-smoke","token_endpoint_auth_method":"none"}'
```

**Note:** Consumer Gemini at gemini.google.com does not support custom MCP. Use the [Memxus Chrome extension](https://www.memxus.com/extension) for browser capture instead.

## Cursor / VS Code (Bearer token — fallback)

1. Settings → MCP → Add server.
2. URL: `https://mcp.memxus.com/mcp`
3. Header: `Authorization: Bearer aimem_YOUR_KEY`
4. Expected: same **8 tools** as above.

Example JSON (VS Code):

```json
{
  "servers": {
    "memxus": {
      "type": "http",
      "url": "https://mcp.memxus.com/mcp",
      "headers": {
        "Authorization": "Bearer aimem_YOUR_KEY"
      }
    }
  }
}
```

Example JSON (Cursor):

```json
{
  "mcpServers": {
    "memxus": {
      "url": "https://mcp.memxus.com/mcp",
      "headers": {
        "Authorization": "Bearer aimem_YOUR_KEY"
      }
    }
  }
}
```

### Cursor troubleshooting (SSE / "Not connected")

After a Railway deploy or long idle period, Cursor may log:

- `Failed to open SSE stream: Bad Request`
- `no valid session and not an initialize request`

**Fix:** Toggle the Memxus MCP server off and on in Cursor Settings, or restart Cursor. Sessions are in-memory on the server (use one Railway replica until shared session storage exists). Set `MCP_SESSION_TTL_MS=86400000` (24h) on Railway to reduce idle disconnects.

Maintainers: `npm run test:smoke` in RemoteMCP-AIMemory (requires `MEMXUS_API_KEY`).

**Production deploy:** keep **one Railway replica** for `mcp.memxus.com` until shared MCP session storage exists. Required Railway env when `NODE_ENV=production`:

| Variable | Purpose |
|----------|---------|
| `ALLOWED_REDIRECT_URIS` | OAuth redirect allowlist (DCR + authorize) |
| `CORS_ORIGINS` | Browser CORS for `/oauth/*` and `/mcp` (include `https://glama.ai`) |
| `MCP_ORIGIN_ALLOWLIST` | Origin gate for `/mcp` only (include `https://glama.ai`) |
| `MCP_SESSION_TTL_MS` | Recommended `86400000` (24h idle before session prune) |

Set **`MCP_STATELESS=false`** (or unset) — Claude web, Smithery, and Glama require **stateful** MCP (initialize → `mcp-session-id` → tools/list + GET SSE).

### Claude troubleshooting (DCR / reconnect / tools)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Connected but tools fail to reload | `MCP_STATELESS=true` on Railway (wrapper blocked multi-request flow) | Set **`MCP_STATELESS=false`**, redeploy, disconnect/reconnect Memxus in Claude |
| `Couldn't register with sign-in service` | DCR rejected `client_secret_post` from Anthropic broker (metadata advertised ChatGPT auth) | Deploy current RemoteMCP: DCR always persists `none`; metadata lists only `none` |
| `remember` fails after deploy while connector shows connected | Stale MCP session (in-memory, lost on redeploy) | **Usually self-heals:** `tools/call` uses stateless fallback when session is gone. If tools still fail, toggle Memxus off/on in Claude. |

DCR smoke (Claude-like payload):

```bash
curl -s -w "\n%{http_code}\n" -X POST https://mcp.memxus.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["https://claude.ai/api/mcp/auth_callback","http://127.0.0.1:54321/callback"],"grant_types":["authorization_code"],"response_types":["code"],"token_endpoint_auth_method":"none"}'
# Expect 201

curl -s -w "\n%{http_code}\n" -X POST https://mcp.memxus.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"claudeai","grant_types":["authorization_code","refresh_token"],"response_types":["code"],"token_endpoint_auth_method":"client_secret_post","scope":"claudeai","redirect_uris":["https://claude.ai/api/mcp/auth_callback"]}'
# Expect 201 with token_endpoint_auth_method "none" in response
```

## ChatGPT Custom GPT (Actions — not MCP)

Uses REST at `https://api.memxus.com/api/v1` with OpenAPI from https://www.memxus.com/docs/custom-gpt/schema.

| Visibility | Auth | Expected |
|------------|------|----------|
| Private | API Key / Bearer (`aimem_*`) | Same user’s memories only |
| Public | OAuth → `mcp.memxus.com/oauth/authorize` + `token` (client `memxus-chatgpt`) | Each end user signs in with Google; separate memories |

After OAuth connect in ChatGPT preview, call `createMemory` / `searchMemories` and confirm dashboard shows a **ChatGPT (memxus-chatgpt)** API key for that Google user.

## Tool smoke tests

Automated production smoke: `MEMXUS_API_KEY=aimem_... npm run test:smoke` (see [`scripts/smoke-mcp.mjs`](scripts/smoke-mcp.mjs)).

**Tool manifest tiers** (v1.1.0):

| Tier | Count | Tools |
|------|-------|-------|
| Core | 9 | remember, recall, get_context, list_memories, get_memory, list_collections, forget, memory_stats, update |
| Full | 15 | core + connect_source, list_syncable_items, set_sync_selection, check_connect_status, get_context_with_skills, suggest_skills |

Full manifest requires `ENABLE_INAPP_CONNECT=true`, `ENABLE_SKILL_ROUTING=true` on RemoteMCP **and** v2 prefs enabled on the smoke user's `mcp_preferences` in dashboard.

**`SMOKE_MANIFEST` env** (CI uses `full`):

| Mode | Behavior |
|------|----------|
| `auto` (default) | Accept valid 9-tool core or 15-tool full manifest |
| `full` | Require all 15 tools (production v1.1.0) |
| `core` | Require exactly 9 tools (legacy/staging) |

| Tool | Test prompt / args | Expected |
|------|-------------------|----------|
| `remember` | content: "Reviewer test: prefers TypeScript" | Success with memory ID |
| `recall` | query: "TypeScript reviewer" | Returns saved content |
| `get_context` | topic: "Next.js Supabase" (no collection) | Context if memory exists cross-collection |
| `get_context` | topic: "stack", collection: `project:ai-memory` | Formatted context block |
| `list_memories` | (empty) or limit: 5 | List of recent memories |
| `list_memories` | full_content: true | Full text, not truncated |
| `get_memory` | memory_id: UUID from list | Full memory body |
| `list_collections` | (empty) | Collection slugs |
| `memory_stats` | (empty) | Counts by type/collection (stable on repeat) |
| `forget` | memory_id: UUID from list | Deletion confirmed |

## OAuth verification

```bash
curl -s https://mcp.memxus.com/.well-known/oauth-authorization-server
curl -s https://mcp.memxus.com/.well-known/oauth-authorization-server/mcp
curl -s https://mcp.memxus.com/.well-known/oauth-protected-resource/mcp
# resource must be https://mcp.memxus.com/mcp

curl -s -D - -o /dev/null -X POST https://mcp.memxus.com/mcp -H "Content-Type: application/json" -d "{}"
# Expect WWW-Authenticate: Bearer resource_metadata=".../oauth-protected-resource/mcp"

curl -s https://mcp.memxus.com/.well-known/oauth-protected-resource | jq -r .resource
# must be https://mcp.memxus.com/mcp

curl -s -D - -o /dev/null -X POST https://mcp.memxus.com/mcp \
  -H "Origin: https://claude.ai" -H "Content-Type: application/json" -d "{}"
# Expect 401 (not 403 origin_not_allowed) + WWW-Authenticate

curl -s -D - -o /dev/null -X POST https://mcp.memxus.com/mcp \
  -H "Origin: https://glama.ai" -H "Content-Type: application/json" -d "{}"
# Expect 401 (not 403 origin_not_allowed) + WWW-Authenticate

curl -s -D - -o /dev/null -X POST https://mcp.memxus.com/mcp \
  -H "Origin: https://evil.example" -H "Content-Type: application/json" -d "{}"
# Expect 403 {"error":"origin_not_allowed"}

curl -s https://mcp.memxus.com/.well-known/oauth-authorization-server/mcp | grep refresh_token
# Expect refresh_token in grant_types_supported
```

Both metadata endpoints should return JSON with authorization/token endpoints under `https://mcp.memxus.com`.

**Origin validation:** `POST/GET/DELETE /mcp` with a present but non-allowlisted `Origin` returns 403. Requests **without** `Origin` (Smithery, Cursor, smoke scripts) are unchanged. **`MCP_ORIGIN_ALLOWLIST`** and **`CORS_ORIGINS`** are required in production (see table above).

## Glama connector claim

Maintainers verify ownership via `/.well-known/glama.json` on the MCP host. Set `GLAMA_MAINTAINER_EMAIL` on Railway to the email on your Glama account (default: `gabriel98_@hotmail.com`).

```bash
curl -s https://mcp.memxus.com/.well-known/glama.json
```

Expected: JSON with `$schema` `https://glama.ai/mcp/schemas/connector.json` and `maintainers[].email`. Then use **Claim ownership** on the Memxus listing at [glama.ai](https://glama.ai) (detection may take a few minutes).

## Support

- Docs: https://www.memxus.com/docs/troubleshooting
- Contact: support email listed on https://www.memxus.com/privacy
