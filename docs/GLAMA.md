# Glama + Memxus MCP (production)

Glama uses the same OAuth authorization server as Claude (`mcp.memxus.com`). After authorization, Glama receives a Bearer `aimem_*` API key via the standard authorization-code + PKCE flow.

## Supported redirect URIs

| Client | Redirect URI |
|--------|----------------|
| Glama app | `https://glama.ai/api/app/mcp/oauth/callback` |
| Glama inspector | `https://glama.ai/mcp/inspector/oauth/callback` |

Both must appear in Railway `ALLOWED_REDIRECT_URIS` (or be registered via DCR). They are also included in the built-in `KNOWN_MCP_REDIRECT_URIS` allowlist in code, so DCR works even if omitted from env.

## Connect in Glama (Connectors)

1. Add Memxus MCP in Glama with URL `https://mcp.memxus.com/mcp`.
2. Use **OAuth** (not a manual API key in the Glama UI unless offered as fallback).
3. Sign in with Google on **dashboard.memxus.com** when redirected (same account as your Memxus dashboard).
4. Confirm tools: remember, recall, get_context, list_memories, get_memory, list_collections, forget, memory_stats.

## MCP Inspector: Authenticate flow

Use [glama.ai/mcp/inspector](https://glama.ai/mcp/inspector) with URL `https://mcp.memxus.com/mcp`.

1. Select **Memxus** (or add server with that URL).
2. If status shows **OAuth Required**, click **Authenticate**.
3. Use incognito without OAuth redirect extensions.
4. Sign in with Google on **dashboard.memxus.com** (same account as your Memxus dashboard).
5. You should return to `https://glama.ai/mcp/inspector/oauth/callback` and see **Connected**.
6. Smoke-test: tab **Tools** → run `memory_stats` or `list_collections`.

### Railway log: `GET /oauth/authorize` → 302

HTTP **302** on `/oauth/authorize` is **success**, not an error. Memxus validated PKCE and `redirect_uri`, then redirects the browser to the dashboard for Google sign-in. If Inspector still shows OAuth Required after 302, the flow was started but not completed (login or token exchange pending).

### Listing Unhealthy vs Your Connectors Healthy

| UI location | Meaning |
|-------------|---------|
| Public listing **Unhealthy** | Glama automated probe without OAuth credentials; may be stale |
| **Your Connectors → Healthy** | Your personal OAuth connection works |

If your connector is **Healthy** and Inspector tools respond, ignore the public listing badge until Glama re-probes.

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

curl -s -X POST https://mcp.memxus.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["https://glama.ai/mcp/inspector/oauth/callback"],"client_name":"glama-inspector-smoke","token_endpoint_auth_method":"none"}'
# Expect 201
```

## MCP Inspector tabs

| Tab | Supported | Notes |
|-----|-----------|-------|
| Tools | Yes | 8 tools; use `memory_stats` or `list_collections` to smoke-test |
| Resources | Yes | `memory://recent` |
| Resource Templates | Yes (empty) | Returns `[]`; Memxus has no template resources |
| Prompts | Yes (empty) | Returns `[]`; Memxus has no MCP prompts |
| Tasks | No | Not implemented |

## Railway logs: `GET /mcp` → 409

HTTP **409 Conflict** on `GET /mcp` is expected when a proxy opens a second SSE stream for the same `mcp-session-id`. Memxus follows the Streamable HTTP spec (one SSE stream per session). This does **not** indicate OAuth failure if `tools/list` already works.

Keep **one Railway replica** and `MCP_STATELESS=false` (or unset) for Glama, Claude, and Smithery.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Inspector **OAuth Required** after 302 in logs | OAuth started but not finished | Click Authenticate again; complete Google login on dashboard |
| `POST /oauth/token` **redirect_uri mismatch** | Token sent loopback; authorize used glama.ai callback | Redeploy `redirect-allowlist.ts` Glama cross-match; retry Authenticate |
| `invalid_redirect_uri` with `redirect_uri=glama.ai/.../inspector/...` | Client DCR registered only app callback (Connectors vs Inspector) | Redeploy Glama cross-match fix; or disconnect/reconnect OAuth in Glama |
| `invalid_redirect_uri` with `127.0.0.1` | OAuth redirect extension | Incognito without redirect extensions; use official Glama callback |
| OAuth succeeds but no tools | Stale session / wrong user | Same Google account as dashboard; reconnect MCP |
| `invalid_target` on token | Wrong `resource` parameter | Client must send `https://mcp.memxus.com/mcp` or omit `resource` |
| `-32601 Method not found` on Resource Templates | Old deploy without empty handlers | Redeploy current RemoteMCP-AIMemory |
| Connection Test fails but Inspector tools work | Glama proxy SSE 409 noise | Ignore if `tools/list` and tool calls succeed |

## Regression: Claude and ChatGPT

- **Claude** connectors: unchanged (`https://claude.ai/api/mcp/auth_callback` or `.com` variant).
- **ChatGPT public OAuth** (`memxus-chatgpt`): separate client; PKCE bypass + `client_secret` — not affected by Glama redirect helpers.
- **ChatGPT Custom GPT (private)**: REST `api.memxus.com` + API key — unrelated to RemoteMCP OAuth.

See also [REVIEWER.md](../REVIEWER.md).
