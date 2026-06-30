import type { Intent, ProjectProfile, RoutedSkill } from './types.js';
import { classifyIntent } from './intent-classifier.js';
import { profileProject } from './project-profiler.js';
import { discoverSkills, formatSkillsBlock } from './skill-discovery.js';

export const WORK_INTENTS = new Set(['build', 'review', 'fix', 'test']);

const SURFACE_CAP_TRIGGERS = new Set<SurfaceSkillsInput['trigger']>(['context', 'suggest']);

export type SurfaceSkillsInput = {
  trigger: 'post_sync' | 'onboarding' | 'recall' | 'assign_project' | 'suggest' | 'context';
  topic: string;
  collection?: string | null;
  memorySnippets?: string[];
};

export type SurfaceSkillsResult = {
  skills: RoutedSkill[];
  skillsMessage: string;
  discoveryDegraded: boolean;
  profile: ReturnType<typeof profileProject>;
  intent: ReturnType<typeof classifyIntent>;
};

export function rankSkillsForSurfacing(
  skills: RoutedSkill[],
  profile: ProjectProfile,
  intent: Intent,
  topN = 3
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
  const profile = profileProject({
    query: input.topic,
    collection: input.collection,
    memorySnippets: snippets,
  });
  const intent = classifyIntent(input.topic);
  const { skills: discovered, discoveryDegraded } = await discoverSkills({
    profile,
    intent,
    query: input.topic,
    memorySnippets: snippets,
  });

  const skills = SURFACE_CAP_TRIGGERS.has(input.trigger)
    ? rankSkillsForSurfacing(discovered, profile, intent)
    : discovered;

  const triggerNote =
    input.trigger === 'post_sync'
      ? 'Based on your synced project snapshot:'
      : input.trigger === 'onboarding'
        ? 'Welcome — for your connected stack:'
        : input.trigger === 'assign_project'
          ? 'For your project collection:'
          : 'Based on your context:';

  const skillsMessage = formatSkillsBlock(skills, `=== Suggested Official Skills (approval required) ===\n${triggerNote}`);

  return { skills, skillsMessage, discoveryDegraded, profile, intent };
}

export function shouldAppendSkillsForRecall(query: string, includeSkills?: boolean): boolean {
  if (includeSkills === false) return false;
  if (includeSkills === true) return true;
  const intent = classifyIntent(query);
  return WORK_INTENTS.has(intent.action);
}
