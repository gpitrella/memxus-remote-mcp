import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterAllowedRedirectUris,
  isKnownMcpRedirectUri,
  isLoopbackMcpCallback,
  isRedirectUriAllowed,
  isRedirectUriRegistered,
  loopbackRedirectUrisMatch,
  redirectUrisMatch,
  validateRedirectUris,
  vsCodeLoopbackRedirectUrisMatch,
} from './redirect-allowlist.js';
import {
  CLAUDE_REDIRECT_URIS,
  GLAMA_APP_REDIRECT_URI,
  GLAMA_INSPECTOR_REDIRECT_URI,
  VS_CODE_REDIRECT_URIS,
  isVsCodeLoopbackRedirect,
} from '../oauth/client-routes.js';
import { config } from '../config.js';

test('isLoopbackMcpCallback accepts localhost and 127.0.0.1 with /callback', () => {
  assert.equal(isLoopbackMcpCallback('http://127.0.0.1:54321/callback'), true);
  assert.equal(isLoopbackMcpCallback('http://localhost/callback'), true);
  assert.equal(isLoopbackMcpCallback('https://claude.ai/api/mcp/auth_callback'), false);
  assert.equal(isLoopbackMcpCallback('http://127.0.0.1:54321/other'), false);
});

test('loopbackRedirectUrisMatch ignores port', () => {
  assert.equal(
    loopbackRedirectUrisMatch('http://127.0.0.1:54321/callback', 'http://127.0.0.1/callback'),
    true
  );
  assert.equal(
    loopbackRedirectUrisMatch('http://localhost:8080/callback', 'http://localhost/callback'),
    true
  );
  assert.equal(
    loopbackRedirectUrisMatch('http://127.0.0.1/callback', 'http://localhost/callback'),
    false
  );
});

test('redirectUrisMatch exact and loopback', () => {
  assert.equal(
    redirectUrisMatch('https://claude.ai/api/mcp/auth_callback', 'https://claude.ai/api/mcp/auth_callback'),
    true
  );
  assert.equal(
    redirectUrisMatch('http://127.0.0.1:9999/callback', 'http://127.0.0.1/callback'),
    true
  );
});

test('isRedirectUriRegistered matches loopback with different ports', () => {
  const registered = ['https://claude.ai/api/mcp/auth_callback', 'http://127.0.0.1/callback'];
  assert.equal(isRedirectUriRegistered('http://127.0.0.1:61789/callback', registered), true);
  assert.equal(isRedirectUriRegistered('https://claude.ai/api/mcp/auth_callback', registered), true);
  assert.equal(isRedirectUriRegistered('https://evil.example/callback', registered), false);
});

test('redirectUrisMatch cross-matches Glama app and inspector callbacks', () => {
  assert.equal(redirectUrisMatch(GLAMA_INSPECTOR_REDIRECT_URI, GLAMA_APP_REDIRECT_URI), true);
  assert.equal(redirectUrisMatch(GLAMA_APP_REDIRECT_URI, GLAMA_INSPECTOR_REDIRECT_URI), true);
});

test('isRedirectUriRegistered accepts Glama inspector when client registered app callback', () => {
  assert.equal(isRedirectUriRegistered(GLAMA_INSPECTOR_REDIRECT_URI, [GLAMA_APP_REDIRECT_URI]), true);
  assert.equal(isRedirectUriRegistered(GLAMA_APP_REDIRECT_URI, [GLAMA_INSPECTOR_REDIRECT_URI]), true);
});

test('isRedirectUriRegistered accepts Glama loopback when client has official callback', () => {
  assert.equal(
    isRedirectUriRegistered('http://127.0.0.1:17341/callback', [GLAMA_INSPECTOR_REDIRECT_URI]),
    true
  );
});

test('isRedirectUriRegistered rejects loopback for non-Glama clients', () => {
  assert.equal(
    isRedirectUriRegistered('http://127.0.0.1:17341/callback', [CLAUDE_REDIRECT_URIS[0]]),
    false
  );
});

test('isVsCodeLoopbackRedirect accepts 127.0.0.1 root path only', () => {
  assert.equal(isVsCodeLoopbackRedirect('http://127.0.0.1:33418'), true);
  assert.equal(isVsCodeLoopbackRedirect('http://127.0.0.1:33418/'), true);
  assert.equal(isVsCodeLoopbackRedirect('http://127.0.0.1:54321/callback'), false);
  assert.equal(isVsCodeLoopbackRedirect('https://vscode.dev/redirect'), false);
});

test('vsCodeLoopbackRedirectUrisMatch ignores port on root path', () => {
  assert.equal(
    vsCodeLoopbackRedirectUrisMatch('http://127.0.0.1:33418', 'http://127.0.0.1:61789'),
    true
  );
  assert.equal(
    vsCodeLoopbackRedirectUrisMatch('http://127.0.0.1:33418', 'http://127.0.0.1:54321/callback'),
    false
  );
});

test('isKnownMcpRedirectUri includes VS Code gallery callbacks', () => {
  for (const uri of VS_CODE_REDIRECT_URIS) {
    assert.equal(isKnownMcpRedirectUri(uri), true, uri);
  }
});

test('isRedirectUriRegistered matches VS Code loopback with different ports', () => {
  const registered = [VS_CODE_REDIRECT_URIS[1]];
  assert.equal(isRedirectUriRegistered('http://127.0.0.1:61789', registered), true);
  assert.equal(isRedirectUriRegistered('https://vscode.dev/redirect', registered), false);
});

test('redirectUrisMatch cross-matches VS Code loopback ports', () => {
  assert.equal(redirectUrisMatch('http://127.0.0.1:61789', VS_CODE_REDIRECT_URIS[1]), true);
  assert.equal(redirectUrisMatch('https://vscode.dev/redirect', VS_CODE_REDIRECT_URIS[0]), true);
});

test('isKnownMcpRedirectUri includes Smithery run and Connect callbacks', () => {
  assert.equal(isKnownMcpRedirectUri('https://smithery.run/oauth/callback'), true);
  assert.equal(isKnownMcpRedirectUri('https://smithery.ai/oauth/callback'), true);
  assert.equal(isKnownMcpRedirectUri('https://smithery.ai/connect/callback'), true);
  assert.equal(isKnownMcpRedirectUri('https://auth.smithery.ai/connect'), true);
});

test('filterAllowedRedirectUris keeps Claude and loopback, drops unknown', () => {
  const claude = 'https://claude.ai/api/mcp/auth_callback';
  const { allowed, rejected } = filterAllowedRedirectUris([
    claude,
    'http://127.0.0.1:54321/callback',
    'https://evil.example/callback',
  ]);
  if (config.ALLOWED_REDIRECT_URIS.length === 0) {
    assert.deepEqual(allowed, [
      claude,
      'http://127.0.0.1:54321/callback',
      'https://evil.example/callback',
    ]);
    assert.equal(rejected.length, 0);
    return;
  }
  assert.ok(allowed.includes(claude));
  assert.ok(allowed.includes('http://127.0.0.1:54321/callback'));
  assert.ok(rejected.includes('https://evil.example/callback'));
});

test('validateRedirectUris allows Claude callbacks when configured', () => {
  const claude = 'https://claude.ai/api/mcp/auth_callback';
  if (config.ALLOWED_REDIRECT_URIS.length === 0) {
    assert.equal(validateRedirectUris([claude]), null);
    return;
  }
  if (config.ALLOWED_REDIRECT_URIS.includes(claude) || isRedirectUriAllowed(claude)) {
    assert.equal(validateRedirectUris([claude]), null);
  }
});

test('validateRedirectUris rejects when no URIs are allowed', () => {
  if (config.ALLOWED_REDIRECT_URIS.length === 0) {
    assert.equal(isRedirectUriAllowed('https://evil.example/callback'), true);
    return;
  }
  const err = validateRedirectUris(['https://evil.example/callback']);
  assert.ok(err);
  assert.match(err!, /not allowed/);
});

test('validateRedirectUris passes when at least one URI is allowed', () => {
  if (config.ALLOWED_REDIRECT_URIS.length === 0) return;
  const claude = 'https://claude.ai/api/mcp/auth_callback';
  if (!isRedirectUriAllowed(claude)) return;
  assert.equal(
    validateRedirectUris([claude, 'https://evil.example/callback']),
    null
  );
});
