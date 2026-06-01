import { Response, NextFunction } from 'express';
import { AuthedRequest } from '../lib/auth.js';

const store = new Map<string, { count: number; resetAt: number }>();

/** Per API key — high enough for normal MCP tool bursts during review. */
const LIMIT_PER_KEY = 90;
/** Fallback per IP when apiKeyId is missing (should not happen after bearerAuth). */
const LIMIT_PER_IP = 120;
const WINDOW_MS = 60 * 1000;

function clientIp(req: AuthedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function rateLimitKey(req: AuthedRequest): string {
  if (req.apiKeyId) return `key:${req.apiKeyId}`;
  return `ip:${clientIp(req)}`;
}

function limitForKey(key: string): number {
  return key.startsWith('key:') ? LIMIT_PER_KEY : LIMIT_PER_IP;
}

export function mcpRateLimit(req: AuthedRequest, res: Response, next: NextFunction): void {
  const key = rateLimitKey(req);
  const limit = limitForKey(key);
  const now = Date.now();

  let record = store.get(key);
  if (!record || record.resetAt < now) {
    record = { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, record);
  }

  record.count += 1;

  if (record.count > limit) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'too_many_requests',
      error_description: 'Rate limit exceeded. Try again later.',
    });
    return;
  }

  next();
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, record] of store.entries()) {
    if (record.resetAt < now) store.delete(k);
  }
}, WINDOW_MS);
cleanupTimer.unref();

/** @internal test helper */
export function _resetMcpRateLimitForTest(): void {
  store.clear();
}
