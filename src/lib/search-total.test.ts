import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isContextPoolExhausted, resolveSearchTotal } from './search-total.js';

describe('search-total', () => {
  it('resolveSearchTotal returns 0 when no results', () => {
    assert.equal(resolveSearchTotal(10, 0), 0);
  });

  it('resolveSearchTotal uses count RPC when available', () => {
    assert.equal(resolveSearchTotal(12, 5), 12);
  });

  it('resolveSearchTotal does not inflate total to limit when RPC fails', () => {
    assert.equal(resolveSearchTotal(null, 5), 5);
  });

  it('isContextPoolExhausted when shown across calls reaches total', () => {
    assert.equal(
      isContextPoolExhausted({
        returnedCount: 2,
        total: 5,
        excludedCount: 3,
        requestedLimit: 10,
      }),
      true,
    );
  });

  it('isContextPoolExhausted when returned fewer than requested limit', () => {
    assert.equal(
      isContextPoolExhausted({
        returnedCount: 5,
        total: 5,
        excludedCount: 0,
        requestedLimit: 10,
      }),
      true,
    );
  });

  it('isContextPoolExhausted false when more may exist', () => {
    assert.equal(
      isContextPoolExhausted({
        returnedCount: 3,
        total: 10,
        excludedCount: 0,
        requestedLimit: 10,
      }),
      false,
    );
  });

  it('isContextPoolExhausted false when expand batch does not cover total', () => {
    assert.equal(
      isContextPoolExhausted({
        returnedCount: 5,
        total: 20,
        excludedCount: 5,
        requestedLimit: 10,
      }),
      false,
    );
  });
});
