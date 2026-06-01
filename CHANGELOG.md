# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
