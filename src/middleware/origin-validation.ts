import { Request, Response, NextFunction } from 'express';
import { isMcpOriginAllowed } from '../lib/mcp-origin-allowlist.js';

const MCP_CORS_METHODS = 'GET, POST, DELETE, OPTIONS';
const MCP_CORS_HEADERS = 'Content-Type, Authorization, mcp-session-id';

/** Reflect allowlisted Origin on MCP routes (Claude web); skip when Origin absent (Smithery, Cursor). */
export function setMcpCorsHeaders(res: Response, origin?: string): void {
  if (origin && isMcpOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', MCP_CORS_METHODS);
  res.setHeader('Access-Control-Allow-Headers', MCP_CORS_HEADERS);
}

export function mcpOriginValidation(req: Request, res: Response, next: NextFunction): void {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;

  if (req.method === 'OPTIONS') {
    setMcpCorsHeaders(res, origin);
    res.status(204).end();
    return;
  }

  if (!origin) {
    next();
    return;
  }

  if (!isMcpOriginAllowed(origin)) {
    res.status(403).json({ error: 'origin_not_allowed' });
    return;
  }

  setMcpCorsHeaders(res, origin);
  next();
}
