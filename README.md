<p align="center">
  <img src="brand/logo.png" alt="AI Memory Logo" width="120" />
</p>

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

## Railway deploy

Guía completa: [STEP_BY_STEP.md §6](STEP_BY_STEP.md#6-deploy-a-railway).

- Variables en Railway → Settings → Variables (no subir `.env`).
- `MCP_PUBLIC_URL` = URL pública del servicio (Networking), sin `/mcp`.
- Health check: `/health` ([`railway.toml`](railway.toml)).
- Node 20 on Railway: Supabase Realtime needs the `ws` package (configured in `src/lib/supabase.ts`). Optional: `RAILPACK_NODE_VERSION=22` for native WebSocket.

```bash
npx skills add railwayapp/railway-skills --skill deploy
npx skills add railwayapp/railway-skills --skill environment
```

## OAuth flow

1. Client reads `/.well-known/oauth-authorization-server`
2. `GET /oauth/authorize` → pending ticket → redirect to dashboard `/api/oauth/mcp/authorize`
3. User signs in (Google); dashboard sets `user_id` + `code_hash` on ticket
4. `POST /oauth/token` with PKCE → issues `aimem_*` bearer token (stored in `api_keys`)
5. `POST /mcp` with `Authorization: Bearer aimem_...`

`POST /oauth/register` implements Dynamic Client Registration (returns 201 with `client_id`).

## Releases

1. Add entries under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
2. Bump `version` in `package.json`, [server.json](server.json), and `src/mcp/server.ts` when needed.
3. Move the changelog section to `## [X.Y.Z] - YYYY-MM-DD`, commit, tag, and push:

```bash
git tag -a vX.Y.Z -m "Memxus MCP vX.Y.Z"
git push origin vX.Y.Z
```

Pushing a `v*` tag runs [.github/workflows/release.yml](.github/workflows/release.yml) (quality gate + GitHub Release with `server.json` attached).

Production endpoint: https://mcp.memxus.com/mcp — see [REVIEWER.md](REVIEWER.md) for OAuth and Bearer setup.

## Deferred

npm publish, MCP Registry submit, Connectors Directory listing, refresh tokens, multi-client OAuth UX.
