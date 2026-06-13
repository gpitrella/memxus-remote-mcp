import { generateApiKey, getApiKeyPrefix, hashApiKey } from '../lib/api-key.js';
import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';

export type RefreshTokenGrantResult =
  | { ok: true; accessToken: string; scope: string; userId: string }
  | { ok: false; error: string; error_description?: string };

const DEFAULT_OAUTH_SCOPE = config.SUPPORTED_SCOPES.join(' ');

export async function resolveRefreshTokenGrant(
  refreshToken: string,
  clientId: string
): Promise<RefreshTokenGrantResult> {
  if (!refreshToken || !clientId) {
    return { ok: false, error: 'invalid_request' };
  }

  const keyHash = hashApiKey(refreshToken);
  const { data: existing, error: lookupError } = await supabase
    .from('api_keys')
    .select('id, user_id, is_active, oauth_client_id, name, metadata')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (lookupError || !existing || existing.is_active === false) {
    return { ok: false, error: 'invalid_grant' };
  }
  if (existing.oauth_client_id !== clientId) {
    return { ok: false, error: 'invalid_grant', error_description: 'client mismatch' };
  }

  const newApiKey = generateApiKey();
  const metadata = (existing.metadata ?? {}) as Record<string, unknown>;

  const { error: deactivateError } = await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', existing.id);
  if (deactivateError) {
    return { ok: false, error: 'server_error', error_description: deactivateError.message };
  }

  const { error: insertError } = await supabase.from('api_keys').insert({
    user_id: existing.user_id,
    key_hash: hashApiKey(newApiKey),
    key_prefix: getApiKeyPrefix(newApiKey),
    name: existing.name,
    is_active: true,
    oauth_client_id: clientId,
    metadata: {
      ...metadata,
      source: 'oauth',
      refreshed_at: new Date().toISOString(),
    },
  });
  if (insertError) {
    return { ok: false, error: 'server_error', error_description: insertError.message };
  }

  return {
    ok: true,
    accessToken: newApiKey,
    scope: DEFAULT_OAUTH_SCOPE,
    userId: existing.user_id as string,
  };
}
