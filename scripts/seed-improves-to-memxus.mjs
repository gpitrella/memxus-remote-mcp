#!/usr/bin/env node
/**
 * Seed project:improves-to-memxus memory (Smithery renaming decision).
 *
 * Usage (API — preferred, your account):
 *   MEMXUS_API_KEY=aimem_xxx node scripts/seed-improves-to-memxus.mjs
 *
 * Usage (Supabase — maintainer, by email):
 *   node scripts/seed-improves-to-memxus.mjs gabrielpitrella@gmail.com
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const MEMORY = {
  content: `Memxus MCP — Smithery quality & tool naming (Jun 2026)

IMPROVEMENTS DEPLOYED (RemoteMCP-AIMemory/src/mcp/):
- tool-schemas.ts: 100% parameter descriptions, outputSchema on all 8 tools, idempotentHint, improved titles
- tool-results.ts + format-memory.ts: structuredContent on success; content[] text unchanged
- Smithery memxus/memxus score: ~82 → 98/100 (only Naming ~2pts short of 100)

TOOLS OK FOR SMITHERY NAMING (verb_object):
- get_context, list_memories, get_memory, list_collections

SMITHERY WOULD PREFER (not applied yet):
- remember → save_memory or create_memory
- recall → search_memories
- forget → delete_memory
- memory_stats → get_memory_stats

DECISION — DO NOT RENAME while Claude MCP Directory review is pending:
- REVIEWER.md and submission expect: remember, recall, get_context, list_memories, get_memory, list_collections, forget, memory_stats
- Renaming breaks reviewer checklist, landing/docs, memxus-cursor-plugin skill, connected clients
- After Claude approval: optional rename for Smithery 100/100; update REVIEWER.md, MARKETPLACE.md, privacy, plugin; notify Anthropic if re-tested
- Do NOT ship duplicate alias tools (12 tools confuses agents)
- Keep marketing "remember/recall" even if API renames later

UNTOUCHED: tools.ts, oauth, plan-enforcement, resources.ts
Endpoints: mcp.memxus.com/mcp, Smithery memxus/memxus`,
  type: 'instruction',
  collection: 'project:improves-to-memxus',
  tags: ['memxus', 'smithery', 'mcp', 'renaming', 'claude-directory', 'quality-score'],
  importance: 0.9,
};

const apiKey = process.env.MEMXUS_API_KEY;
const email = process.argv[2];

async function viaApi() {
  const base = (process.env.API_BASE_URL || 'https://api.memxus.com/api/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/memories`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(MEMORY),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data?.data?.id ?? data?.id;
}

async function viaSupabase(userEmail) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const sb = createClient(url, key);
  const { data: user, error: userErr } = await sb
    .from('users')
    .select('id')
    .eq('email', userEmail)
    .maybeSingle();
  if (userErr || !user?.id) throw new Error(`User not found for ${userEmail}`);

  const { data, error } = await sb
    .from('memories')
    .insert({
      user_id: user.id,
      content: MEMORY.content,
      memory_type: MEMORY.type,
      tags: MEMORY.tags,
      collection: MEMORY.collection,
      importance: MEMORY.importance,
      metadata: {},
      scope: 'personal',
      workforce_workspace_id: null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function main() {
  let id;
  if (apiKey?.startsWith('aimem_')) {
    id = await viaApi();
    console.log(`Created via API → collection ${MEMORY.collection} → ${id}`);
  } else if (email) {
    id = await viaSupabase(email);
    console.log(`Created via Supabase (${email}) → ${MEMORY.collection} → ${id}`);
  } else {
    console.error(
      'Provide MEMXUS_API_KEY=aimem_... or: node scripts/seed-improves-to-memxus.mjs your@email.com'
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
