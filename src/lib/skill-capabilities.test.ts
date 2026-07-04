import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCapabilities, type McpHandshakeContext } from './skill-capabilities.js';

function hs(partial: McpHandshakeContext): McpHandshakeContext {
  return partial;
}

test('resolveCapabilities enables renderApps for spec-compliant UI extension', () => {
  const caps = resolveCapabilities(
    hs({
      negotiatedExtensions: ['io.modelcontextprotocol/ui'],
      extensionsDetail: {
        'io.modelcontextprotocol/ui': {
          mimeTypes: ['text/html;profile=mcp-app'],
        },
      },
    }),
  );
  assert.equal(caps.renderApps, true);
});

test('resolveCapabilities rejects UI extension when mimeType does not match', () => {
  const caps = resolveCapabilities(
    hs({
      negotiatedExtensions: ['io.modelcontextprotocol/ui'],
      extensionsDetail: {
        'io.modelcontextprotocol/ui': {
          mimeTypes: ['text/html'],
        },
      },
    }),
  );
  assert.equal(caps.renderApps, false);
});

test('resolveCapabilities enables renderApps for legacy mcp_apps negotiated key', () => {
  const caps = resolveCapabilities(
    hs({
      negotiatedExtensions: ['mcp_apps'],
    }),
  );
  assert.equal(caps.renderApps, true);
});

test('resolveCapabilities enables renderApps for experimental client flags', () => {
  const caps = resolveCapabilities(
    hs({
      clientCapabilities: {
        experimental: { mcp_apps: true },
      },
    }),
  );
  assert.equal(caps.renderApps, true);
});

test('resolveCapabilities disables renderApps without handshake', () => {
  const caps = resolveCapabilities(undefined);
  assert.equal(caps.renderApps, false);
});
