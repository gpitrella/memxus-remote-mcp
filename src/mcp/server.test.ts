import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_TOOLS } from '../mcp/server.js';

const TOOL_NAMES = [
  'remember',
  'recall',
  'get_context',
  'list_memories',
  'get_memory',
  'list_collections',
  'forget',
  'memory_stats',
] as const;

test('MCP_TOOLS exposes 8 tools with marketplace annotations', () => {
  assert.equal(MCP_TOOLS.length, 8);
  const names = MCP_TOOLS.map((t) => t.name);
  assert.deepEqual(names, [...TOOL_NAMES]);
});

test('read-only tools have readOnlyHint true', () => {
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
    assert.ok(tool.title, `${tool.name} should have title`);
  }
});

test('forget has destructiveHint true', () => {
  const forget = MCP_TOOLS.find((t) => t.name === 'forget');
  assert.ok(forget);
  assert.equal(forget!.annotations?.destructiveHint, true);
  assert.equal(forget!.annotations?.readOnlyHint, false);
});

test('remember has openWorldHint true', () => {
  const remember = MCP_TOOLS.find((t) => t.name === 'remember');
  assert.ok(remember);
  assert.equal(remember!.annotations?.openWorldHint, true);
});

test('list_memories exposes full_content parameter', () => {
  const list = MCP_TOOLS.find((t) => t.name === 'list_memories');
  assert.ok(list);
  const props = list!.inputSchema as { properties?: Record<string, unknown> };
  assert.ok(props.properties?.full_content);
});

test('get_memory requires memory_id', () => {
  const getMemory = MCP_TOOLS.find((t) => t.name === 'get_memory');
  assert.ok(getMemory);
  const schema = getMemory!.inputSchema as { required?: string[] };
  assert.deepEqual(schema.required, ['memory_id']);
});
