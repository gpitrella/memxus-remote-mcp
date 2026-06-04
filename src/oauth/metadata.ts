import { Request, Response } from 'express';
import { config } from '../config.js';
import { chatgptOAuthEnabled } from './chatgpt-client.js';
import { buildProtectedResourceDocument } from './resource.js';

export function authorizationServerMetadata(_req: Request, res: Response): void {
  const tokenAuthMethods: string[] = ['none'];
  if (chatgptOAuthEnabled()) {
    tokenAuthMethods.push('client_secret_post');
  }

  res.json({
    issuer: config.MCP_PUBLIC_URL,
    authorization_endpoint: `${config.MCP_PUBLIC_URL}/oauth/authorize`,
    token_endpoint: `${config.MCP_PUBLIC_URL}/oauth/token`,
    registration_endpoint: `${config.MCP_PUBLIC_URL}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: tokenAuthMethods,
    scopes_supported: [...config.SUPPORTED_SCOPES],
  });
}

export function protectedResourceMetadata(_req: Request, res: Response): void {
  res.json(buildProtectedResourceDocument());
}
