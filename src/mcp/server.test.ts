import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MCP_TOOLS, MCP_CORE_TOOLS, getActiveMcpTools } from './tool-schemas.js';
import { createMCPServer } from './server.js';

async function withTestClient(fn: (client: Client) => Promise<void>): Promise<void> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMCPServer({ userId: 'test-user' });
  const client = new Client({ name: 'memxus-server-test', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

const CORE_TOOL_NAMES = [
  'remember',
  'recall',
  'get_context',
  'list_memories',
  'get_memory',
  'list_collections',
  'forget',
  'memory_stats',
  'update',
] as const;

const LEGACY_INPUT_KEYS: Record<string, string[]> = {
  remember: [
    'content',
    'type',
    'collection',
    'tags',
    'importance',
    'append_to',
    'visibility',
    'group_id',
    'group_name',
  ],
  recall: ['query', 'limit', 'type', 'collection', 'tags', 'visibility', 'group_id', 'group_name', 'include_skills', 'exclude_memory_ids'],
  get_context: [
    'topic',
    'max_memories',
    'type',
    'collection',
    'tags',
    'visibility',
    'group_id',
    'group_name',
    'exclude_memory_ids',
  ],
  list_memories: [
    'limit',
    'full_content',
    'type',
    'collection',
    'tags',
    'visibility',
    'group_id',
    'group_name',
  ],
  get_memory: ['memory_id'],
  list_collections: [],
  forget: ['memory_id'],
  memory_stats: [],
  update: ['id', 'content', 'type', 'collection', 'tags', 'importance', 'mode'],
};

const LEGACY_REQUIRED: Record<string, string[]> = {
  remember: ['content'],
  recall: ['query'],
  get_context: ['topic'],
  list_memories: [],
  get_memory: ['memory_id'],
  list_collections: [],
  forget: ['memory_id'],
  memory_stats: [],
  update: ['id'],
};

function inputProps(tool: (typeof MCP_TOOLS)[number]): Record<string, unknown> {
  const schema = tool.inputSchema as { properties?: Record<string, unknown> };
  return schema.properties ?? {};
}

test('MCP_CORE_TOOLS exposes 9 core tools with marketplace annotations', () => {
  assert.equal(MCP_CORE_TOOLS.length, 9);
  const names = MCP_CORE_TOOLS.map((t) => t.name);
  assert.deepEqual(names, [...CORE_TOOL_NAMES]);
});

test('getActiveMcpTools matches MCP_TOOLS export', () => {
  assert.deepEqual(
    getActiveMcpTools().map((t) => t.name),
    MCP_TOOLS.map((t) => t.name)
  );
});

test('every tool has outputSchema with object type', () => {
  for (const tool of MCP_TOOLS) {
    const out = tool.outputSchema as { type?: string; properties?: Record<string, unknown> };
    assert.equal(out?.type, 'object', `${tool.name} outputSchema.type`);
    assert.ok(out?.properties && Object.keys(out.properties).length > 0, `${tool.name} outputSchema.properties`);
  }
});

test('every input property has description', () => {
  for (const tool of MCP_TOOLS) {
    const props = inputProps(tool);
    for (const [key, prop] of Object.entries(props)) {
      const desc = (prop as { description?: string }).description;
      assert.ok(desc && desc.length > 0, `${tool.name}.${key} missing description`);
    }
  }
});

test('inputSchema preserves legacy property keys and required fields', () => {
  for (const tool of MCP_CORE_TOOLS) {
    const props = Object.keys(inputProps(tool)).sort();
    const expected = [...(LEGACY_INPUT_KEYS[tool.name] ?? [])].sort();
    assert.deepEqual(props, expected, `${tool.name} property keys`);
    const schema = tool.inputSchema as { required?: string[] };
    const required = [...(schema.required ?? [])].sort();
    const expectedReq = [...(LEGACY_REQUIRED[tool.name] ?? [])].sort();
    assert.deepEqual(required, expectedReq, `${tool.name} required`);
  }
});

test('read-only tools have readOnlyHint true and idempotentHint true', () => {
  const readOnly = new Set([
    'recall',
    'get_context',
    'list_memories',
    'get_memory',
    'list_collections',
    'memory_stats',
  ]);
  for (const tool of MCP_TOOLS) {
    if (!readOnly.has(tool.name)) continue;
    assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} should be readOnly`);
    assert.equal(tool.annotations?.destructiveHint, false, `${tool.name} should not be destructive`);
    assert.equal(tool.annotations?.idempotentHint, true, `${tool.name} should be idempotent`);
    assert.ok(tool.title, `${tool.name} should have title`);
  }
});

test('forget has destructiveHint true and idempotentHint false', () => {
  const forget = MCP_TOOLS.find((t) => t.name === 'forget');
  assert.ok(forget);
  assert.equal(forget!.annotations?.destructiveHint, true);
  assert.equal(forget!.annotations?.readOnlyHint, false);
  assert.equal(forget!.annotations?.idempotentHint, false);
});

test('remember has openWorldHint true and idempotentHint false', () => {
  const remember = MCP_TOOLS.find((t) => t.name === 'remember');
  assert.ok(remember);
  assert.equal(remember!.annotations?.openWorldHint, true);
  assert.equal(remember!.annotations?.idempotentHint, false);
});

test('list_memories exposes full_content parameter', () => {
  const list = MCP_TOOLS.find((t) => t.name === 'list_memories');
  assert.ok(list);
  assert.ok(inputProps(list!).full_content);
});

test('get_memory requires memory_id', () => {
  const getMemory = MCP_TOOLS.find((t) => t.name === 'get_memory');
  assert.ok(getMemory);
  const schema = getMemory!.inputSchema as { required?: string[] };
  assert.deepEqual(schema.required, ['memory_id']);
});

test('listResourceTemplates returns empty array for Glama Inspector compatibility', async () => {
  await withTestClient(async (client) => {
    const result = await client.listResourceTemplates();
    assert.deepEqual(result.resourceTemplates, []);
  });
});

test('listPrompts returns empty array for Glama Inspector compatibility', async () => {
  await withTestClient(async (client) => {
    const result = await client.listPrompts();
    assert.deepEqual(result.prompts, []);
  });
});

test('listResources still exposes memory://recent', async () => {
  await withTestClient(async (client) => {
    const result = await client.listResources();
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0]?.uri, 'memory://recent');
  });
});

test('listTools exposes core tools (9 by default)', async () => {
  await withTestClient(async (client) => {
    const result = await client.listTools();
    assert.equal(result.tools.length, 9);
    assert.deepEqual(
      result.tools.map((tool) => tool.name),
      [...CORE_TOOL_NAMES]
    );
  });
});
