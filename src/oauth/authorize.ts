import { Request, Response } from 'express';
import { config } from '../config.js';
import { createPendingCode } from './codes.js';
import { supabase } from '../lib/supabase.js';
import {
  isChatGptOAuthClient,
  isChatGptRedirectUri,
  resolveAuthorizePkce,
} from './chatgpt-client.js';
import { isRedirectUriRegistered } from '../lib/redirect-allowlist.js';
import { shouldServeAuthorizeHtmlLanding } from './client-routes.js';

export function buildDashboardAuthorizeUrl(ticket: string): string {
  const url = new URL(`${config.DASHBOARD_URL}/api/oauth/mcp/authorize`);
  url.searchParams.set('ticket', ticket);
  return url.toString();
}

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

  const pkce = resolveAuthorizePkce(client_id, code_challenge, code_challenge_method);
  if (!pkce.ok) {
    res.status(400).json({ error: pkce.error, error_description: pkce.error_description });
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
  if (
    !Array.isArray(client.redirect_uris) ||
    !isRedirectUriRegistered(redirect_uri, client.redirect_uris)
  ) {
    res.status(400).json({ error: 'invalid_redirect_uri' });
    return;
  }

  if (isChatGptOAuthClient(client_id) && !isChatGptRedirectUri(redirect_uri)) {
    res.status(400).json({ error: 'invalid_redirect_uri' });
    return;
  }

  const ticket = await createPendingCode({
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: pkce.codeChallenge,
    codeChallengeMethod: pkce.codeChallengeMethod,
    scope,
    state: state ?? null,
  });

  const dashboardUrl = buildDashboardAuthorizeUrl(ticket);

  // Option A: 302 for Claude, Smithery, Glama, and ChatGPT (dashboard handles Google sign-in).
  if (
    shouldServeAuthorizeHtmlLanding(
      typeof req.headers.accept === 'string' ? req.headers.accept : undefined,
      redirect_uri
    )
  ) {
    res.status(501).json({ error: 'html_authorize_not_enabled' });
    return;
  }

  res.redirect(302, dashboardUrl);
}
