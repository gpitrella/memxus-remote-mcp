import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildCollectionsPickerToolResult } from './collections-card.js';
import { buildSkillCardMeta, buildSkillCardPayload } from './skill-card.js';
import { getActiveMcpTools } from './tool-schemas.js';
import { createMCPServer } from './server.js';
import { DEFAULT_USER_MCP_PREFERENCES } from '../lib/mcp-preferences.js';
import { DISABLE_SKILLS, ENABLE_SKILL_ROUTING } from '../lib/feature-flags.js';
import type { EffectiveCapabilities } from '../lib/skill-capabilities.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CAPS: EffectiveCapabilities = {
  surface: 'code-editor',
  renderApps: true,
  canInstall: true,
  canUseInChat: true,
  hostSkipAction: true,
  compactLayout: false,
};

const PICKER_INPUT = {
  lang: 'es' as const,
  collections: [
    { slug: 'project:memxus', name: 'Memxus', description: 'MCP', memoryCount: 5 },
  ],
  showMore: false,
  showAll: false,
  includeSkills: false,
  caps: CAPS,
};

test('buildCollectionsPickerToolResult never attaches _meta.ui', () => {
  for (const renderApps of [true, false]) {
    const result = buildCollectionsPickerToolResult({
      ...PICKER_INPUT,
      caps: { ...CAPS, renderApps },
    });
    assert.equal(result._meta, undefined, `renderApps=${renderApps}`);
    assert.equal(result.content[0]?.text, result.structuredContent.message);
    assert.match(String(result.content[0]?.text), /COLECCIONES|project:memxus/);
  }
});

test('buildSkillCardMeta returns undefined when renderApps is false', () => {
  const payload = buildSkillCardPayload({
    lang: 'es',
    skills: [],
    caps: { ...CAPS, renderApps: false },
  });
  assert.equal(buildSkillCardMeta(payload), undefined);
});

test('server.ts only uses buildSkillCardMeta in skills domain handlers', () => {
  const serverSource = readFileSync(join(__dirname, 'server.ts'), 'utf8');
  assert.doesNotMatch(serverSource, /buildCollectionsCardMeta/);
  const metaCalls = serverSource.match(/buildSkillCardMeta\(/g) ?? [];
  assert.equal(metaCalls.length, 2);
});

test('getActiveMcpTools excludes skill tools when DISABLE_SKILLS is true', () => {
  const prevDisable = process.env[DISABLE_SKILLS];
  const prevRouting = process.env[ENABLE_SKILL_ROUTING];
  process.env[DISABLE_SKILLS] = 'true';
  process.env[ENABLE_SKILL_ROUTING] = 'true';
  try {
    const tools = getActiveMcpTools({
      prefs: {
        ...DEFAULT_USER_MCP_PREFERENCES,
        skill_routing_enabled: true,
      },
    });
    const names = tools.map((t) => t.name);
    assert.equal(tools.length, 9);
    assert.ok(!names.includes('get_context_with_skills'));
    assert.ok(!names.includes('suggest_skills'));
    assert.ok(!names.includes('use_skill_in_chat'));
  } finally {
    if (prevDisable === undefined) delete process.env[DISABLE_SKILLS];
    else process.env[DISABLE_SKILLS] = prevDisable;
    if (prevRouting === undefined) delete process.env[ENABLE_SKILL_ROUTING];
    else process.env[ENABLE_SKILL_ROUTING] = prevRouting;
  }
});

test('listTools returns 9 core tools when DISABLE_SKILLS is true', async () => {
  const prevDisable = process.env[DISABLE_SKILLS];
  process.env[DISABLE_SKILLS] = 'true';
  try {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = await createMCPServer({ userId: 'uniformity-test-user' });
    const client = new Client({ name: 'uniformity-test', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.listTools();
      assert.equal(result.tools.length, 9);
      assert.ok(!result.tools.some((t) => t.name === 'suggest_skills'));
    } finally {
      await client.close();
      await server.close();
    }
  } finally {
    if (prevDisable === undefined) delete process.env[DISABLE_SKILLS];
    else process.env[DISABLE_SKILLS] = prevDisable;
  }
});
