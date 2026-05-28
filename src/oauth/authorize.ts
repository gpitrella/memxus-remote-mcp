import { Request, Response } from 'express';
import { config } from '../config.js';
import { createPendingCode } from './codes.js';
import { supabase } from '../lib/supabase.js';

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
  if (!client_id) {
    res.status(400).json({ error: 'invalid_client' });
    return;
  }
  if (!redirect_uri) {
    res.status(400).json({ error: 'invalid_redirect_uri' });
    return;
  }

  const { data: client, error: clientError } = await supabase
    .from('oauth_clients')
    .select('client_id, redirect_uris')
    .eq('client_id', client_id)
    .maybeSingle();

  if (clientError || !client) {
    res.status(400).json({ error: 'invalid_client' });
    return;
  }
  if (!Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(redirect_uri)) {
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
