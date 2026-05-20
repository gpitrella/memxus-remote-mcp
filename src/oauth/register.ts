import { Request, Response } from 'express';
import { config } from '../config.js';

export function register(_req: Request, res: Response): void {
  res.status(501).json({
    error: 'not_implemented',
    error_description: `Dynamic Client Registration disabled. Use the pre-registered client_id "${config.OAUTH_CLIENT_ID}".`,
  });
}
