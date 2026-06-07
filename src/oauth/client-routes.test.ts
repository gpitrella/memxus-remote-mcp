import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAUDE_REDIRECT_URIS,
  GLAMA_APP_REDIRECT_URI,
  GLAMA_INSPECTOR_REDIRECT_URI,
  SMITHERY_REDIRECT_URI,
  SMITHERY_REDIRECT_URIS,
  acceptsHtmlResponse,
  apiKeyNameForOAuthClient,
  isClaudeRedirectUri,
  isGlamaAppRedirectUri,
  isGlamaInspectorRedirectUri,
  isMarketplaceBrowserRedirectUri,
  isSmitheryRedirectUri,
  shouldServeAuthorizeHtmlLanding,
} from './client-routes.js';

test('redirect URI classifiers', () => {
  for (const uri of SMITHERY_REDIRECT_URIS) {
    assert.equal(isSmitheryRedirectUri(uri), true, uri);
  }
  assert.equal(isSmitheryRedirectUri(SMITHERY_REDIRECT_URI), true);
  assert.equal(isSmitheryRedirectUri(CLAUDE_REDIRECT_URIS[0]), false);
  assert.equal(isGlamaAppRedirectUri(GLAMA_APP_REDIRECT_URI), true);
  assert.equal(isGlamaInspectorRedirectUri(GLAMA_INSPECTOR_REDIRECT_URI), true);
  assert.equal(isGlamaInspectorRedirectUri(GLAMA_APP_REDIRECT_URI), false);
  assert.equal(isClaudeRedirectUri(CLAUDE_REDIRECT_URIS[0]), true);
  assert.equal(isClaudeRedirectUri(SMITHERY_REDIRECT_URI), false);
});

test('isMarketplaceBrowserRedirectUri covers Smithery and Glama app only', () => {
  assert.equal(isMarketplaceBrowserRedirectUri(SMITHERY_REDIRECT_URI), true);
  assert.equal(isMarketplaceBrowserRedirectUri(GLAMA_APP_REDIRECT_URI), true);
  assert.equal(isMarketplaceBrowserRedirectUri(CLAUDE_REDIRECT_URIS[0]), false);
});

test('shouldServeAuthorizeHtmlLanding is false for Option A (302 only)', () => {
  assert.equal(
    shouldServeAuthorizeHtmlLanding('text/html', SMITHERY_REDIRECT_URI),
    false
  );
  assert.equal(
    shouldServeAuthorizeHtmlLanding('text/html', CLAUDE_REDIRECT_URIS[0]),
    false
  );
});

test('acceptsHtmlResponse detects html accept', () => {
  assert.equal(acceptsHtmlResponse('text/html,application/json'), true);
  assert.equal(acceptsHtmlResponse('application/json'), false);
});

test('apiKeyNameForOAuthClient labels by redirect', () => {
  assert.match(
    apiKeyNameForOAuthClient('aimem_abcd', SMITHERY_REDIRECT_URI),
    /^Smithery /
  );
  assert.match(apiKeyNameForOAuthClient('aimem_abcd', GLAMA_APP_REDIRECT_URI), /^Glama /);
  assert.match(
    apiKeyNameForOAuthClient('aimem_abcd', GLAMA_INSPECTOR_REDIRECT_URI),
    /^Glama /
  );
  assert.match(
    apiKeyNameForOAuthClient('aimem_abcd', CLAUDE_REDIRECT_URIS[0]),
    /^Claude /
  );
  assert.match(
    apiKeyNameForOAuthClient('aimem_abcd', 'https://vscode.dev/redirect'),
    /^VS Code /
  );
  assert.match(
    apiKeyNameForOAuthClient('aimem_abcd', 'http://localhost:7777/oauth/callback'),
    /^Gemini CLI /
  );
});
