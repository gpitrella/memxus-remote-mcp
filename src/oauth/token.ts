import { Request, Response } from 'express';
import { consumeCode } from './codes.js';
import { verifyChallenge } from '../lib/pkce.js';
import { generateApiKey, hashApiKey, getApiKeyPrefix } from '../lib/api-key.js';
import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';

export async function token(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, string | undefined>;
  const grant_type = body.grant_type;
  const code = body.code;
  const code_verifier = body.code_verifier;
  const client_id = body.client_id;
  const redirect_uri = body.redirect_uri;

  if (grant_type !== 'authorization_code') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }
  if (!code || !code_verifier || !client_id || !redirect_uri) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  if (client_id !== config.OAUTH_CLIENT_ID) {
    res.status(400).json({ error: 'invalid_client' });
    return;
  }

  const consumed = await consumeCode(code);
  if (!consumed) {
    res.status(400).json({ error: 'invalid_grant' });
    return;
  }
  if (consumed.redirectUri !== redirect_uri) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    return;
  }
  if (!verifyChallenge(code_verifier, consumed.codeChallenge, consumed.codeChallengeMethod)) {
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
    name: workforceWorkspaceId
      ? `Claude Workforce (${consumed.clientId})`
      : `Claude (${consumed.clientId})`,
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
