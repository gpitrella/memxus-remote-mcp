import { randomBytes } from 'crypto';
import { supabase } from '../lib/supabase.js';
import { hashApiKey } from '../lib/api-key.js';
import { config } from '../config.js';

export interface PendingCode {
  id: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  state: string | null;
}

export async function createPendingCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  state: string | null;
}): Promise<string> {
  const expiresAt = new Date(Date.now() + config.CODE_TTL_SECONDS * 1000).toISOString();
  const { data, error } = await supabase
    .from('oauth_codes')
    .insert({
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      code_challenge: input.codeChallenge,
      code_challenge_method: input.codeChallengeMethod,
      scope: input.scope,
      state: input.state,
      expires_at: expiresAt,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createPendingCode failed: ${error?.message ?? 'no row'}`);
  return data.id as string;
}

export async function getPending(id: string): Promise<PendingCode | null> {
  const { data, error } = await supabase
    .from('oauth_codes')
    .select('id, client_id, redirect_uri, code_challenge, code_challenge_method, scope, state, used_at, expires_at')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  if (data.used_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return {
    id: data.id,
    clientId: data.client_id,
    redirectUri: data.redirect_uri,
    codeChallenge: data.code_challenge,
    codeChallengeMethod: data.code_challenge_method,
    scope: data.scope,
    state: data.state,
  };
}

export interface ConsumedCode {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
}

export async function consumeCode(rawCode: string): Promise<ConsumedCode | null> {
  const codeHash = hashApiKey(rawCode);
  const { data, error } = await supabase
    .from('oauth_codes')
    .select('id, user_id, client_id, redirect_uri, code_challenge, code_challenge_method, scope, used_at, expires_at')
    .eq('code_hash', codeHash)
    .single();
  if (error || !data) return null;
  if (data.used_at) return null;
  if (!data.user_id) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  await supabase
    .from('oauth_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    userId: data.user_id as string,
    clientId: data.client_id,
    redirectUri: data.redirect_uri,
    codeChallenge: data.code_challenge,
    codeChallengeMethod: data.code_challenge_method,
    scope: data.scope,
  };
}

export function generateRawCode(): string {
  return randomBytes(32).toString('hex');
}
