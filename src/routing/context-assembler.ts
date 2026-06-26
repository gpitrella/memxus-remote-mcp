import type { FormattableMemory } from '../mcp/format-memory.js';
import { formatContextBlock } from '../mcp/format-memory.js';
import type { SkillRoutingResult } from './types.js';
import { getCachedProjectProfile } from './project-profile-cache.js';
import { profileProject } from './project-profiler.js';
import { classifyIntent } from './intent-classifier.js';
import { routeSkills } from './routing-engine.js';

export function assembleContextWithSkills(input: {
  userId?: string;
  topic: string;
  collection?: string | null;
  memories: FormattableMemory[];
}): {
  contextBlock: string;
  routing: SkillRoutingResult;
  approvalNotice: string;
} {
  const snippets = input.memories.map((m) => m.content.slice(0, 500));
  const profile = input.userId
    ? getCachedProjectProfile({
        userId: input.userId,
        topic: input.topic,
        collection: input.collection,
      })
    : profileProject({
        query: input.topic,
        collection: input.collection,
        memorySnippets: snippets,
      });
  const intent = classifyIntent(input.topic);
  const activeSkills = routeSkills({ profile, intent, query: input.topic });

  const contextBlock = formatContextBlock(input.topic, input.collection, input.memories);
  const routing: SkillRoutingResult = {
    profile,
    intent,
    activeSkills,
    requiresApproval: true,
  };

  const skillLines =
    activeSkills.length === 0
      ? 'No specific verified skills matched — use general engineering practices.'
      : activeSkills
          .map(
            (s, i) =>
              `[${i + 1}] ${s.name} (verified) — ${s.reason}\n    ${s.description}`
          )
          .join('\n');

  const approvalNotice = [
    '=== Suggested Official Skills (approval required) ===',
    'These skills are SUGGESTED based on your project context. Confirm before the agent applies them.',
    '',
    skillLines,
    '',
    'Reply to approve which skill(s) to use, or continue without skills.',
    '=== End Skills Suggestion ===',
  ].join('\n');

  return {
    contextBlock: `${contextBlock}\n\n${approvalNotice}`,
    routing,
    approvalNotice,
  };
}
