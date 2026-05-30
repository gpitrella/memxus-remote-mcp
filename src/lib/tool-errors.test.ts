import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { sanitizeToolError } from './tool-errors.js';

test('sanitizeToolError returns friendly message for ZodError', () => {
  const err = new z.ZodError([]);
  assert.equal(sanitizeToolError(err, 'remember'), 'Invalid tool arguments.');
});

test('sanitizeToolError hides internal errors in production', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const err = new Error('saveMemory: relation "memories" does not exist');
    const msg = sanitizeToolError(err, 'remember');
    assert.equal(msg, 'The remember operation failed. Please try again.');
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('sanitizeToolError preserves Memory not found', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.equal(sanitizeToolError(new Error('Memory not found'), 'forget'), 'Memory not found');
  } finally {
    process.env.NODE_ENV = prev;
  }
});
