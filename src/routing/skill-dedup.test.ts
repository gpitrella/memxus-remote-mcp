import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dedupeSkillsByName, normalizeSkillName } from './skill-dedup.js';
import type { RoutedSkill } from './types.js';

function mockSkill(partial: Partial<RoutedSkill> & Pick<RoutedSkill, 'name' | 'repo'>): RoutedSkill {
  return {
    id: partial.id ?? `${partial.repo}@${partial.name}`,
    description: '',
    owner: partial.repo.split('/')[0] ?? 'owner',
    skillId: partial.skillId ?? partial.name,
    instructionsRepo: partial.instructionsRepo ?? partial.repo,
    sourceUrl: '',
    installCommand: '',
    official: partial.official ?? false,
    score: partial.score ?? 0.5,
    reason: partial.reason ?? 'test',
    installs: partial.installs ?? 0,
    ...partial,
  };
}

describe('normalizeSkillName', () => {
  it('lowercases and trims', () => {
    assert.equal(normalizeSkillName('  Supabase Postgres  '), 'supabase postgres');
  });

  it('strips version suffix', () => {
    assert.equal(normalizeSkillName('my-skill@v2.1'), 'my-skill');
  });
});

describe('dedupeSkillsByName', () => {
  it('merges two community sources with same name into one', () => {
    const skills = dedupeSkillsByName([
      mockSkill({
        id: 'davila7/claude-code-templates@supabase-postgres-best-practices',
        name: 'supabase-postgres-best-practices',
        repo: 'davila7/claude-code-templates',
        installs: 100,
      }),
      mockSkill({
        id: 'secondsky/claude-skills@supabase-postgres-best-practices',
        name: 'supabase-postgres-best-practices',
        repo: 'secondsky/claude-skills',
        installs: 50,
      }),
    ]);
    assert.equal(skills.length, 1);
    assert.equal(skills[0]!.repo, 'davila7/claude-code-templates');
  });

  it('prefers official over community for same name', () => {
    const skills = dedupeSkillsByName([
      mockSkill({
        id: 'community/foo',
        name: 'react-patterns',
        repo: 'someone/skills',
        official: false,
        installs: 999,
        score: 0.9,
      }),
      mockSkill({
        id: 'official/foo',
        name: 'react-patterns',
        repo: 'anthropics/skills',
        official: true,
        installs: 0,
        score: 0.5,
      }),
    ]);
    assert.equal(skills.length, 1);
    assert.equal(skills[0]!.official, true);
  });

  it('is deterministic with 3+ duplicates', () => {
    const input = [
      mockSkill({ id: 'a', name: 'dup-skill', repo: 'z/z', installs: 10 }),
      mockSkill({ id: 'b', name: 'dup-skill', repo: 'a/a', installs: 10 }),
      mockSkill({ id: 'c', name: 'dup-skill', repo: 'm/m', installs: 20 }),
    ];
    const run1 = dedupeSkillsByName(input);
    const run2 = dedupeSkillsByName([...input].reverse());
    assert.equal(run1.length, 1);
    assert.equal(run1[0]!.repo, run2[0]!.repo);
    assert.equal(run1[0]!.repo, 'm/m');
  });

  it('prefers official upstream repo over mirror', () => {
    const skills = dedupeSkillsByName([
      mockSkill({
        id: 'davila7/claude-code-templates@supabase-postgres-best-practices',
        name: 'supabase-postgres-best-practices',
        repo: 'davila7/claude-code-templates',
        instructionsRepo: 'davila7/claude-code-templates',
        official: false,
        installs: 500,
      }),
      mockSkill({
        id: 'supabase/agent-skills@supabase-postgres-best-practices',
        name: 'supabase-postgres-best-practices',
        repo: 'davila7/claude-code-templates',
        instructionsRepo: 'supabase/agent-skills',
        official: false,
        installs: 1,
      }),
    ]);

    assert.equal(skills.length, 1);
    assert.equal(skills[0]!.instructionsRepo, 'supabase/agent-skills');
  });

  it('returns 1 skill when only 1 unique after dedup', () => {
    const skills = dedupeSkillsByName([
      mockSkill({ id: 'a', name: 'only-one', repo: 'x/y' }),
      mockSkill({ id: 'b', name: 'only-one', repo: 'z/w' }),
    ]);
    assert.equal(skills.length, 1);
  });
});
