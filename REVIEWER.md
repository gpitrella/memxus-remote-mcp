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

## Cursor / VS Code (Bearer token)

1. Settings → MCP → Add server.
2. URL: `https://mcp.memxus.com/mcp`
3. Header: `Authorization: Bearer aimem_YOUR_KEY`
4. Expected: **8 tools** — remember, recall, get_context, list_memories, get_memory, list_collections, forget, memory_stats.

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

**Production deploy:** keep **one Railway replica** for `mcp.memxus.com` until shared MCP session storage exists. Set `ALLOWED_REDIRECT_URIS` (required when `NODE_ENV=production`).

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
curl -s https://mcp.memxus.com/.well-known/oauth-protected-resource
```

Both should return JSON with authorization/token endpoints under `https://mcp.memxus.com`.

## Support

- Docs: https://www.memxus.com/docs/troubleshooting
- Contact: support email listed on https://www.memxus.com/privacy
