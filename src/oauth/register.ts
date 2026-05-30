import { Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { supabase } from '../lib/supabase.js';
import { validateRedirectUris } from '../lib/redirect-allowlist.js';

const registerSchema = z
  .object({
    redirect_uris: z.array(z.string().url()).min(1),
    token_endpoint_auth_method: z.string().optional().default('none'),
    client_name: z.string().optional(),
  })
  .passthrough();

function newClientId(): string {
  return `aimem_${randomBytes(16).toString('hex')}`;
}

export const _test = {
  registerSchema,
  newClientId,
};

export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_client_metadata' });
    return;
  }

  const { redirect_uris, token_endpoint_auth_method, client_name } = parsed.data;

  const redirectError = validateRedirectUris(redirect_uris);
  if (redirectError) {
    res.status(400).json({
      error: 'invalid_redirect_uri',
      error_description: redirectError,
    });
    return;
  }

  if (token_endpoint_auth_method !== 'none') {
    res.status(400).json({
      error: 'invalid_client_metadata',
      error_description: 'Only token_endpoint_auth_method="none" is supported',
    });
    return;
  }

  const client_id = newClientId();

  const { error } = await supabase.from('oauth_clients').insert({
    client_id,
    client_name: client_name ?? null,
    redirect_uris,
    token_endpoint_auth_method,
  });
  if (error) {
    res.status(500).json({ error: 'server_error' });
    return;
  }

  res.status(201).json({
    client_id,
    client_name: client_name ?? undefined,
    redirect_uris,
    token_endpoint_auth_method,
  });
}
