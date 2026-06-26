#!/usr/bin/env node
/**
 * Live MCP smoke test — requires MEMXUS_API_KEY (aimem_*).
 * Optional: MCP_SMOKE_URL (default https://mcp.memxus.com/mcp)
 * Optional: SMOKE_MANIFEST=auto|full|core (default auto)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { validateToolManifest } from './mcp-tool-manifest.mjs';

const MCP_URL = process.env.MCP_SMOKE_URL ?? 'https://mcp.memxus.com/mcp';
const API_KEY = process.env.MEMXUS_API_KEY;
const SMOKE_MANIFEST = process.env.SMOKE_MANIFEST ?? 'auto';

if (!API_KEY) {
  console.error('MEMXUS_API_KEY is required for smoke tests');
  process.exit(1);
}

function toolText(result) {
  return (result?.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

async function main() {
  const healthBase = MCP_URL.replace(/\/mcp\/?$/, '');
  const healthRes = await fetch(`${healthBase}/health`);
  if (!healthRes.ok) {
    throw new Error(`Health check failed: ${healthRes.status}`);
  }

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } },
  });
  const client = new Client({ name: 'memxus-smoke', version: '1.0' });
  await client.connect(transport);

  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  const { tier, count } = validateToolManifest(names, SMOKE_MANIFEST);
  console.log(`OK list_tools (${count} tools, manifest=${tier})`);

  const stats1 = toolText(await client.callTool({ name: 'memory_stats', arguments: {} }));
  const total1 = Number(stats1.match(/Total:\s*(\d+)/)?.[1] ?? NaN);
  const stats2 = toolText(await client.callTool({ name: 'memory_stats', arguments: {} }));
  const total2 = Number(stats2.match(/Total:\s*(\d+)/)?.[1] ?? NaN);
  if (!Number.isFinite(total1) || total1 !== total2) {
    throw new Error(`memory_stats unstable: ${total1} vs ${total2}`);
  }
  console.log(`OK memory_stats (total=${total1}, stable)`);

  const listEmpty = await client.callTool({ name: 'list_memories', arguments: {} });
  if (listEmpty.isError) {
    throw new Error(`list_memories {} failed: ${toolText(listEmpty)}`);
  }
  console.log('OK list_memories (no params)');

  const ctx = toolText(
    await client.callTool({ name: 'get_context', arguments: { topic: 'Next.js Supabase' } })
  );
  if (/error/i.test(ctx) && ctx.length < 20) {
    throw new Error(`get_context failed: ${ctx}`);
  }
  console.log(`OK get_context cross-collection (${ctx.length} chars)`);

  const recall = toolText(
    await client.callTool({ name: 'recall', arguments: { query: 'Next.js Supabase' } })
  );
  console.log(`OK recall (${recall.slice(0, 80).replace(/\n/g, ' ')}...)`);

  await transport.close();
  console.log('Smoke passed');
}

main().catch((err) => {
  console.error('Smoke failed:', err.message ?? err);
  process.exit(1);
});
