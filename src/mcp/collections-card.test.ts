import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCollectionsCardMeta,
  buildCollectionsCardPayload,
  COLLECTIONS_CARD_RESOURCE_URI,
} from './collections-card.js';
import { buildCollectionsTemplate } from '../lib/user-facing-template.js';

test('buildCollectionsCardMeta returns ui meta when renderApps is true', () => {
  const meta = buildCollectionsCardMeta(true);
  assert.ok(meta);
  assert.deepEqual(meta, {
    ui: {
      resourceUri: COLLECTIONS_CARD_RESOURCE_URI,
      prefHeight: 380,
    },
  });
});

test('buildCollectionsCardMeta returns undefined when renderApps is false', () => {
  assert.equal(buildCollectionsCardMeta(false), undefined);
});

test('buildCollectionsCardPayload includes collections and actions', () => {
  const payload = buildCollectionsCardPayload({
    lang: 'es',
    collections: [
      { slug: 'project:memxus', name: 'Memxus', description: null, memoryCount: 12 },
    ],
    showMore: true,
    includeSkills: true,
    tokensSaved: 500,
  });

  assert.equal(payload.version, '1');
  assert.equal(payload.collections.length, 1);
  assert.equal(payload.showMore, true);
  assert.equal(payload.includeSkills, true);
  assert.equal(payload.tokensSaved, 500);
  assert.ok(payload.actions.selectLabel);
  assert.ok(payload.actions.showMoreLabel);
});

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
