import { Request, Response } from 'express';

import { MCP_TOOLS } from '../mcp/tool-schemas.js';

export function mcpHealth(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    protocol: 'mcp',
    version: '2024-11-05',
    transport: 'streamable-http',
    auth: 'oauth2',
    name: 'Memxus',
    tools_count: MCP_TOOLS.length,
  });
}

