import { Request, Response, NextFunction } from 'express';
import { sendMcpUnauthorized } from '../oauth/unauthorized.js';
import { supabase } from './supabase.js';
import { hashApiKey } from './api-key.js';

export interface BearerAuthContext {
  userId: string;
  apiKeyId: string;
  workforceWorkspaceId?: string;
  oauthScope?: string;
  isOAuthToken?: boolean;
}

export async function resolveBearerAuthContext(
  req: Request
): Promise<BearerAuthContext | null> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;

  const token = auth.slice('Bearer '.length).trim();
  const keyHash = hashApiKey(token);

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, is_active, metadata')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (error || !data || data.is_active === false) return null;

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const ctx: BearerAuthContext = {
    userId: data.user_id as string,
    apiKeyId: data.id as string,
  };
  if (typeof metadata.workforce_workspace_id === 'string') {
    ctx.workforceWorkspaceId = metadata.workforce_workspace_id;
  }
  if (metadata.source === 'oauth') {
    ctx.isOAuthToken = true;
    if (typeof metadata.oauth_scope === 'string') {
      ctx.oauthScope = metadata.oauth_scope;
    }
  }
  return ctx;
}

export interface AuthedRequest extends Request {
  userId?: string;
  apiKeyId?: string;
  workforceWorkspaceId?: string;
  oauthScope?: string;
  isOAuthToken?: boolean;
}

export async function bearerAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    sendMcpUnauthorized(res, {
      error: 'invalid_token',
      error_description: 'Missing bearer token',
    });
    return;
  }

  const token = auth.slice('Bearer '.length).trim();
  const keyHash = hashApiKey(token);

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, is_active, metadata')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data || data.is_active === false) {
    sendMcpUnauthorized(res);
    return;
  }

  req.userId = data.user_id;
  req.apiKeyId = data.id;

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  if (typeof metadata.workforce_workspace_id === 'string') {
    req.workforceWorkspaceId = metadata.workforce_workspace_id;
  }
  if (metadata.source === 'oauth') {
    req.isOAuthToken = true;
    if (typeof metadata.oauth_scope === 'string') {
      req.oauthScope = metadata.oauth_scope;
    }
  }

  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  next();
}
