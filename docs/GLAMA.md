# Glama + Memxus MCP (production)

Glama uses the same OAuth authorization server as Claude (`mcp.memxus.com`). After authorization, Glama receives a Bearer `aimem_*` API key via the standard authorization-code + PKCE flow.

## Supported redirect URIs

| Client | Redirect URI |
|--------|----------------|
| Glama app | `https://glama.ai/api/app/mcp/oauth/callback` |
| Glama inspector | `https://glama.ai/mcp/inspector/oauth/callback` |

Both must appear in Railway `ALLOWED_REDIRECT_URIS` (or be registered via DCR).

## Connect in Glama

1. Add Memxus MCP in Glama with URL `https://mcp.memxus.com/mcp`.
2. Use **OAuth** (not a manual API key in the Glama UI unless offered as fallback).
3. Sign in with Google on **dashboard.memxus.com** when redirected (same account as your Memxus dashboard).
4. Confirm tools: remember, recall, get_context, list_memories, get_memory, list_collections, forget, memory_stats.

## Do not use localhost extension redirects

Some browser extensions rewrite OAuth callbacks to `http://127.0.0.1:<port>/callback`. That URI is **not** on the Memxus allowlist and will fail with `invalid_redirect_uri`.

**Fix:** Disable the extension for Glama OAuth, or use Glama’s official callback (`https://glama.ai/api/app/mcp/oauth/callback`) only.

## Smoke checks (after deploy)

```bash
curl -s https://mcp.memxus.com/.well-known/oauth-authorization-server/mcp
curl -s https://mcp.memxus.com/.well-known/oauth-protected-resource/mcp

curl -s -X POST https://mcp.memxus.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["https://glama.ai/api/app/mcp/oauth/callback"],"client_name":"glama-smoke","token_endpoint_auth_method":"none"}'
# Expect 201
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `invalid_redirect_uri` | Extension or wrong callback | Official Glama callback; incognito without redirect extensions |
| OAuth succeeds but no tools | Stale session / wrong user | Same Google account as dashboard; reconnect MCP |
| `invalid_target` on token | Wrong `resource` parameter | Client must send `https://mcp.memxus.com/mcp` or omit `resource` |

## Regression: Claude and ChatGPT

- **Claude** connectors: unchanged (`https://claude.ai/api/mcp/auth_callback` or `.com` variant).
- **ChatGPT public OAuth** (`memxus-chatgpt`): separate client; PKCE bypass + `client_secret` — not affected by Glama redirect helpers.
- **ChatGPT Custom GPT (private)**: REST `api.memxus.com` + API key — unrelated to RemoteMCP OAuth.

See also [REVIEWER.md](../REVIEWER.md).
