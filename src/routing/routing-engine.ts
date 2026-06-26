import type { Intent, ProjectProfile, RoutedSkill } from './types.js';
import { listVerifiedSkills } from './skill-registry.js';

const SCORE_THRESHOLD = 0.35;
const MAX_SKILLS = 2;

function keywordScore(skillKeywords: string[], query: string): number {
  const q = query.toLowerCase();
  let hits = 0;
  for (const kw of skillKeywords) {
    if (q.includes(kw.toLowerCase())) hits += 1;
  }
  return hits > 0 ? Math.min(1, hits * 0.25) : 0;
}

export function routeSkills(input: {
  profile: ProjectProfile;
  intent: Intent;
  query: string;
}): RoutedSkill[] {
  const skills = listVerifiedSkills();
  const scored: RoutedSkill[] = [];

  for (const skill of skills) {
    const domainMatch = skill.appliesTo.domains.includes(input.profile.domain) ? 1 : 0;
    const intentMatch = skill.appliesTo.intents.includes(input.intent.action) ? 1 : 0;
    const kw = keywordScore(skill.appliesTo.keywords, input.query);

    const score =
      domainMatch * 0.4 * input.profile.confidence +
      intentMatch * 0.4 * input.intent.confidence +
      kw * 0.15 +
      skill.priority * 0.05;

    if (score < SCORE_THRESHOLD) continue;

    const reasons: string[] = [];
    if (domainMatch) reasons.push(`domain:${input.profile.domain}`);
    if (intentMatch) reasons.push(`intent:${input.intent.action}`);
    if (kw > 0) reasons.push('keyword match');

    scored.push({
      ...skill,
      score,
      reason: reasons.join(', ') || 'general match',
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const selected: RoutedSkill[] = [];
  for (const skill of scored) {
    if (selected.length >= MAX_SKILLS) break;
    const excluded = selected.some((s) => skill.excludes?.includes(s.id));
    const conflicts = selected.some((s) => s.excludes?.includes(skill.id));
    if (!excluded && !conflicts) selected.push(skill);
  }

  return selected;
}
