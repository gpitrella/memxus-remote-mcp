import { Request, Response, NextFunction } from 'express';
import { sendMcpUnauthorized } from '../oauth/unauthorized.js';
import { supabase } from './supabase.js';
import { hashApiKey } from './api-key.js';

export interface AuthedRequest extends Request {
  userId?: string;
  apiKeyId?: string;
  workforceWorkspaceId?: string;
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

  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  next();
}
