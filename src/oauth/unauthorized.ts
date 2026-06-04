import { Response } from 'express';
import { buildMcpWwwAuthenticate } from './resource.js';

export function sendMcpUnauthorized(
  res: Response,
  body: Record<string, unknown> = { error: 'invalid_token' }
): void {
  res.setHeader('WWW-Authenticate', buildMcpWwwAuthenticate());
  res.status(401).json(body);
}
