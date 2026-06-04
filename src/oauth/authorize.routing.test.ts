import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAUDE_REDIRECT_URIS,
  GLAMA_APP_REDIRECT_URI,
  SMITHERY_REDIRECT_URI,
  shouldServeAuthorizeHtmlLanding,
} from './client-routes.js';
import { buildDashboardAuthorizeUrl } from './authorize.js';

test('buildDashboardAuthorizeUrl points at dashboard MCP authorize', () => {
  const url = new URL(buildDashboardAuthorizeUrl('ticket-abc'));
  assert.match(url.pathname, /\/api\/oauth\/mcp\/authorize$/);
  assert.equal(url.searchParams.get('ticket'), 'ticket-abc');
});

test('Claude, Smithery, and Glama use 302 path (no HTML landing in Option A)', () => {
  for (const uri of [
    CLAUDE_REDIRECT_URIS[0],
    SMITHERY_REDIRECT_URI,
    GLAMA_APP_REDIRECT_URI,
  ]) {
    assert.equal(shouldServeAuthorizeHtmlLanding('text/html', uri), false);
  }
});
