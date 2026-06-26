import type { RoutedSkill } from './types.js';
import { classifyIntent } from './intent-classifier.js';
import { profileProject } from './project-profiler.js';
import { discoverSkills, formatSkillsBlock } from './skill-discovery.js';

export const WORK_INTENTS = new Set(['build', 'review', 'fix', 'test']);

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

export async function surfaceSkills(input: SurfaceSkillsInput): Promise<SurfaceSkillsResult> {
  const snippets = (input.memorySnippets ?? []).map((s) => s.slice(0, 500));
  const profile = profileProject({
    query: input.topic,
    collection: input.collection,
    memorySnippets: snippets,
  });
  const intent = classifyIntent(input.topic);
  const { skills, discoveryDegraded } = await discoverSkills({
    profile,
    intent,
    query: input.topic,
    memorySnippets: snippets,
  });

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
