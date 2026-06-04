import { config } from '../config.js';

/** Canonical MCP protected resource (RFC 8707 / MCP authorization). */
export function getMcpResourceUrl(): string {
  return `${config.MCP_PUBLIC_URL}/mcp`;
}

/** RFC 9728 path-based protected resource metadata URL for /mcp. */
export function getProtectedResourceMetadataUrl(): string {
  return `${config.MCP_PUBLIC_URL}/.well-known/oauth-protected-resource/mcp`;
}

export function buildProtectedResourceDocument(): Record<string, unknown> {
  return {
    resource: getMcpResourceUrl(),
    authorization_servers: [config.MCP_PUBLIC_URL],
    scopes_supported: [...config.SUPPORTED_SCOPES],
    bearer_methods_supported: ['header'],
  };
}

/** WWW-Authenticate for 401 on MCP routes (RFC 9728 Section 5.1). */
export function buildMcpWwwAuthenticate(error = 'invalid_token'): string {
  const metadataUrl = getProtectedResourceMetadataUrl();
  return `Bearer resource_metadata="${metadataUrl}", error="${error}"`;
}
