import { Request, Response } from 'express';
import { config } from '../config.js';
import { createPendingCode } from './codes.js';

export async function authorize(req: Request, res: Response): Promise<void> {
  const {
    client_id,
    redirect_uri,
    response_type,
    code_challenge,
    code_challenge_method = 'S256',
    state,
    scope = 'memories:read memories:write',
  } = req.query as Record<string, string | undefined>;

  if (response_type !== 'code') {
    res.status(400).json({ error: 'unsupported_response_type' });
    return;
  }
  if (!client_id || client_id !== config.OAUTH_CLIENT_ID) {
    res.status(400).json({ error: 'invalid_client' });
    return;
  }
  if (!redirect_uri || !config.ALLOWED_REDIRECT_URIS.includes(redirect_uri)) {
    res.status(400).json({ error: 'invalid_redirect_uri' });
    return;
  }
  if (!code_challenge) {
    res.status(400).json({ error: 'invalid_request', error_description: 'code_challenge required (PKCE)' });
    return;
  }
  if (code_challenge_method !== 'S256') {
    res.status(400).json({ error: 'invalid_request', error_description: 'only S256 supported' });
    return;
  }

  const ticket = await createPendingCode({
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method,
    scope,
    state: state ?? null,
  });

  const url = new URL(`${config.DASHBOARD_URL}/api/oauth/mcp/authorize`);
  url.searchParams.set('ticket', ticket);
  res.redirect(302, url.toString());
}
