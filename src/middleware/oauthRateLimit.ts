import { Request, Response, NextFunction } from 'express';

const store = new Map<string, { count: number; resetAt: number }>();

const LIMIT = 20;
const WINDOW_MS = 60 * 1000;

function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function oauthRateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = clientKey(req);
  const now = Date.now();

  let record = store.get(key);
  if (!record || record.resetAt < now) {
    record = { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, record);
  }

  record.count += 1;

  if (record.count > LIMIT) {
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
  for (const [key, record] of store.entries()) {
    if (record.resetAt < now) store.delete(key);
  }
}, WINDOW_MS);
cleanupTimer.unref();
