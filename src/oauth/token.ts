import { Request, Response } from 'express';
import { consumeCode } from './codes.js';
import { verifyChallenge } from '../lib/pkce.js';
import { generateApiKey, hashApiKey, getApiKeyPrefix } from '../lib/api-key.js';
import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';
import { apiKeyNameForOAuthClient } from './client-routes.js';
import { isChatGptPkceBypass, resolveTokenRequirements } from './chatgpt-client.js';
import { isRedirectUriRegistered, redirectUrisMatch } from '../lib/redirect-allowlist.js';
import { validateOptionalResource } from './resource.js';

export async function token(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, string | undefined>;
  const grant_type = body.grant_type;
  const code = body.code;
  const code_verifier = body.code_verifier;
  const client_id = body.client_id;
  const redirect_uri = body.redirect_uri;
  const client_secret = body.client_secret;
  const resource = body.resource;

  if (grant_type !== 'authorization_code') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }
  if (!code || !client_id || !redirect_uri) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  const resourceCheck = validateOptionalResource(resource);
  if (!resourceCheck.ok) {
    res.status(400).json({
      error: resourceCheck.error,
      error_description: resourceCheck.error_description,
    });
    return;
  }

  const requirements = resolveTokenRequirements(client_id, code_verifier, client_secret);
  if (!requirements.ok) {
    const status = requirements.error === 'invalid_client' ? 401 : 400;
    res.status(status).json({
      error: requirements.error,
      ...(requirements.error_description
        ? { error_description: requirements.error_description }
        : {}),
    });
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
    res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    return;
  }

  const consumed = await consumeCode(code);
  if (!consumed) {
    res.status(400).json({ error: 'invalid_grant' });
    return;
  }
  if (!redirectUrisMatch(consumed.redirectUri, redirect_uri)) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    return;
  }

  if (requirements.requiresPkceVerifier) {
    if (
      !code_verifier ||
      !verifyChallenge(code_verifier, consumed.codeChallenge, consumed.codeChallengeMethod)
    ) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      return;
    }
  } else if (!isChatGptPkceBypass(consumed.codeChallenge, consumed.codeChallengeMethod)) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
    return;
  }

  await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('user_id', consumed.userId)
    .eq('oauth_client_id', consumed.clientId)
    .eq('is_active', true);

  const apiKey = generateApiKey();
  const oauthMeta = (consumed.metadata ?? {}) as Record<string, unknown>;
  const workforceWorkspaceId =
    typeof oauthMeta.workforce_workspace_id === 'string'
      ? oauthMeta.workforce_workspace_id
      : undefined;

  const keyMetadata: Record<string, unknown> = {
    source: 'oauth',
    issued_at: new Date().toISOString(),
  };
  if (workforceWorkspaceId) {
    keyMetadata.workforce_workspace_id = workforceWorkspaceId;
    keyMetadata.key_type = 'workforce';
  }

  const { error } = await supabase.from('api_keys').insert({
    user_id: consumed.userId,
    key_hash: hashApiKey(apiKey),
    key_prefix: getApiKeyPrefix(apiKey),
    name: apiKeyNameForOAuthClient(
      consumed.clientId,
      consumed.redirectUri,
      workforceWorkspaceId
    ),
    is_active: true,
    oauth_client_id: consumed.clientId,
    metadata: keyMetadata,
  });
  if (error) {
    res.status(500).json({ error: 'server_error', error_description: error.message });
    return;
  }

  res.json({
    access_token: apiKey,
    token_type: 'Bearer',
    expires_in: config.TOKEN_TTL_SECONDS,
    scope: consumed.scope,
  });
}
