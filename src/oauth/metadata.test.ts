import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { authorizationServerMetadata } from './metadata.js';

function captureJson(handler: (req: Request, res: Response) => void): Record<string, unknown> {
  let payload: Record<string, unknown> = {};
  const res = {
    json(data: Record<string, unknown>) {
      payload = data;
      return res;
    },
  } as Response;
  handler({} as Request, res);
  return payload;
}

test('authorizationServerMetadata advertises refresh_token grant', () => {
  const doc = captureJson(authorizationServerMetadata);
  const grants = doc.grant_types_supported as string[];
  assert.ok(Array.isArray(grants));
  assert.ok(grants.includes('authorization_code'));
  assert.ok(grants.includes('refresh_token'));
});
