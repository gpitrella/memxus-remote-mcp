import test from 'node:test';
import assert from 'node:assert/strict';
import { isRedirectUriAllowed, validateRedirectUris } from './redirect-allowlist.js';
import { config } from '../config.js';

test('validateRedirectUris allows Claude callbacks when configured', () => {
  const claude = 'https://claude.ai/api/mcp/auth_callback';
  if (config.ALLOWED_REDIRECT_URIS.length === 0) {
    assert.equal(validateRedirectUris([claude]), null);
    return;
  }
  if (config.ALLOWED_REDIRECT_URIS.includes(claude)) {
    assert.equal(validateRedirectUris([claude]), null);
  }
});

test('validateRedirectUris rejects unknown URIs when allowlist is set', () => {
  if (config.ALLOWED_REDIRECT_URIS.length === 0) {
    assert.equal(isRedirectUriAllowed('https://evil.example/callback'), true);
    return;
  }
  const err = validateRedirectUris(['https://evil.example/callback']);
  assert.ok(err);
  assert.match(err!, /not allowed/);
});
