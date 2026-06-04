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

## Cursor / VS Code (Bearer token — fallback)

1. Settings → MCP → Add server.
2. URL: `https://mcp.memxus.com/mcp`
3. Header: `Authorization: Bearer aimem_YOUR_KEY`
4. Expected: same **8 tools** as above.

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

**Fix:** Toggle the Memxus MCP server off and on in Cursor Settings, or restart Cursor. Sessions are in-memory on the server (use one Railway replica until shared session storage exists).

Maintainers: `npm run test:smoke` in RemoteMCP-AIMemory (requires `MEMXUS_API_KEY`).

**Production deploy:** keep **one Railway replica** for `mcp.memxus.com` until shared MCP session storage exists. Set `ALLOWED_REDIRECT_URIS` (required when `NODE_ENV=production`). Set **`MCP_STATELESS=true`** so `remember`/`recall` survive redeploys without stale `mcp-session-id`.

### Claude troubleshooting (DCR / reconnect)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Couldn't register with sign-in service` | DCR rejected loopback `redirect_uris` from Anthropic | Deploy current RemoteMCP (filters URIs; allows `127.0.0.1`/`localhost` `/callback`) |
| `remember` fails after deploy while connector shows connected | Stale MCP session | `MCP_STATELESS=true` on Railway; reconnect if needed |

DCR smoke (Claude-like payload):

```bash
curl -s -w "\n%{http_code}\n" -X POST https://mcp.memxus.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["https://claude.ai/api/mcp/auth_callback","http://127.0.0.1:54321/callback"],"grant_types":["authorization_code"],"response_types":["code"],"token_endpoint_auth_method":"none"}'
# Expect 201
```

## ChatGPT Custom GPT (Actions — not MCP)

Uses REST at `https://api.memxus.com/api/v1` with OpenAPI from https://www.memxus.com/docs/custom-gpt/schema.

| Visibility | Auth | Expected |
|------------|------|----------|
| Private | API Key / Bearer (`aimem_*`) | Same user’s memories only |
| Public | OAuth → `mcp.memxus.com/oauth/authorize` + `token` (client `memxus-chatgpt`) | Each end user signs in with Google; separate memories |

After OAuth connect in ChatGPT preview, call `createMemory` / `searchMemories` and confirm dashboard shows a **ChatGPT (memxus-chatgpt)** API key for that Google user.

## Tool smoke tests

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
  -H "Origin: https://evil.example" -H "Content-Type: application/json" -d "{}"
# Expect 403 {"error":"origin_not_allowed"}
```

Both metadata endpoints should return JSON with authorization/token endpoints under `https://mcp.memxus.com`.

**Origin validation:** `POST/GET/DELETE /mcp` with a present but non-allowlisted `Origin` returns 403. Requests **without** `Origin` (Smithery, Cursor, smoke scripts) are unchanged. Optional Railway env: `MCP_ORIGIN_ALLOWLIST` (comma-separated); when empty, built-in Anthropic defaults apply.

## Glama connector claim

Maintainers verify ownership via `/.well-known/glama.json` on the MCP host. Set `GLAMA_MAINTAINER_EMAIL` on Railway to the email on your Glama account (default: `gabriel98_@hotmail.com`).

```bash
curl -s https://mcp.memxus.com/.well-known/glama.json
```

Expected: JSON with `$schema` `https://glama.ai/mcp/schemas/connector.json` and `maintainers[].email`. Then use **Claim ownership** on the Memxus listing at [glama.ai](https://glama.ai) (detection may take a few minutes).

## Support

- Docs: https://www.memxus.com/docs/troubleshooting
- Contact: support email listed on https://www.memxus.com/privacy
