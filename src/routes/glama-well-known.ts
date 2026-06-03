import { Request, Response } from 'express';
import { config } from '../config.js';

export const GLAMA_CONNECTOR_SCHEMA = 'https://glama.ai/mcp/schemas/connector.json';

/** Payload for Glama connector ownership verification (/.well-known/glama.json). */
export function glamaConnectorDocument(email: string | undefined): Record<string, unknown> | null {
  const trimmed = email?.trim();
  if (!trimmed) return null;
  return {
    $schema: GLAMA_CONNECTOR_SCHEMA,
    maintainers: [{ email: trimmed }],
  };
}

export function glamaWellKnown(_req: Request, res: Response): void {
  const doc = glamaConnectorDocument(config.GLAMA_MAINTAINER_EMAIL);
  if (!doc) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(doc);
}
