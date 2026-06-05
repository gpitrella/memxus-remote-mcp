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

function firstZodIssueMessage(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'invalid client metadata';
  const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}

function logDcrRejection(details: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== 'production') return;
  // eslint-disable-next-line no-console
  console.info('[oauth/register] rejected', details);
}

/** DCR registers public MCP clients only (PKCE, no client_secret). */
export function dcrPersistedAuthMethod(requested: string | undefined): 'none' {
  if (requested !== undefined && requested !== 'none' && process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.info('[oauth/register] coerced token_endpoint_auth_method to none', {
      requested,
    });
  }
  return 'none';
}

export const _test = {
  registerSchema,
  newClientId,
  filterAllowedRedirectUris,
  dcrPersistedAuthMethod,
  firstZodIssueMessage,
};

export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const error_description = firstZodIssueMessage(parsed.error);
    logDcrRejection({ error: 'invalid_client_metadata', error_description });
    res.status(400).json({ error: 'invalid_client_metadata', error_description });
    return;
  }

  const { redirect_uris, token_endpoint_auth_method, client_name } = parsed.data;
  const { allowed, rejected } = filterAllowedRedirectUris(redirect_uris);

  if (allowed.length === 0) {
    const sample = rejected[0] ?? 'unknown';
    const error_description = `redirect_uri not allowed: ${sample}`;
    logDcrRejection({
      error: 'invalid_redirect_uri',
      error_description,
      rejected_count: rejected.length,
    });
    res.status(400).json({
      error: 'invalid_redirect_uri',
      error_description,
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

  const persistedAuthMethod = dcrPersistedAuthMethod(token_endpoint_auth_method);
  const client_id = newClientId();

  const { error } = await supabase.from('oauth_clients').insert({
    client_id,
    client_name: client_name ?? null,
    redirect_uris: allowed,
    token_endpoint_auth_method: persistedAuthMethod,
  });
  if (error) {
    res.status(500).json({ error: 'server_error' });
    return;
  }

  res.status(201).json({
    client_id,
    client_name: client_name ?? undefined,
    redirect_uris: allowed,
    token_endpoint_auth_method: persistedAuthMethod,
  });
}
