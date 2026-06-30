import type { SkillRoutingResult } from './types.js';
import { clampTokenBudget, trimMemoriesToTokenBudget } from '../lib/context-budget.js';
import {
  buildAssemblerContextBlock,
  formatAssemblerMemoryLine,
  type RetrieveMemoryRow,
} from '../lib/context-format.js';
import { estimateTokens } from '../lib/estimate-tokens.js';
import { formatSuggestSkillsMessage, suggestSkillsForCollection } from './skill-suggest-service.js';

type MemorySnippet = RetrieveMemoryRow;

export async function assembleContextWithSkills(input: {
  userId?: string;
  topic: string;
  collection?: string | null;
  memories: MemorySnippet[];
  max_tokens_budget?: number;
}): Promise<{
  contextBlock: string;
  routing: SkillRoutingResult;
  approvalNotice: string;
  tokensUsed: number;
  truncated: boolean;
  includedMemories: MemorySnippet[];
  suggestions: ReturnType<typeof suggestSkillsForCollection> extends Promise<infer R>
    ? R['suggestions']
    : never;
  presentation_hint: string;
}> {
  const snippets = input.memories.map((m) => m.content.slice(0, 500));
  const suggested = await suggestSkillsForCollection({
    userId: input.userId,
    topic: input.topic,
    collection: input.collection,
    memorySnippets: snippets,
  });
  const activeSkills = suggested.skills;

  const tokenBudget = clampTokenBudget(input.max_tokens_budget);
  const { overheadTokens } = buildAssemblerContextBlock(input.topic, input.collection, []);
  let memoriesForBlock = input.memories;
  let truncated = false;
  let tokensUsed = 0;

  if (tokenBudget !== undefined && input.memories.length > 0) {
    const trimmed = trimMemoriesToTokenBudget(
      input.memories,
      tokenBudget,
      formatAssemblerMemoryLine,
      overheadTokens,
    );
    memoriesForBlock = trimmed.memories;
    truncated = trimmed.truncated;
    tokensUsed = trimmed.tokensUsed;
  }

  const { contextBlock } = buildAssemblerContextBlock(
    input.topic,
    input.collection,
    memoriesForBlock,
  );

  if (tokenBudget === undefined) {
    tokensUsed = estimateTokens(contextBlock);
  }

  const approvalNotice = formatSuggestSkillsMessage(suggested);
  const routing: SkillRoutingResult = {
    profile: suggested.stack_detected,
    intent: suggested.intent,
    activeSkills,
    requiresApproval: true,
    discoveryDegraded: suggested.discovery_degraded,
  };

  const fullBlock = `${contextBlock}\n\n${approvalNotice}`;
  if (tokenBudget === undefined) {
    tokensUsed = estimateTokens(fullBlock);
  } else {
    tokensUsed += estimateTokens(`\n\n${approvalNotice}`);
  }

  return {
    contextBlock: fullBlock,
    routing,
    approvalNotice,
    tokensUsed,
    truncated,
    includedMemories: memoriesForBlock,
    suggestions: suggested.suggestions,
    presentation_hint: suggested.presentation_hint,
  };
}
