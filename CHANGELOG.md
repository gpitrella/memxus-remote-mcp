# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.1.0] - 2026-06-26

### Changed

- MCP Registry repositioning: "Memxus — AI Context Engine"
- Updated registry descriptions, tags, categories, and tool metadata for GitHub/Notion/skills positioning
- Added `server.json` schema validation in CI
- README aligned with context-engine positioning (hero, problem statement, product description)
- Production smoke test validates full 15-tool manifest (`SMOKE_MANIFEST=full`)

### Added

- `_meta.extendedDescription` and support link in registry manifest
- `scripts/mcp-tool-manifest.mjs` for layered tool manifest validation (core 9 / full 15)
- `scripts/validate-server-json.mjs` — AJV schema + custom checks for registry manifest
- Vendored `test-fixtures/mcp-preferences.contract.json` for standalone CI (no monorepo dependency)

### Fixed

- README: inline demo video via GitHub user-attachments (Glama badge already fixed)
- CI: contract test no longer depends on sibling `API-IAMemory` repo
- CI smoke: tool manifest mismatch after v1.1.0 production rollout (expected 9 vs got 15)

## [1.0.3] - 2026-06-19

### Changed

- License changed from MIT to GNU Affero General Public License v3.0 (AGPL-3.0)

## [1.0.2] - 2026-06-13

### Added

- MCP Registry v1.0.2 metadata: `websiteUrl`, `icons`, `categories`, 17 `tags`, 8 `tools`, OAuth auth spec, links, screenshots
- Publisher-provided `_meta` for discoverability (PulseMCP, Glama, VS Code gallery)

### Changed

- Registry `description` updated to include individuals, groups and teams use cases

## [1.0.1] - 2026-06-07

### Added

- VS Code MCP gallery OAuth redirect URIs (`vscode.dev/redirect`, `127.0.0.1:33418` loopback)
- CI auto-publish to Official MCP Registry on `v*` tags (`MCP_REGISTRY_PRIVATE_KEY`)

### Changed

- `server.json` icons metadata for registry gallery

## [1.0.0] - 2026-06-01

### Added

- Remote MCP server (Streamable HTTP) in production: https://mcp.memxus.com/mcp
- OAuth 2.1 + PKCE (authorize, token, RFC 8414 authorization server and protected resource metadata)
- Dynamic Client Registration: `POST /oauth/register` returns 201
- Eight MCP tools: remember, recall, get_context, list_memories, get_memory, list_collections, forget, memory_stats
- Plan limits (Free / Pro / Team / Enterprise) enforced in MCP
- MCP Registry manifest `server.json` (`com.memxus/memxus`)
- CI with optional production smoke test (`MEMXUS_API_KEY`)
- Maintainer guides: REVIEWER.md, STEP_BY_STEP.md

### Changed

- N/A — first public release

### Fixed

- CI: bootstrap test environment for unit tests
- Accept `MCP_PUBLIC_URL` with trailing slash on Railway
