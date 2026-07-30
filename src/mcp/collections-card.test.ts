import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCollectionsPickerToolResult,
} from './collections-card.js';
import { buildCollectionsTemplate } from '../lib/user-facing-template.js';

test('buildCollectionsTemplate renders numbered collections with show more hint', () => {
  const text = buildCollectionsTemplate({
    lang: 'es',
    collections: [
      { slug: 'project:memxus', name: 'Memxus', description: 'MCP server', memoryCount: 12 },
    ],
    showMore: true,
    tokensSaved: 1200,
  });

  assert.match(text, /COLECCIONES/);
  assert.match(text, /project:memxus/);
  assert.match(text, /Ver más/);
  assert.match(text, /1,?200/);
});

test('buildCollectionsPickerToolResult returns plain text without card meta', () => {
  const result = buildCollectionsPickerToolResult({
    lang: 'es',
    collections: [
      { slug: 'project:memxus', name: 'Memxus', description: null, memoryCount: 3 },
    ],
    showMore: false,
    showAll: false,
    includeSkills: false,
    caps: {
      surface: 'web',
      renderApps: true,
      canInstall: false,
      canUseInChat: true,
      hostSkipAction: false,
      compactLayout: false,
    },
  });
  assert.equal(result._meta, undefined);
  assert.match(String(result.content[0]?.text), /project:memxus/);
});
