import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMcpWwwAuthenticate,
  buildProtectedResourceDocument,
  getMcpResourceUrl,
  getProtectedResourceMetadataUrl,
  validateOptionalResource,
} from './resource.js';
import { config } from '../config.js';

test('getMcpResourceUrl ends with /mcp', () => {
  assert.equal(getMcpResourceUrl(), `${config.MCP_PUBLIC_URL}/mcp`);
  assert.ok(getMcpResourceUrl().endsWith('/mcp'));
});

test('getProtectedResourceMetadataUrl uses path-based well-known for /mcp', () => {
  assert.equal(
    getProtectedResourceMetadataUrl(),
    `${config.MCP_PUBLIC_URL}/.well-known/oauth-protected-resource/mcp`
  );
});

test('buildProtectedResourceDocument uses MCP resource URL', () => {
  const doc = buildProtectedResourceDocument();
  assert.equal(doc.resource, getMcpResourceUrl());
  assert.deepEqual(doc.authorization_servers, [config.MCP_PUBLIC_URL]);
  assert.ok(Array.isArray(doc.scopes_supported));
  assert.equal(doc.resource_documentation, 'https://www.memxus.com/docs/mcp');
});

test('validateOptionalResource allows absent resource', () => {
  assert.deepEqual(validateOptionalResource(undefined), { ok: true });
  assert.deepEqual(validateOptionalResource(''), { ok: true });
});

test('validateOptionalResource accepts MCP resource URL', () => {
  const res = validateOptionalResource(getMcpResourceUrl());
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.resource, getMcpResourceUrl());
});

test('validateOptionalResource rejects wrong resource', () => {
  const res = validateOptionalResource('https://evil.example/mcp');
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error, 'invalid_target');
});

test('buildMcpWwwAuthenticate includes resource_metadata', () => {
  const header = buildMcpWwwAuthenticate();
  assert.match(header, /^Bearer /);
  assert.match(header, /resource_metadata="/);
  assert.ok(header.includes(getProtectedResourceMetadataUrl()));
  assert.match(header, /error="invalid_token"/);
});
