import { Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { supabase } from '../lib/supabase.js';
import { filterAllowedRedirectUris } from '../lib/redirect-allowlist.js';

const registerSchema = z
  .object({
    redirect_uris: z.array(z.string().url()).min(1),
    token_endpoint_auth_method: z.string().optional().default('none'),
    client_name: z.string().optional(),
    grant_types: z.array(z.string()).optional(),
    response_types: z.array(z.string()).optional(),
  })
  .passthrough();

function newClientId(): string {
  return `aimem_${randomBytes(16).toString('hex')}`;
}

export const _test = {
  registerSchema,
  newClientId,
  filterAllowedRedirectUris,
};

export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_client_metadata' });
    return;
  }

  const { redirect_uris, token_endpoint_auth_method, client_name } = parsed.data;
  const { allowed, rejected } = filterAllowedRedirectUris(redirect_uris);

  if (allowed.length === 0) {
    res.status(400).json({
      error: 'invalid_redirect_uri',
      error_description: `redirect_uri not allowed: ${rejected[0] ?? 'unknown'}`,
    });
    return;
  }

  if (rejected.length > 0 && process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.info('[oauth/register] filtered redirect_uris', {
      kept: allowed.length,
      rejected: rejected.length,
    });
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
    redirect_uris: allowed,
    token_endpoint_auth_method,
  });
  if (error) {
    res.status(500).json({ error: 'server_error' });
    return;
  }

  res.status(201).json({
    client_id,
    client_name: client_name ?? undefined,
    redirect_uris: allowed,
    token_endpoint_auth_method,
  });
}
