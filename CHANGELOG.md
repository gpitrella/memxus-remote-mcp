# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.3.1] - 2026-07-30

### Fixed

- Registry `extendedDescription` claimed skill routing was "opt-in via feature flags and user preferences". It is not: production sets `DISABLE_SKILLS=true` and `areSkillsHardDisabled()` is a hard kill-switch, so the six skill-routing tools are never listed for any account regardless of preferences. Only the GitHub/Notion connector tools are genuinely opt-in per account
- README no longer advertises a "13-tool public manifest with skill routing deferred" — the advertised surface is the 9 core tools
- `docs/ANTHROPIC-DIRECTORY-SUBMISSION.md` now records skill routing as disabled rather than opt-in

## [1.3.0] - 2026-07-30

Anthropic MCP Directory review: the advertised surface now matches what the server actually serves, and tool descriptions describe the tool instead of instructing the assistant.

### Changed

- `get_context` description is declarative — the proactive-invocation directive ("call get_context … BEFORE responding — do not wait for the user to ask") is removed from both the live schema and `server.json`
- `workspace` and `list_collections` descriptions no longer reference `memory://workspaces`, a resource the server does not serve, and no longer carry a "BEFORE calling this tool" directive
- `initialize` instructions no longer imperatively tell the assistant to greet unprompted
- Rendering instructions trimmed to what the client needs to render the result; skill-routing flow directives dropped
- Listing copy is agent-agnostic: `description` and `extendedDescription` no longer name third-party assistants
- `server.json` declares the 9 core tools; connect tools stay opt-in behind feature flags and are no longer advertised

### Removed

- MCP prompts `memxus-context` and `memxus-context-skills`; the `prompts` capability is no longer advertised
- MCP-app widget resources `ui://memxus/skill-card` and `ui://memxus/collections-card`, and their `_meta.ui` wiring — `resources/list` serves only `memory://recent`, so Memxus is not an MCP app

### Added

- `docs/ANTHROPIC-DIRECTORY-SUBMISSION.md` — canonical record of the declared directory surface (9 tools / 0 prompts / 1 resource) and the review reply
- `src/mcp/directory-surface.contract.test.ts` — CI contract test that fails the build if code, `server.json` and the submission doc diverge, or if any description reintroduces directive language or a URI the server does not serve
- Live smoke now asserts the resource and prompt surface, not just the tool list

## [1.2.1] - 2026-07-26

### Changed

- README rewritten to match the landing page: leads with the `save → recall` gesture, frames GitHub/Notion sync as an optional deep layer, and adds the "not generic memory — your real work, portable" differentiator
- Simplified the context flow diagram to a 3-step `Save → Memxus → Recall anywhere` mermaid

### Added

- `docs/assets/memxus-flow.svg` — theme-aware "save anywhere → one engine → recall anywhere → you control" graphic embedded in the README
- `docs/assets/memxus-code.svg` — code card showing the `remember` / `recall` gesture across AI clients

## [1.2.0] - 2026-07-08

### Changed

- Public manifest: 13 tools (9 core + 4 connect); skill routing deferred (`DISABLE_SKILLS` in production)
- MCP identity `memxus`; npm package `@memxus/mcp`
- README: v1.2.0, YouTube demo thumbnail, connect-only Context Engine tools

### Added

- Manifest tier validation: core / connect / skills / full (`scripts/mcp-tool-manifest.test.mjs`)

### Fixed

- Release smoke: `SMOKE_MANIFEST=auto` accepts connect tier (13 tools)
- CI `npm test` glob on Linux (`scripts/*.test.mjs`)

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
