import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractContextBullets,
  formatContextCompletenessLine,
  sanitizeBulletText,
} from './context-bullets.js';

describe('context-bullets', () => {
  it('sanitizeBulletText neutralizes backticks', () => {
    assert.equal(sanitizeBulletText('use `npm install` here'), 'use npm install here');
  });

  it('does not pad bullets when only one fact exists', () => {
    const bullets = extractContextBullets({
      contextBlock: '[1] [NOTE] Stack: Next.js 15',
      memories: [{ id: 'a', content: 'Stack: Next.js 15' }],
      maxBullets: 3,
    });
    assert.equal(bullets.length, 1);
  });

  it('deduplicates bullets with same content hash', () => {
    const bullets = extractContextBullets({
      contextBlock: '[1] [NOTE] Same fact\n[2] [NOTE] Same fact',
      memories: [
        { id: 'a', content: 'Same fact' },
        { id: 'b', content: 'Same fact' },
      ],
    });
    assert.equal(bullets.length, 1);
  });

  it('formatContextCompletenessLine handles N === total', () => {
    assert.match(
      formatContextCompletenessLine(3, 3, 'auth'),
      /las 3 memorias que tengo guardadas/,
    );
  });

  it('formatContextCompletenessLine handles N < total', () => {
    assert.match(
      formatContextCompletenessLine(5, 12, 'auth'),
      /5 más relevantes de 12 guardadas/,
    );
  });

  it('formatContextCompletenessLine handles single memory', () => {
    assert.match(
      formatContextCompletenessLine(1, 1, 'auth'),
      /única memoria/,
    );
  });
});
