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
    resource_documentation: 'https://www.memxus.com/docs/mcp',
  };
}

/** WWW-Authenticate for 401 on MCP routes (RFC 9728 Section 5.1). */
export function buildMcpWwwAuthenticate(error = 'invalid_token'): string {
  const metadataUrl = getProtectedResourceMetadataUrl();
  return `Bearer resource_metadata="${metadataUrl}", error="${error}"`;
}

export type ResourceValidationResult =
  | { ok: true; resource?: string }
  | { ok: false; error: string; error_description: string };

/** RFC 8707: validate resource when client sends it; omit = allowed for legacy clients. */
export function validateOptionalResource(resource: string | undefined): ResourceValidationResult {
  if (resource === undefined || resource.trim() === '') {
    return { ok: true };
  }
  const expected = getMcpResourceUrl();
  if (resource === expected) {
    return { ok: true, resource: expected };
  }
  return {
    ok: false,
    error: 'invalid_target',
    error_description: `resource must be ${expected}`,
  };
}
