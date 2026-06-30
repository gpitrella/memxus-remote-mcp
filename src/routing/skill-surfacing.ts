import type { RoutedSkill } from './types.js';
import { classifyIntent } from './intent-classifier.js';
import {
  formatSuggestSkillsMessage,
  suggestSkillsForCollection,
} from './skill-suggest-service.js';

export const WORK_INTENTS = new Set(['build', 'review', 'fix', 'test']);

const SURFACE_CAP_TRIGGERS = new Set<SurfaceSkillsInput['trigger']>(['context', 'suggest']);

export type SurfaceSkillsInput = {
  trigger: 'post_sync' | 'onboarding' | 'recall' | 'assign_project' | 'suggest' | 'context';
  topic: string;
  collection?: string | null;
  memorySnippets?: string[];
  userId?: string;
};

export type SurfaceSkillsResult = {
  skills: RoutedSkill[];
  skillsMessage: string;
  discoveryDegraded: boolean;
  profile: ReturnType<typeof suggestSkillsForCollection> extends Promise<infer R> ? R['stack_detected'] : never;
  intent: ReturnType<typeof classifyIntent>;
  suggestions: ReturnType<typeof suggestSkillsForCollection> extends Promise<infer R> ? R['suggestions'] : never;
  presentation_hint: string;
};

export function rankSkillsForSurfacing(
  skills: RoutedSkill[],
  profile: { domain: string; stack: string[] },
  intent: { action: string },
  topN = 3,
): RoutedSkill[] {
  const scored = skills.map((skill) => {
    let score = 0;
    const domain = profile.domain.toLowerCase();
    const name = skill.name.toLowerCase();
    const reason = skill.reason.toLowerCase();
    const repo = skill.repo.toLowerCase();

    if (domain.length > 2 && (name.includes(domain) || reason.includes(domain))) {
      score += 0.5;
    }
    if (intent.action.length > 0 && (name.includes(intent.action) || reason.includes(intent.action))) {
      score += 0.4;
    }
    for (const token of profile.stack) {
      const t = token.toLowerCase();
      if (t.length > 2 && (name.includes(t) || reason.includes(t) || repo.includes(t))) {
        score += 0.1;
      }
    }

    return { skill, score };
  });

  scored.sort((a, b) => b.score - a.score || b.skill.score - a.skill.score);
  return scored.slice(0, topN).map((s) => s.skill);
}

export async function surfaceSkills(input: SurfaceSkillsInput): Promise<SurfaceSkillsResult> {
  const snippets = (input.memorySnippets ?? []).map((s) => s.slice(0, 500));
  const suggested = await suggestSkillsForCollection({
    userId: input.userId,
    topic: input.topic,
    collection: input.collection,
    memorySnippets: snippets,
  });

  const skills = SURFACE_CAP_TRIGGERS.has(input.trigger)
    ? suggested.skills.slice(0, 3)
    : suggested.skills;

  const triggerNote =
    input.trigger === 'post_sync'
      ? 'Based on your synced project snapshot:'
      : input.trigger === 'onboarding'
        ? 'Welcome — for your connected stack:'
        : input.trigger === 'assign_project'
          ? 'For your project collection:'
          : 'Based on your context:';

  const skillsMessage = formatSuggestSkillsMessage(
    { ...suggested, skills },
    `=== Suggested Skills ===\n${triggerNote}`,
  );

  return {
    skills,
    skillsMessage,
    discoveryDegraded: suggested.discovery_degraded,
    profile: suggested.stack_detected,
    intent: suggested.intent,
    suggestions: suggested.suggestions,
    presentation_hint: suggested.presentation_hint,
  };
}

export function shouldAppendSkillsForRecall(query: string, includeSkills?: boolean): boolean {
  if (includeSkills === false) return false;
  if (includeSkills === true) return true;
  const intent = classifyIntent(query);
  return WORK_INTENTS.has(intent.action);
}
