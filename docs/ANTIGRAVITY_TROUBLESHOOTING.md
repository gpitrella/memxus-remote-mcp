# Antigravity IDE MCP troubleshooting

Operational guide for Memxus on [Google Antigravity IDE](https://antigravity.google) (Settings → Customizations → Installed MCP Servers). Install copy: [memxus.com/install#antigravity](https://www.memxus.com/install#antigravity).

## Quick triage

| Log / symptom | Layer | Action |
|---------------|-------|--------|
| `GET /oauth/authorize` 302 only | OAuth started, not finished | Complete dashboard Google login; paste code from `antigravity.google/oauth-callback` |
| `initialize: Unauthorized` | Bearer invalid / OAuth incomplete | Paste auth code in Antigravity dialog; confirm `POST /oauth/token` 200 |
| `[oauth/token]` with `customerId` + `userId` | OAuth OK | Toggle MCP off/on in Customizations |
| DCR `redirect_uri not allowed` | Allowlist | Deploy with `ANTIGRAVITY_REDIRECT_URI` in `KNOWN_MCP_REDIRECT_URIS` |
| `POST /oauth/token` 400 `invalid_grant` | Expired or reused code | Restart Authenticate (codes expire in 10 min) |
| No paste dialog in IDE | Client UX | Bearer fallback via dashboard API key in `mcp_config.json` |

## OAuth flow checklist

1. Antigravity IDE → **Authenticate** on memxus → `GET /oauth/authorize` returns **302** to dashboard
2. Same Google account as dashboard.memxus.com → consent → redirect to `antigravity.google/oauth-callback?code=...`
3. **Copy the `code`** from the URL or page → paste into Antigravity input dialog → Submit
4. Railway → `POST /oauth/token` **200** and log `[oauth/token] { customerId, userId }`
5. Dashboard → API Keys → new **Antigravity (...)** key active
6. MCP tools load (9 core tools)

## Technical notes

- Antigravity registers `redirect_uri=https://antigravity.google/oauth-callback` via DCR (RFC 7591).
- Memxus allows this URI via built-in `KNOWN_MCP_REDIRECT_URIS` (no Railway env required when codified).
- `initialize` without Bearer returns 200 (public discovery). **Unauthorized** means Antigravity sent an invalid or empty Bearer header before token exchange completed.
- Token exchange runs from the Antigravity desktop app — CORS on `antigravity.google` is not required.

## Smoke commands

```bash
# DCR (Antigravity callback)
curl -s -w "\n%{http_code}\n" -X POST https://mcp.memxus.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["https://antigravity.google/oauth-callback"],"client_name":"antigravity-smoke","token_endpoint_auth_method":"none"}'

# Protected resource metadata
curl -s https://mcp.memxus.com/.well-known/oauth-protected-resource/mcp
```

## Bearer fallback (IDE)

Add to `~/.gemini/antigravity/mcp_config.json` with a dashboard API key:

```json
{
  "mcpServers": {
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

See also [REVIEWER.md](../REVIEWER.md) and [GLAMA_TROUBLESHOOTING.md](./GLAMA_TROUBLESHOOTING.md).
