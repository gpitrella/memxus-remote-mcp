import { Request, Response, NextFunction } from 'express';
import { MCP_TOOLS } from './tool-schemas.js';
import { RESOURCES } from './resources.js';

const SERVER_INFO = { name: 'aimemory-remote', version: '1.0.3' } as const;
const PROTOCOL_VERSION = '2024-11-05';
const CAPABILITIES = { tools: {}, resources: {}, prompts: {} } as const;

const DISCOVERY_METHODS = new Set([
  'initialize',
  'tools/list',
  'resources/list',
  'resources/templates/list',
  'prompts/list',
]);

function isJsonRpcDiscovery(
  body: unknown
): body is { jsonrpc: '2.0'; method: string; id: string | number } {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    b.jsonrpc === '2.0' &&
    typeof b.method === 'string' &&
    DISCOVERY_METHODS.has(b.method) &&
    (typeof b.id === 'string' || typeof b.id === 'number')
  );
}

function jsonRpcResult(id: string | number, result: unknown): object {
  return { jsonrpc: '2.0', result, id };
}

/**
 * Middleware that responds to unauthenticated MCP discovery/introspection
 * requests (initialize, tools/list, resources/list, prompts/list) with
 * static metadata. This lets Glama's automated health probe complete the
 * full MCP handshake without credentials.
 *
 * Authenticated requests (Bearer present) always pass through to the
 * normal auth + session flow. Non-discovery methods without auth also
 * pass through so bearerAuth rejects them with 401.
 */
export function mcpPublicDiscovery(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    next();
    return;
  }

  if (!isJsonRpcDiscovery(req.body)) {
    next();
    return;
  }

  const { method, id } = req.body;

  switch (method) {
    case 'initialize':
      res.json(
        jsonRpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: CAPABILITIES,
          serverInfo: SERVER_INFO,
        })
      );
      return;

    case 'tools/list':
      res.json(jsonRpcResult(id, { tools: MCP_TOOLS }));
      return;

    case 'resources/list':
      res.json(jsonRpcResult(id, { resources: RESOURCES }));
      return;

    case 'resources/templates/list':
      res.json(jsonRpcResult(id, { resourceTemplates: [] }));
      return;

    case 'prompts/list':
      res.json(jsonRpcResult(id, { prompts: [] }));
      return;

    default:
      next();
  }
}
