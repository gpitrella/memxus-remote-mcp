import type { Intent, ProjectProfile, RoutedSkill } from './types.js';
import { discoverSkills } from './skill-discovery.js';

export async function routeSkills(input: {
  profile: ProjectProfile;
  intent: Intent;
  query: string;
  memorySnippets?: string[];
}): Promise<RoutedSkill[]> {
  const { skills } = await discoverSkills(input);
  return skills.slice(0, 2);
}
