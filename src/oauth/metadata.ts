import { Request, Response } from 'express';
import { config } from '../config.js';
import { buildProtectedResourceDocument } from './resource.js';

export function authorizationServerMetadata(_req: Request, res: Response): void {
  res.json({
    issuer: config.MCP_PUBLIC_URL,
    authorization_endpoint: `${config.MCP_PUBLIC_URL}/oauth/authorize`,
    token_endpoint: `${config.MCP_PUBLIC_URL}/oauth/token`,
    registration_endpoint: `${config.MCP_PUBLIC_URL}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    // DCR is for public MCP clients (Claude, Smithery, Glama). ChatGPT uses pre-provisioned client + secret at /token.
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...config.SUPPORTED_SCOPES],
  });
}

export function protectedResourceMetadata(_req: Request, res: Response): void {
  res.json(buildProtectedResourceDocument());
}
