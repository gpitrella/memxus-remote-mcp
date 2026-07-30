# Anthropic MCP Directory — Memxus submission (canonical)

> Source of truth for what is declared to Anthropic / MCP Directory reviewers.
> Keep this file in sync with `server.json`, `MCP_CORE_TOOLS`, and the live
> production surface at `https://mcp.memxus.com/mcp` (core tier).

**Version:** 1.3.0  
**Updated:** 2026-07-30  
**MCP URL:** `https://mcp.memxus.com/mcp`  
**Registry name:** `com.memxus/memxus`

## Listing copy

**One-liner (agent-agnostic):**

> Persistent memory layer that saves and recalls your project context and preferences.

**MCP app?** No.

## Declared surface (must match live core tier)

| Surface | Count | Details |
|---------|-------|---------|
| Tools | **9** | see list below |
| Prompts | **0** | capability not advertised |
| Resources | **1** | `memory://recent` only |
| MCP-app widgets (`ui://`) | **0** | none |

### Core tools (alphabetical)

1. `forget`
2. `get_context`
3. `get_memory`
4. `list_collections`
5. `list_memories`
6. `memory_stats`
7. `recall`
8. `remember`
9. `update`

`update` is a core write tool (counts toward plan caps). It was added after the
original Anthropic form submission that listed 8 tools; it must be declared as
the 9th core tool on re-review.

### Opt-in (not declared; gated behind feature flags + user prefs)

- In-app connect (4 tools): `connect_source`, `list_syncable_items`, `set_sync_selection`, `check_connect_status`
- Skill routing (6 tools): `get_context_with_skills`, `suggest_skills`, `use_skill_in_chat`, `install_skill`, `skip_skill`, `reset_skill_decision`

Production ships with connect/skills **off** so anonymous discovery and Claude Directory probes see the 9-tool core surface.

### OAuth scopes

- `memories:read`
- `memories:write`
- `memories:delete`
- `sources:read`
- `sources:write`

## Reply draft (Anthropic review thread)

Hi — thanks for the review. We updated the live server and submission to match:

1. **`get_context` description** — removed the proactive-invocation directive. The description now explains what the tool does (builds a formatted context block; use when the user asks to load/recall project context), without instructing the assistant to call it unsolicited.

2. **Listing one-liner** — changed to agent-agnostic copy: “Persistent memory layer that saves and recalls your project context and preferences.”

3. **Surface reconciliation** — we shrank the live server to the surface we actually use and that the form declared:
   - **9 core tools** (original form had 8; `update` is a legitimate core write tool that was added after the initial submit — please treat it as declared).
   - **0 prompts** (removed unused `memxus-context` / `memxus-context-skills`).
   - **1 resource** (`memory://recent` only; removed unused MCP-app widgets `ui://memxus/skill-card` and `ui://memxus/collections-card`).
   - **Not an MCP app.**

Connect and skill-routing tools remain opt-in behind feature flags and are not part of the directory listing.

Ready for re-review when convenient.
