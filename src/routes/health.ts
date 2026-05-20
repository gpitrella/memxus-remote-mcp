import { Request, Response } from 'express';

export function health(_req: Request, res: Response): void {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'aimemory-mcp-remote',
  });
}
