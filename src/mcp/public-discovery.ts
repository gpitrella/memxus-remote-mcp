import { Request, Response, NextFunction } from 'express';
import { MCP_TOOLS } from './tool-schemas.js';
import { RESOURCES } from './resources.js';

const SERVER_INFO = { name: 'aimemory-remote', version: '1.0.3' } as const;
const PROTOCOL_VERSION = '2024-11-05';
const CAPABILITIES = { tools: {}, resources: {}, prompts: {} } as const;

const DISCOVERY_LIST_METHODS = new Set([
  'tools/list',
  'resources/list',
  'resources/templates/list',
  'prompts/list',
]);

function isJsonRpcMessage(body: unknown): body is { jsonrpc: '2.0'; method: string } {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return b.jsonrpc === '2.0' && typeof b.method === 'string';
}

function hasJsonRpcId(body: unknown): body is { id: string | number } {
  if (!body || typeof body !== 'object') return false;
  const id = (body as Record<string, unknown>).id;
  return typeof id === 'string' || typeof id === 'number';
}

function hasBearerAuth(req: Request): boolean {
  const auth = req.headers.authorization;
  return typeof auth === 'string' && auth.startsWith('Bearer ');
}

function getMcpSessionId(req: Request): string | undefined {
  const header = req.headers['mcp-session-id'];
  if (Array.isArray(header)) return header[0];
  return header;
}

function jsonRpcResult(id: string | number, result: unknown): object {
  return { jsonrpc: '2.0', result, id };
}

function respondDiscoveryList(method: string): unknown {
  switch (method) {
    case 'tools/list':
      return { tools: MCP_TOOLS };
    case 'resources/list':
      return { resources: RESOURCES };
    case 'resources/templates/list':
      return { resourceTemplates: [] };
    case 'prompts/list':
      return { prompts: [] };
    default:
      return null;
  }
}

/**
 * Handles MCP discovery/introspection without a full session so Glama probes
 * and post-OAuth catalog fetches succeed. Tool execution still requires
 * bearerAuth + a real MCP session via transport.
 */
export function mcpPublicDiscovery(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isJsonRpcMessage(req.body)) {
    next();
    return;
  }

  const { method } = req.body;
  const hasBearer = hasBearerAuth(req);
  const sessionId = getMcpSessionId(req);

  if (method.startsWith('notifications/')) {
    if (hasBearer && sessionId) {
      next();
      return;
    }
    res.status(202).end();
    return;
  }

  if (method === 'ping') {
    if (!hasJsonRpcId(req.body)) {
      next();
      return;
    }
    res.json(jsonRpcResult((req.body as { id: string | number }).id, {}));
    return;
  }

  if (DISCOVERY_LIST_METHODS.has(method)) {
    if (hasBearer && sessionId) {
      next();
      return;
    }
    if (!hasJsonRpcId(req.body)) {
      next();
      return;
    }
    const result = respondDiscoveryList(method);
    if (result === null) {
      next();
      return;
    }
    const id = (req.body as { id: string | number }).id;
    res.json(jsonRpcResult(id, result));
    return;
  }

  if (method === 'initialize') {
    if (hasBearer && !sessionId) {
      next();
      return;
    }
    if (!hasJsonRpcId(req.body)) {
      next();
      return;
    }
    const id = (req.body as { id: string | number }).id;
    res.json(
      jsonRpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: CAPABILITIES,
        serverInfo: SERVER_INFO,
      })
    );
    return;
  }

  next();
}
