# AI Memory Remote MCP Server

OAuth 2.1 + PKCE remote MCP server for Claude Connectors. Streamable HTTP transport; proxies memory tools to Supabase.

## Environment

Copy `.env.example` to `.env` and set:

- `MCP_PUBLIC_URL` — public URL of this server (no trailing slash)
- `DASHBOARD_URL` — Dash-AIMemory URL for login redirect
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `OAUTH_CLIENT_ID`, `ALLOWED_REDIRECT_URIS`, `CORS_ORIGINS`
- Optional: `OPENAI_API_KEY` for vector search

Run `supabase/migration.sql` after the dashboard migration.

## Scripts

```bash
npm install
npm run dev      # tsx watch
npm run build    # tsc → dist/
npm start        # node dist/index.js
npm run lint
npm run typecheck
```

## OAuth flow

1. Client reads `/.well-known/oauth-authorization-server`
2. `GET /oauth/authorize` → pending ticket → redirect to dashboard `/api/oauth/mcp/authorize`
3. User signs in (Google); dashboard sets `user_id` + `code_hash` on ticket
4. `POST /oauth/token` with PKCE → issues `aimem_*` bearer token (stored in `api_keys`)
5. `POST /mcp` with `Authorization: Bearer aimem_...`

`/oauth/register` returns 501 (pre-registered client only).

## Deferred

npm publish, MCP Registry, Connectors Directory listing, refresh tokens, DCR, multi-client OAuth.
