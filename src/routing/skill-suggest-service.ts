import { getSkippedSkillIds, recordSkillDecision } from '../lib/skill-decisions.js';
import { resolveSkillInstructions, warmSkillInstructions } from '../lib/skill-catalog.js';
import { isOfficialRepo } from '../lib/skill-upstream.js';
import { classifyIntent } from './intent-classifier.js';
import {
  detectStack,
  extractBannedTokensFromCollection,
  MIN_STACK_CONFIDENCE,
  profileProject,
} from './project-profiler.js';
import { discoverSkills } from './skill-discovery.js';
import { dedupeSkillsByName, DISCOVERY_POOL_SIZE } from './skill-dedup.js';
import { rankSkillsForSurfacing } from './skill-surfacing.js';
import type { RoutedSkill, SkillSuggestion, SuggestSkillsResult } from './types.js';
import { sanitizeInstallCommand } from '../lib/skill-sanitizers.js';

export const PRESENTATION_HINT = 'use N | install N | skip N | skip all';

const CACHE_TTL_MS = 60_000;
const suggestCache = new Map<string, { expires: number; result: SuggestSkillsResult }>();

function toSuggestion(skill: RoutedSkill): SkillSuggestion {
  const installCommand =
    skill.official ? sanitizeInstallCommand(skill.installCommand) ?? '' : '';
  return {
    id: skill.id,
    name: skill.name,
    reason: skill.reason,
    source: skill.official ? 'official' : 'community',
    install_command: installCommand,
    source_url: skill.sourceUrl,
  };
}

function emptyResult(
  profile: ReturnType<typeof profileProject>,
  intent: ReturnType<typeof classifyIntent>,
  degraded = false,
): SuggestSkillsResult {
  return {
    stack_detected: profile,
    suggestions: [],
    skills: [],
    requires_approval: true,
    presentation_hint: PRESENTATION_HINT,
    discovery_degraded: degraded,
    intent,
  };
}

export async function suggestSkillsForCollection(input: {
  userId?: string;
  topic: string;
  collection?: string | null;
  memorySnippets?: string[];
}): Promise<SuggestSkillsResult> {
  const collection = input.collection ?? '';
  const cacheKey = `${input.userId ?? '_'}:${collection}:${input.topic}`;
  const cached = suggestCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.result;

  const snippets = (input.memorySnippets ?? []).map((s) => s.slice(0, 500));
  const profile = profileProject({
    query: input.topic,
    collection: input.collection,
    memorySnippets: snippets,
  });
  const intent = classifyIntent(input.topic);

  if (snippets.length === 0 || profile.confidence < MIN_STACK_CONFIDENCE) {
    const result = emptyResult(profile, intent);
    suggestCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, result });
    return result;
  }

  const bannedTokens = extractBannedTokensFromCollection(input.collection);
  const { skills: discovered, discoveryDegraded } = await discoverSkills({
    profile,
    intent,
    query: input.topic,
    memorySnippets: snippets,
    bannedTokens,
  });

  let skills = rankSkillsForSurfacing(discovered, profile, intent, DISCOVERY_POOL_SIZE);
  skills = dedupeSkillsByName(skills).slice(0, 2);

  if (process.env.SKILL_PRELOAD_ENABLED !== 'false') {
    void warmSkillInstructions(skills).catch((err) => {
      console.warn('[skill-preload]', err instanceof Error ? err.message : err);
    });
  }

  if (input.userId && collection) {
    const skipped = await getSkippedSkillIds(input.userId, collection);
    skills = skills.filter((s) => !skipped.has(s.id));
  }

  const result: SuggestSkillsResult = {
    stack_detected: profile,
    suggestions: skills.map(toSuggestion),
    skills,
    requires_approval: true,
    presentation_hint: PRESENTATION_HINT,
    discovery_degraded: discoveryDegraded,
    intent,
  };

  suggestCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, result });
  return result;
}

export function formatSuggestSkillsMessage(result: SuggestSkillsResult, header?: string): string {
  if (result.suggestions.length === 0) {
    return [
      header ?? '=== Suggested Skills ===',
      result.stack_detected.confidence < MIN_STACK_CONFIDENCE
        ? 'Stack confidence too low — sync more project memory or connect a repo.'
        : 'No matching skills right now — continue with general engineering practices.',
      `Reply: ${PRESENTATION_HINT}`,
      '=== End Skills Suggestion ===',
    ].join('\n');
  }

  const lines = result.suggestions.map(
    (s, i) =>
      `[${i + 1}] ${s.name} (${s.source}) — ${s.reason}\n` +
      `    Install: ${s.install_command}\n` +
      `    More: ${s.source_url}`,
  );

  return [
    header ?? '=== Suggested Skills ===',
    'These skills match your stack. Default: use in chat (no local install).',
    '',
    ...lines,
    '',
    `Reply: ${PRESENTATION_HINT}`,
    '=== End Skills Suggestion ===',
  ].join('\n');
}

export function parseSkillAction(
  reply: string,
): { action: 'use' | 'install' | 'skip' | 'skip_all'; index?: number } | null {
  const normalized = reply.trim().toLowerCase();
  if (/^(skip|omitir)\s+all$/.test(normalized)) return { action: 'skip_all' };
  const match = normalized.match(/^(use|usar|install|instalar|skip|omitir)\s+(\d+)$/);
  if (!match) return null;
  const index = Number(match[2]);
  if (!Number.isFinite(index) || index < 1) return null;
  const actionToken = match[1];
  if (actionToken === 'use' || actionToken === 'usar') return { action: 'use', index };
  if (actionToken === 'install' || actionToken === 'instalar') return { action: 'install', index };
  return { action: 'skip', index };
}

export async function useSkillInChat(input: {
  userId: string;
  collection: string;
  skillId: string;
  chatSessionId?: string | null;
}): Promise<{ instructions: string; source: 'official' | 'community'; warning?: string }> {
  const parts = input.skillId.split('/');
  const instructionsRepo = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : 'anthropics/skills';
  const skillPathId = parts[parts.length - 1] ?? input.skillId;
  const official = isOfficialRepo(instructionsRepo);

  const resolved = await resolveSkillInstructions({
    skillId: input.skillId,
    repo: instructionsRepo,
    skillPathId,
    instructionsRepo,
    official,
  });

  await recordSkillDecision({
    userId: input.userId,
    collection: input.collection,
    skillId: input.skillId,
    action: 'used_in_chat',
    chatSessionId: input.chatSessionId,
  });

  return resolved;
}

export async function installSkillForUser(input: {
  userId: string;
  collection: string;
  skillId: string;
  installCommand: string;
  confirmed?: boolean;
  chatSessionId?: string | null;
}): Promise<{ install_command: string; confirmed: boolean; message: string }> {
  const safeInstallCommand = sanitizeInstallCommand(input.installCommand);
  if (!safeInstallCommand) {
    throw new Error('Install command is not allowed');
  }
  if (input.confirmed) {
    await recordSkillDecision({
      userId: input.userId,
      collection: input.collection,
      skillId: input.skillId,
      action: 'installed',
      chatSessionId: input.chatSessionId,
    });
    return {
      install_command: safeInstallCommand,
      confirmed: true,
      message: 'Skill install recorded. Run the command in your project terminal if you have not already.',
    };
  }

  return {
    install_command: safeInstallCommand,
    confirmed: false,
    message: `Run this in your project terminal, then confirm:\n${safeInstallCommand}`,
  };
}

export async function skipSkillForUser(input: {
  userId: string;
  collection: string;
  skillId: string;
  chatSessionId?: string | null;
}): Promise<void> {
  await recordSkillDecision({
    userId: input.userId,
    collection: input.collection,
    skillId: input.skillId,
    action: 'skipped',
    chatSessionId: input.chatSessionId,
  });
}

export { detectStack, MIN_STACK_CONFIDENCE };
