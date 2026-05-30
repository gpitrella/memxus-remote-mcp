import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toPublicMemory, toPublicMemories } from './memory-public.js';

describe('memory-public', () => {
  it('removes embedding from a memory row', () => {
    const row = {
      id: 'abc',
      content: 'hello',
      embedding: Array.from({ length: 1536 }, () => 0.1),
    };
    const out = toPublicMemory(row);
    assert.equal('embedding' in out, false);
    assert.equal(out.id, 'abc');
    assert.equal(out.content, 'hello');
  });

  it('maps arrays and handles empty input', () => {
    assert.deepEqual(toPublicMemories([]), []);
    const rows = [{ id: '1', embedding: [1, 2] }, { id: '2' }];
    const out = toPublicMemories(rows);
    assert.equal(out.length, 2);
    assert.equal('embedding' in out[0], false);
    assert.equal('embedding' in out[1], false);
  });
});
