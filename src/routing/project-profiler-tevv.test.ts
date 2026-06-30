import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectStack,
  extractBannedTokensFromCollection,
  MIN_STACK_CONFIDENCE,
} from './project-profiler.js';

describe('project-profiler anti-TEVV', () => {
  it('does not infer stack from collection slug alone (portfolio hubspot false positive)', () => {
    const profile = detectStack({
      query: 'trae detalle de la API',
      collection: 'project:diana-test-centre-portfolio',
      memorySnippets: [],
    });
    assert.ok(profile.confidence < MIN_STACK_CONFIDENCE);
    assert.equal(profile.cms, null);
    assert.equal(profile.framework, null);
  });

  it('detects HubSpot CMS from memory content, not collection name', () => {
    const profile = detectStack({
      query: 'theme modules',
      collection: 'project:diana-test-centre-portfolio',
      memorySnippets: [
        'HubSpot CMS theme with modules/hubspot-form.module',
        'theme.json fields.json hubl templates',
        'TypeScript React components in @hubspot/cms-components',
        'package.json not present — CMS only',
      ],
    });
    assert.equal(profile.cms, 'HubSpot CMS');
    assert.ok(profile.confidence >= MIN_STACK_CONFIDENCE);
    assert.ok(profile.stack.includes('hubspot'));
  });

  it('extractBannedTokensFromCollection splits slug tokens', () => {
    const banned = extractBannedTokensFromCollection('project:diana-test-centre-portfolio');
    assert.ok(banned.includes('portfolio'));
    assert.ok(banned.includes('diana'));
    assert.ok(banned.includes('centre'));
  });
});
