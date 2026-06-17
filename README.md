

# Memxus Remote MCP Server

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

Guía completa: 

- Variables en Railway → Settings → Variables (no subir `.env`).
- `MCP_PUBLIC_URL` = URL pública del servicio (Networking), sin `/mcp`.
- Health check: `/health` (`[railway.toml](railway.toml)`).
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

Production endpoint: [https://mcp.memxus.com/mcp](https://mcp.memxus.com/mcp) — see [REVIEWER.md](REVIEWER.md) for OAuth and Bearer setup.

## Pre-publication secrets audit

Run from the repo root before making the repository public. **Last audit: 2026-06-17 — PASSED.**

```bash
# 1. Verify .env was never committed
git log --all --full-history -- .env .env.local .env.production

# 2. Check for .env* files added in history
git log --all --oneline --diff-filter=A -- "*.env*"

# 3. Grep current tree for dangerous patterns (exclude .example)
git grep -rn -E "(service_role|anon_key|sk-[a-zA-Z0-9]{20,}|aimem_[a-zA-Z0-9]+|eyJ[a-zA-Z0-9_-]{20,})" -- ":(exclude)*.example" ":(exclude)CHANGELOG*"

# 4. Search full git history for leaked keys
git log --all -p --follow -S "service_role" -- . | head -100
git log --all -p --follow -S "SUPABASE_SERVICE_ROLE_KEY=" -- . | head -100
```

| Check | Expected |
|-------|----------|
| Commands 1–2 | No `.env` commits (only `.env.example` in initial commit) |
| Command 3 | Only placeholders (`aimem_YOUR_KEY`), test fixtures, SQL comments |
| Command 4 | No real key values in diffs |

If commands 1 or 4 find real secrets, rotate keys immediately and run `git filter-repo --path .env --invert-paths` before publishing.

## Deferred

npm publish, MCP Registry submit, Connectors Directory listing, refresh tokens, multi-client OAuth UX.