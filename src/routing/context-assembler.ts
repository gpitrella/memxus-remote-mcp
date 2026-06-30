import type { SkillRoutingResult } from './types.js';
import { getCachedProjectProfile } from './project-profile-cache.js';
import { profileProject } from './project-profiler.js';
import { classifyIntent } from './intent-classifier.js';
import { routeSkills } from './routing-engine.js';
import { formatSkillsBlock } from './skill-discovery.js';
import { clampTokenBudget, trimMemoriesToTokenBudget } from '../lib/context-budget.js';
import {
  buildAssemblerContextBlock,
  formatAssemblerMemoryLine,
} from '../lib/context-format.js';
import { estimateTokens } from '../lib/estimate-tokens.js';
import { rankSkillsForSurfacing } from './skill-surfacing.js';

export async function assembleContextWithSkills(input: {
  userId?: string;
  topic: string;
  collection?: string | null;
  memories: Array<{ content: string; similarity?: number }>;
  max_tokens_budget?: number;
}): Promise<{
  contextBlock: string;
  routing: SkillRoutingResult;
  approvalNotice: string;
  tokensUsed: number;
  truncated: boolean;
  includedMemories: Array<{ content: string; similarity?: number }>;
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
  const discoveredSkills = await routeSkills({
    profile,
    intent,
    query: input.topic,
    memorySnippets: snippets,
  });
  const activeSkills = rankSkillsForSurfacing(discoveredSkills, profile, intent);

  const tokenBudget = clampTokenBudget(input.max_tokens_budget);
  const { overheadTokens } = buildAssemblerContextBlock(input.topic, input.collection, []);
  let memoriesForBlock = input.memories;
  let truncated = false;
  let tokensUsed = 0;

  if (tokenBudget !== undefined && input.memories.length > 0) {
    const trimmed = trimMemoriesToTokenBudget(
      input.memories,
      tokenBudget,
      (m, i) => formatAssemblerMemoryLine({ content: m.content }, i),
      overheadTokens
    );
    memoriesForBlock = trimmed.memories;
    truncated = trimmed.truncated;
    tokensUsed = trimmed.tokensUsed;
  }

  const { contextBlock } = buildAssemblerContextBlock(
    input.topic,
    input.collection,
    memoriesForBlock
  );

  const approvalNotice = formatSkillsBlock(activeSkills);
  const routing: SkillRoutingResult = {
    profile,
    intent,
    activeSkills,
    requiresApproval: true,
    discoveryDegraded: discoveredSkills.length < 2,
  };

  const fullBlock = `${contextBlock}\n\n${approvalNotice}`;
  tokensUsed = tokenBudget === undefined ? estimateTokens(fullBlock) : tokensUsed + estimateTokens(`\n\n${approvalNotice}`);

  return {
    contextBlock: fullBlock,
    routing,
    approvalNotice,
    tokensUsed,
    truncated,
    includedMemories: memoriesForBlock,
  };
}
