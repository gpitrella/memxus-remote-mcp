import type { RoutedSkill } from './types.js';
import { isOfficialRepo } from '../lib/skill-upstream.js';

/** Internal discovery pool size — independent of final surfacing cap (2). */
export const DISCOVERY_POOL_SIZE = 12;

const VERSION_SUFFIX_RE = /(?:@v?\d[\d.]*)$/i;

export function normalizeSkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(VERSION_SUFFIX_RE, '')
    .replace(/\s+/g, ' ');
}

function compareSkillVariants(a: RoutedSkill, b: RoutedSkill): number {
  if (isOfficialRepo(a.instructionsRepo) !== isOfficialRepo(b.instructionsRepo)) {
    return isOfficialRepo(a.instructionsRepo) ? -1 : 1;
  }

  if (a.official !== b.official) return a.official ? -1 : 1;

  const installsA = a.installs ?? 0;
  const installsB = b.installs ?? 0;
  if (installsA !== installsB) return installsB - installsA;

  if (a.score !== b.score) return b.score - a.score;

  return a.repo.localeCompare(b.repo);
}

/**
 * Deduplicate skills by normalized name before the max-2 cap.
 * Tiebreak: official > community, then installs, then score, then repo (asc).
 */
export function dedupeSkillsByName(skills: RoutedSkill[]): RoutedSkill[] {
  const byName = new Map<string, RoutedSkill>();

  for (const skill of skills) {
    const key = normalizeSkillName(skill.name);
    const existing = byName.get(key);
    if (!existing || compareSkillVariants(skill, existing) < 0) {
      byName.set(key, skill);
    }
  }

  return skills.filter((skill) => byName.get(normalizeSkillName(skill.name)) === skill);
}
