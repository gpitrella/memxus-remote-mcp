# Memxus — One memory for every AI tool

<div align="center">

**Your memory travels with you.**

Save context once. Recall it instantly across Claude, Cursor, ChatGPT, VS Code and any MCP-compatible client.

[![Glama MCP Connector](https://img.shields.io/badge/Glama-MCP_Connector-6366f1?style=flat)](https://glama.ai/mcp/connectors/com.memxus/memxus)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-brightgreen)](https://nodejs.org)
[![Railway](https://img.shields.io/badge/Deployed%20on-Railway-purple)](https://railway.app)
[![MCP](https://img.shields.io/badge/Protocol-MCP%202.0-orange)](https://modelcontextprotocol.io)

[Website](https://www.memxus.com) · [Connect your first AI](https://www.memxus.com/install) · [Glama Inspector](https://glama.ai/mcp/connectors/com.memxus/memxus)

</div>

---

<div align="center">
  <a href="https://www.memxus.com/demo">
    <img src="https://www.memxus.com/og-image.png" alt="Memxus demo — save once, recall everywhere" width="900">
  </a>
  <br>
  <sub><a href="https://www.memxus.com/demo">Demo page</a> · <a href="https://www.memxus.com/memxus-demo.mp4">Direct MP4</a></sub>
</div>

<!-- Inline autoplay: replace the block above with <video src="https://github.com/user-attachments/assets/YOUR-UUID" ...> after uploading memxus-demo.mp4 via GitHub Issues. See docs/README-DEMO-VIDEO.md -->

---

## The problem

Every AI tool starts from zero.

Claude doesn't know what Cursor knows. Cursor doesn't know what ChatGPT knows.  
Your stack, project decisions, coding preferences and workflow context get repeated again and again.

**Memxus fixes that with a shared long-term memory layer for your AI tools.**

> Save a decision in Claude → recall it in Cursor → reference it in ChatGPT → reuse it anywhere.

---

## What is Memxus?

Memxus is a hosted remote MCP server that gives every AI client access to the same user-controlled long-term memory.

No local setup.  
No file syncing.  
No copy-pasting context between tools.

Connect once with OAuth and your context becomes portable across your entire AI workflow.

---

## Why developers use Memxus

- Keep project architecture decisions available across Claude, Cursor and ChatGPT
- Store stack decisions, coding conventions and implementation notes once
- Stop pasting the same context into every new AI session
- Share team memory across agents and workflows
- Build AI apps with persistent memory through MCP or API

---

## Connect in 30 seconds

```
URL:       https://mcp.memxus.com/mcp
Auth:      OAuth 2.1 (handled automatically)
Transport: Streamable HTTP
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "memxus": {
      "url": "https://mcp.memxus.com/mcp",
      "transport": "streamable-http"
    }
  }
}
```

### Cursor / VS Code

```json
{
  "mcp": {
    "servers": {
      "memxus": {
        "url": "https://mcp.memxus.com/mcp",
        "transport": "http"
      }
    }
  }
}
```

Or open directly in Glama Inspector →  
[`https://glama.ai/mcp/inspector?url=https://mcp.memxus.com/mcp`](https://glama.ai/mcp/inspector?url=https://mcp.memxus.com/mcp)

For marketplace reviewers: see [REVIEWER.md](REVIEWER.md) for OAuth and Bearer token setup.

---

## Supported platforms

| Platform | Integration | Status |
|----------|-------------|--------|
| Claude Desktop / claude.ai | Remote MCP | ✅ Live |
| Cursor | Remote MCP | ✅ Live |
| VS Code / Copilot MCP | Remote MCP | ✅ Live |
| ChatGPT | Custom GPT / API | ✅ Live |
| Gemini | MCP-compatible workflow | ✅ Live |
| Telegram | Bot connector | ✅ Live |
| Discord | Bot connector | 🔜 Coming soon |
| Slack | Bot connector | 🔜 Coming soon |
| Notion | Connector | 🔜 Coming soon |
| Any MCP-compatible client | Remote MCP | ✅ Live |

---

## Available tools (8)

| Tool | Description |
|------|-------------|
| `remember` | Save important information to long-term memory |
| `recall` | Semantic search across your memories |
| `get_context` | Build a formatted context block for a topic |
| `list_memories` | Browse memories by collection, tags, or type |
| `get_memory` | Retrieve a specific memory by ID |
| `forget` | Delete a memory by ID |
| `list_collections` | List all your memory collections |
| `memory_stats` | Stats by type and collection |

---

## Architecture

```
MCP Client (Claude, Cursor, etc.)
        │
        │  POST /mcp   Bearer aimem_*
        ▼
  mcp.memxus.com  ← This repo (Railway)
        │
        │  Supabase SDK
        ▼
  Supabase (Postgres + pgvector)
        │
        ▼
  Dash-AIMemory (Dashboard)
```

**Transport:** Streamable HTTP (MCP 2.0)  
**Auth:** OAuth 2.1 + PKCE + Dynamic Client Registration (RFC 9728)

---

## Security

- OAuth 2.1 + PKCE — no passwords, no API keys to manage
- Encrypted at rest (AES-256)
- User-controlled memory — view, edit and delete anytime from the dashboard
- No local files or manual syncing
- Pre-publication secrets audit passed: 2026-06-17

---

## OAuth flow

```
1. Client  →  GET  /.well-known/oauth-authorization-server
2. Client  →  GET  /oauth/authorize  →  redirect to dashboard login
3. User signs in (Google) in the dashboard
4. Client  →  POST /oauth/token  (PKCE)  →  aimem_* bearer token
5. Client  →  POST /mcp  Authorization: Bearer aimem_*
```

Dynamic Client Registration is supported — clients register automatically on first connect.

---

## Self-hosting

### Prerequisites

- Node 20+
- Supabase project (run `supabase/migration.sql` after the dashboard migration)
- Railway account (or any Node host)

### Environment variables

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `MCP_PUBLIC_URL` | Public URL of this server (no trailing slash) |
| `DASHBOARD_URL` | Dash-AIMemory URL for login redirect |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `OAUTH_CLIENT_ID` | OAuth client ID |
| `ALLOWED_REDIRECT_URIS` | Comma-separated allowed redirect URIs |
| `CORS_ORIGINS` | Comma-separated allowed CORS origins |
| `OPENAI_API_KEY` | _(Optional)_ Vector search embeddings |

### Run locally

```bash
npm install
npm run dev       # tsx watch
npm run build     # tsc → dist/
npm start         # node dist/index.js
```

### Deploy to Railway

Set all variables under **Settings → Variables** (never commit `.env`).  
`MCP_PUBLIC_URL` = your Railway networking URL (no trailing `/mcp`).  
Health check endpoint: `/health` (configured in [`railway.toml`](railway.toml)).

> **Note:** Node 20 on Railway — Supabase Realtime needs the `ws` package (configured in `src/lib/supabase.ts`).  
> Optional: set `RAILPACK_NODE_VERSION=22` for native WebSocket support.

---

## Development

```bash
npm install
npm run dev        # tsx watch
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run build      # compile → dist/
npm start          # node dist/index.js
```

Marketplace reviewers: [REVIEWER.md](REVIEWER.md) · MCP docs: [memxus.com/docs/mcp](https://www.memxus.com/docs/mcp)

---

## Releases

1. Add entries under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md)
2. Bump version in `package.json`, `server.json`, and `src/mcp/server.ts`
3. Move the changelog section to `## [X.Y.Z] - YYYY-MM-DD`
4. Commit, tag, and push:

```bash
git tag -a vX.Y.Z -m "Memxus MCP vX.Y.Z"
git push origin vX.Y.Z
```

Pushing a `v*` tag triggers [`.github/workflows/release.yml`](.github/workflows/release.yml) — quality gate + GitHub Release with `server.json` attached.

---

## Secrets audit

Run from the repo root before making the repository public.  
**Last audit: 2026-06-17 — PASSED**

```bash
# 1. Verify .env was never committed
git log --all --full-history -- .env .env.local .env.production

# 2. Check for .env* files added in history
git log --all --oneline --diff-filter=A -- "*.env*"

# 3. Grep current tree for dangerous patterns (exclude .example)
git grep -rn -E "(service_role|anon_key|sk-[a-zA-Z0-9]{20,}|aimem_[a-zA-Z0-9]+|eyJ[a-zA-Z0-9_-]{20,})" \
  -- ":(exclude)*.example" ":(exclude)CHANGELOG*"

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

---

## Roadmap

- [ ] Discord bot connector
- [ ] Slack bot connector
- [ ] Notion connector
- [ ] Refresh tokens
- [ ] Multi-client OAuth UX
- [ ] npm publish
- [ ] MCP Registry submit

---

## License

Licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

You can use, modify, and distribute this code freely. If you use it to run a network service (SaaS), you must publish your source code under the same license.

© 2026 Gabriel Pitrella · [memxus.com](https://www.memxus.com)
