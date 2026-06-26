import type { SkillRoutingResult } from './types.js';
import { getCachedProjectProfile } from './project-profile-cache.js';
import { profileProject } from './project-profiler.js';
import { classifyIntent } from './intent-classifier.js';
import { routeSkills } from './routing-engine.js';
import { formatSkillsBlock } from './skill-discovery.js';

export async function assembleContextWithSkills(input: {
  userId?: string;
  topic: string;
  collection?: string | null;
  memories: Array<{ content: string }>;
}): Promise<{
  contextBlock: string;
  routing: SkillRoutingResult;
  approvalNotice: string;
}> {
  const snippets = input.memories.map((m) => m.content.slice(0, 500));
  const profile = input.userId
    ? getCachedProjectProfile({
        userId: input.userId,
        topic: input.topic,
        collection: input.collection,
        memorySnippets: snippets,
      })
    : profileProject({
        query: input.topic,
        collection: input.collection,
        memorySnippets: snippets,
      });
  const intent = classifyIntent(input.topic);
  const activeSkills = await routeSkills({
    profile,
    intent,
    query: input.topic,
    memorySnippets: snippets,
  });

  const collLine = input.collection ? `Collection: ${input.collection}\n` : '';
  const contextBlock = [
    '=== AI Memory Context ===',
    `Topic: ${input.topic}`,
    collLine + `Memories Retrieved: ${input.memories.length}`,
    '',
    ...input.memories.map((m, i) => `[${i + 1}] ${m.content}`),
    '',
    '=== End of Memory Context ===',
  ].join('\n');

  const approvalNotice = formatSkillsBlock(activeSkills);
  const routing: SkillRoutingResult = {
    profile,
    intent,
    activeSkills,
    requiresApproval: true,
    discoveryDegraded: activeSkills.length < 2,
  };

  return {
    contextBlock: `${contextBlock}\n\n${approvalNotice}`,
    routing,
    approvalNotice,
  };
}
