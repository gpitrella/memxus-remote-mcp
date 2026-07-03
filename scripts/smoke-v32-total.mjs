#!/usr/bin/env node
/**
 * v3.2 prod gate — total/completeness + expand exclude.
 * Requires MEMXUS_API_KEY (aimem_*). Optional: MCP_SMOKE_URL.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = process.env.MCP_SMOKE_URL ?? 'https://mcp.memxus.com/mcp';
const API_KEY = process.env.MEMXUS_API_KEY;

const TOPIC = 'Memxus v3.2 response template';
const COLLECTION = 'project:memxus';
const BASELINE_EXCLUDE = [
  'd441ee96-20c0-4265-a026-f278bcb29100',
  'cfb02549-34de-427d-bd25-01922081dca7',
  '89650b7d-7cf7-4911-b136-5db931d2e750',
];

if (!API_KEY) {
  console.error('MEMXUS_API_KEY is required (aimem_* from dashboard)');
  process.exit(1);
}

function toolText(result) {
  return (result?.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

function parsePayload(result) {
  const structured = result?.structuredContent ?? {};
  const text = toolText(result);
  const userFacing =
    (typeof structured.user_facing_template === 'string' && structured.user_facing_template) ||
    text.split('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━').pop()?.trim() ||
    '';
  return {
    count: Number(structured.count),
    total: Number(structured.total),
    userFacing,
    memories: Array.isArray(structured.memories) ? structured.memories : [],
    isError: Boolean(result?.isError),
    text,
  };
}

function assertTest(name, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } },
  });
  const client = new Client({ name: 'memxus-smoke-v32', version: '1.0' });
  await client.connect(transport);

  const results = [];

  const recall5 = parsePayload(
    await client.callTool({
      name: 'recall',
      arguments: { query: TOPIC, collection: COLLECTION, limit: 5 },
    }),
  );
  if (recall5.isError) throw new Error(`recall limit 5: ${recall5.text}`);
  results.push(
    assertTest(
      'recall limit 5 total',
      recall5.total === 10,
      `count=${recall5.count} total=${recall5.total}`,
    ),
  );
  results.push(
    assertTest(
      'recall limit 5 footer 5 de 10',
      /5 más relevantes de 10/.test(recall5.userFacing),
      recall5.userFacing.split('\n').find((l) => l.includes('Recuperé')) ?? '',
    ),
  );
  results.push(
    assertTest(
      'recall limit 5 no exhausted CTA',
      !/ya mostré todas/.test(recall5.userFacing),
      recall5.userFacing.split('\n').find((l) => l.includes('Ampliar')) ?? '',
    ),
  );

  const recall10 = parsePayload(
    await client.callTool({
      name: 'recall',
      arguments: { query: TOPIC, collection: COLLECTION, limit: 10 },
    }),
  );
  if (recall10.isError) throw new Error(`recall limit 10: ${recall10.text}`);
  results.push(
    assertTest(
      'recall limit 10 total',
      recall10.total === 10 && recall10.count === 10,
      `count=${recall10.count} total=${recall10.total}`,
    ),
  );
  results.push(
    assertTest(
      'recall limit 10 exhausted CTA',
      /ya mostré todas las memorias disponibles/.test(recall10.userFacing),
      recall10.userFacing.split('\n').find((l) => l.includes('Ampliar')) ?? '',
    ),
  );

  const expand = parsePayload(
    await client.callTool({
      name: 'get_context',
      arguments: {
        topic: TOPIC,
        collection: COLLECTION,
        max_memories: 10,
        exclude_memory_ids: BASELINE_EXCLUDE,
      },
    }),
  );
  if (expand.isError) throw new Error(`get_context expand: ${expand.text}`);
  const returnedIds = expand.memories.map((m) => String(m.id));
  const noBaseline = !BASELINE_EXCLUDE.some((id) => returnedIds.includes(id));
  results.push(
    assertTest(
      'expand exclude 3 no duplicates',
      noBaseline && expand.count >= 2,
      `count=${expand.count} ids=${returnedIds.map((id) => id.slice(0, 8)).join(',')}`,
    ),
  );
  results.push(
    assertTest(
      'expand footer 5 de 10',
      /adicionales \(5 de 10|Completé el pool semántico: 5 de 10/.test(expand.userFacing),
      expand.userFacing.split('\n').find((l) => l.includes('Recuperé') || l.includes('Completé')) ?? '',
    ),
  );
  results.push(
    assertTest(
      'expand total',
      expand.total === 10,
      `total=${expand.total}`,
    ),
  );

  await transport.close();

  const passed = results.filter(Boolean).length;
  const failed = results.length - passed;
  console.log('');
  console.log(`v3.2 smoke: ${passed}/${results.length} passed`);
  if (failed > 0) process.exit(1);
  console.log('v3.2 smoke passed');
}

main().catch((err) => {
  console.error('v3.2 smoke failed:', err.message ?? err);
  process.exit(1);
});
