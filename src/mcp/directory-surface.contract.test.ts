/**
 * Contract: declared Anthropic Directory surface must match code.
 * SYNC: docs/ANTHROPIC-DIRECTORY-SUBMISSION.md, server.json, MCP_CORE_TOOLS
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCP_CORE_TOOLS, MCP_SKILL_ROUTING_TOOLS, getActiveMcpTools } from './tool-schemas.js';
import { RESOURCES } from './resources.js';
import { DEFAULT_USER_MCP_PREFERENCES } from '../lib/mcp-preferences.js';
import { DISABLE_SKILLS, ENABLE_INAPP_CONNECT, ENABLE_SKILL_ROUTING } from '../lib/feature-flags.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const serverJson = JSON.parse(readFileSync(join(root, 'server.json'), 'utf8'));
const submissionDoc = readFileSync(
  join(root, 'docs/ANTHROPIC-DIRECTORY-SUBMISSION.md'),
  'utf8',
);
const manifestSource = readFileSync(join(root, 'scripts/mcp-tool-manifest.mjs'), 'utf8');

const DECLARED_CORE = [
  'forget',
  'get_context',
  'get_memory',
  'list_collections',
  'list_memories',
  'memory_stats',
  'recall',
  'remember',
  'update',
] as const;

function extractCoreToolNamesFromManifest(source: string): string[] {
  const match = source.match(/export const CORE_TOOL_NAMES = \[([\s\S]*?)\];/);
  assert.ok(match, 'CORE_TOOL_NAMES not found in mcp-tool-manifest.mjs');
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!).sort();
}

test('directory surface: CORE_TOOL_NAMES matches MCP_CORE_TOOLS and declared list', () => {
  const fromSchemas = MCP_CORE_TOOLS.map((t) => t.name).sort();
  const fromManifest = extractCoreToolNamesFromManifest(manifestSource);
  assert.deepEqual(fromSchemas, [...DECLARED_CORE]);
  assert.deepEqual(fromManifest, [...DECLARED_CORE]);
});

test('directory surface: server.json declares exactly 9 core tools', () => {
  const meta = serverJson._meta?.['io.modelcontextprotocol.registry/publisher-provided'];
  const names = (meta?.tools ?? []).map((t: { name: string }) => t.name).sort();
  assert.equal(names.length, 9);
  assert.deepEqual(names, [...DECLARED_CORE]);
  assert.equal(serverJson.version, '1.3.2');
  assert.match(serverJson.description, /Persistent memory layer/);
  assert.doesNotMatch(serverJson.description, /ChatGPT/);
  assert.doesNotMatch(meta?.extendedDescription ?? '', /ChatGPT/);
});

test('directory surface: RESOURCES is only memory://recent', () => {
  assert.equal(RESOURCES.length, 1);
  assert.equal(RESOURCES[0]?.uri, 'memory://recent');
  assert.ok(!RESOURCES.some((r) => r.uri.startsWith('ui://')));
  assert.ok(!RESOURCES.some((r) => r.mimeType.includes('profile=mcp-app')));
});

test('directory surface: no tool exposes _meta.ui (any tier)', () => {
  const prevDisable = process.env[DISABLE_SKILLS];
  const prevConnect = process.env[ENABLE_INAPP_CONNECT];
  const prevRouting = process.env[ENABLE_SKILL_ROUTING];
  process.env[DISABLE_SKILLS] = 'false';
  process.env[ENABLE_INAPP_CONNECT] = 'true';
  process.env[ENABLE_SKILL_ROUTING] = 'true';
  try {
    const tools = getActiveMcpTools({
      prefs: {
        ...DEFAULT_USER_MCP_PREFERENCES,
        in_app_connect_enabled: true,
        skill_routing_enabled: true,
      },
    });
    for (const tool of tools) {
      const meta = tool._meta as { ui?: unknown } | undefined;
      assert.equal(meta?.ui, undefined, `${tool.name} must not expose _meta.ui`);
    }
    for (const tool of MCP_SKILL_ROUTING_TOOLS) {
      const meta = tool._meta as { ui?: unknown } | undefined;
      assert.equal(meta?.ui, undefined, `${tool.name} schema must not expose _meta.ui`);
    }
  } finally {
    if (prevDisable === undefined) delete process.env[DISABLE_SKILLS];
    else process.env[DISABLE_SKILLS] = prevDisable;
    if (prevConnect === undefined) delete process.env[ENABLE_INAPP_CONNECT];
    else process.env[ENABLE_INAPP_CONNECT] = prevConnect;
    if (prevRouting === undefined) delete process.env[ENABLE_SKILL_ROUTING];
    else process.env[ENABLE_SKILL_ROUTING] = prevRouting;
  }
});

test('directory surface: submission doc lists 9 tools / 0 prompts / 1 resource', () => {
  assert.match(submissionDoc, /\|\s*Tools\s*\|\s*\*\*9\*\*/);
  assert.match(submissionDoc, /\|\s*Prompts\s*\|\s*\*\*0\*\*/);
  assert.match(submissionDoc, /\|\s*Resources\s*\|\s*\*\*1\*\*/);
  assert.match(submissionDoc, /`update`/);
  assert.match(submissionDoc, /not an MCP app/i);
  for (const name of DECLARED_CORE) {
    assert.match(submissionDoc, new RegExp(`\`${name}\``));
  }
});

test('directory surface: get_context description has no proactive invocation directive', () => {
  const tool = MCP_CORE_TOOLS.find((t) => t.name === 'get_context');
  assert.ok(tool);
  const description = tool.description ?? '';
  assert.doesNotMatch(description, /BEFORE responding/i);
  assert.doesNotMatch(description, /do not wait/i);
  assert.doesNotMatch(description, /use_skill_in_chat/);
  assert.match(description, /use when the user asks to load or recall/i);
});

/** Directive text and dangling resource URIs, wherever a reviewer can read them. */
const BANNED_IN_DESCRIPTIONS: Array<[RegExp, string]> = [
  [/BEFORE (responding|calling)/i, 'proactive-invocation directive'],
  [/do not wait for the user/i, 'proactive-invocation directive'],
  [/do not ask the user/i, 'assistant-behaviour directive'],
  [/\bshow the user\b/i, 'rendering directive aimed at the assistant'],
  [/\bdo not (repeat|dump)\b/i, 'rendering directive aimed at the assistant'],
  [/\bverbatim\b/i, 'rendering directive aimed at the assistant'],
  [/ui:\/\//, 'MCP-app widget URI (widgets are not served)'],
  [/memory:\/\/(?!recent\b)[a-z]+/i, 'resource URI that resources/list does not serve'],
];

/** Every string a client sees: tool description + input/output schema descriptions. */
function collectDescriptions(tool: {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
}): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  if (tool.description) found.push([tool.name, tool.description]);
  const walk = (node: unknown, path: string): void => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'description' && typeof value === 'string') found.push([path, value]);
      else walk(value, `${path}.${key}`);
    }
  };
  walk(tool.inputSchema, `${tool.name}.inputSchema`);
  walk(tool.outputSchema, `${tool.name}.outputSchema`);
  return found;
}

test('directory surface: no description carries directives or dangling URIs (any tier)', () => {
  const prevDisable = process.env[DISABLE_SKILLS];
  const prevConnect = process.env[ENABLE_INAPP_CONNECT];
  const prevRouting = process.env[ENABLE_SKILL_ROUTING];
  process.env[DISABLE_SKILLS] = 'false';
  process.env[ENABLE_INAPP_CONNECT] = 'true';
  process.env[ENABLE_SKILL_ROUTING] = 'true';
  try {
    const tools = getActiveMcpTools({
      prefs: {
        ...DEFAULT_USER_MCP_PREFERENCES,
        in_app_connect_enabled: true,
        skill_routing_enabled: true,
      },
    });
    for (const tool of tools) {
      for (const [where, text] of collectDescriptions(tool)) {
        for (const [pattern, why] of BANNED_IN_DESCRIPTIONS) {
          assert.doesNotMatch(text, pattern, `${where}: ${why}`);
        }
      }
    }
  } finally {
    if (prevDisable === undefined) delete process.env[DISABLE_SKILLS];
    else process.env[DISABLE_SKILLS] = prevDisable;
    if (prevConnect === undefined) delete process.env[ENABLE_INAPP_CONNECT];
    else process.env[ENABLE_INAPP_CONNECT] = prevConnect;
    if (prevRouting === undefined) delete process.env[ENABLE_SKILL_ROUTING];
    else process.env[ENABLE_SKILL_ROUTING] = prevRouting;
  }
});
