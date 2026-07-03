import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  saveMemory,
  searchMemories,
  listMemories,
  listCollections,
  deleteMemory,
  getMemoryById,
  getStats,
} from './tools.js';
import { RESOURCES, readResource } from './resources.js';
import { getPlan } from '../lib/plans.js';
import {
  assertWithinPlanLimits,
  formatPlanLimitToolError,
  invalidatePlanContextCache,
  logUsage,
  PlanLimitError,
  resolveListLimit,
  resolveSearchLimit,
  type UserPlanContext,
} from '../lib/plan-enforcement.js';
import { estimateTokens } from '../lib/estimate-tokens.js';
import { MCP_CONTEXT_DEFAULTS } from '../lib/context-defaults.js';
import { trimMemoriesToTokenBudget } from '../lib/context-budget.js';
import { buildMcpContextBlock, formatMcpContextMemoryLine } from '../lib/context-format.js';
import { sanitizeToolError } from '../lib/tool-errors.js';
import { getActiveMcpTools } from './tool-schemas.js';
import {
  formatMemoryLine,
  formatRememberText,
  formatGetMemoryText,
  formatUpdateText,
  formatMemoryStatsText,
} from './format-memory.js';
import { updateMemoryRecord } from '../lib/memory-update.js';
import {
  connectSource,
  listSyncableItems,
  setSyncSelection,
  checkConnectStatus,
  mapActiveSkillsForResponse,
} from './connector-tools.js';
import { assembleContextWithSkills } from '../routing/context-assembler.js';
import { buildImpactPayload, buildSkillImpactFields } from '../lib/impact-summary.js';
import { buildUserFacingTemplate, toUserFacingSkills } from '../lib/user-facing-template.js';
import { resetSkillDecision } from '../lib/skill-decisions.js';
import {
  installSkillForUser,
  skipSkillForUser,
  useSkillInChat,
} from '../routing/skill-suggest-service.js';
import {
  shouldAppendSkillsForRecall,
  surfaceSkills,
} from '../routing/skill-surfacing.js';
import {
  isInAppConnectEnabled,
  isSkillRoutingEnabled,
} from '../lib/feature-flags.js';
import {
  isInAppConnectActiveForUser,
  isSkillRoutingActiveForUser,
  resolveDefaultReadVisibility,
  type UserMcpPreferences,
} from '../lib/mcp-preferences.js';
import { assertOAuthScopes, assertMemoryReadScope, assertMemoryWriteScope, assertMemoryDeleteScope } from '../lib/oauth-scopes.js';
import { getCachedUserMcpPreferences } from '../lib/mcp-preferences-cache.js';
import { toolSuccess, toolSuccessWithUserFacing, toStructuredMemory, toStructuredMemories, type ToolSuccessResult } from './tool-results.js';

function toBulletMemories(
  ms: Array<{ id: string; content: string; updated_at?: string; similarity?: number | null }>,
) {
  return ms.map((m) => ({
    id: m.id,
    content: m.content,
    updated_at: m.updated_at,
    similarity: m.similarity,
  }));
}

export { MCP_TOOLS, getActiveMcpTools, MCP_CORE_TOOLS } from './tool-schemas.js';

export interface McpContext {
  userId: string;
  apiKeyId?: string;
  workforceWorkspaceId?: string;
  oauthScope?: string;
  isOAuthToken?: boolean;
  mcpPreferences?: UserMcpPreferences;
}

const memoryTypeEnum = z.enum(['general', 'preference', 'fact', 'instruction', 'conversation']);

export function createMCPServer(ctx: McpContext): Server {
  const { userId, apiKeyId, workforceWorkspaceId, oauthScope, isOAuthToken } = ctx;
  const oauthOpts = { isOAuthToken };

  async function resolvePrefs(): Promise<UserMcpPreferences> {
    return getCachedUserMcpPreferences(userId);
  }

  const server = new Server(
    { name: 'aimemory-remote', version: '1.1.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getActiveMcpTools({ prefs: await resolvePrefs() }),
  }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

  // Glama Inspector UI probes optional MCP methods; empty lists avoid -32601 Method not found.
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [],
  }));

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const html = await readResource(req.params.uri, userId);
    return { contents: [{ uri: req.params.uri, mimeType: 'text/html', text: html }] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const toolName = req.params.name;
    const endpoint = `mcp/tools/${toolName}`;
    const isForget = toolName === 'forget';
    const isWriteMemory = toolName === 'remember' || toolName === 'update';
    const started = Date.now();

    try {
      let planCtx: UserPlanContext | null = null;
      if (!isForget) {
        planCtx = await assertWithinPlanLimits({
          userId,
          toolOrEndpoint: endpoint,
          isForget: false,
          isWriteMemory,
        });
      }

      const limits = planCtx?.limits ?? getPlan('free').limits;
      const a = (req.params.arguments ?? {}) as Record<string, unknown>;
      let result: ToolSuccessResult | { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

      switch (toolName) {
        case 'remember': {
          assertMemoryWriteScope(oauthScope, oauthOpts);
          const prefs = await resolvePrefs();
          const input = z
            .object({
              content: z.string().min(1),
              type: memoryTypeEnum.default('general'),
              tags: z.array(z.string()).default([]),
              collection: z.string().optional().nullable(),
              importance: z.number().min(0).max(1).default(0.5),
              append_to: z.string().uuid().optional(),
              visibility: z.enum(['private', 'shared']).optional(),
              group_id: z.string().uuid().optional(),
              group_name: z.string().optional(),
            })
            .parse(a);
          let visibility = input.visibility ?? prefs.default_memory_visibility;
          let visibilityFallback: string | undefined;
          if (
            visibility === 'shared' &&
            !input.group_id &&
            !input.group_name?.trim()
          ) {
            visibility = 'private';
            visibilityFallback =
              'Shared visibility requires group_id or group_name; saved as private.';
          }
          const m = await saveMemory({
            userId,
            workforceWorkspaceId,
            content: input.content,
            type: input.type,
            tags: input.tags,
            collection: input.collection,
            importance: input.importance,
            append_to: input.append_to,
            visibility,
            group_id: input.group_id,
            group_name: input.group_name,
          });
          const text = formatRememberText(m);
          result = toolSuccess(text, {
            memory_id: m.id,
            memory_type: m.memory_type,
            collection: m.collection ?? '',
            tags: m.tags,
            importance: m.importance,
            message: visibilityFallback ? `${text}\n${visibilityFallback}` : text,
            ...(visibilityFallback ? { visibility_fallback: visibilityFallback } : {}),
          });
          invalidatePlanContextCache(userId);
          break;
        }
        case 'recall': {
          assertMemoryReadScope(oauthScope, oauthOpts);
          const prefs = await resolvePrefs();
          const input = z
            .object({
              query: z.string().min(1),
              limit: z.number().int().optional(),
              type: memoryTypeEnum.optional(),
              collection: z.string().optional().nullable(),
              tags: z.array(z.string()).optional(),
              visibility: z.enum(['private', 'shared', 'all']).optional(),
              group_id: z.string().uuid().optional(),
              group_name: z.string().optional(),
              include_skills: z.boolean().optional(),
              exclude_memory_ids: z.array(z.string().uuid()).optional(),
            })
            .parse(a);
          const visibility = resolveDefaultReadVisibility(prefs, input.visibility);
          const searchLimit = resolveSearchLimit(limits, input.limit);
          const { memories: ms, total } = await searchMemories({
            userId,
            workforceWorkspaceId,
            query: input.query,
            limit: searchLimit,
            planLimits: limits,
            type: input.type,
            collection: input.collection,
            tags: input.tags,
            visibility,
            group_id: input.group_id,
            group_name: input.group_name,
            exclude_memory_ids: input.exclude_memory_ids,
          });
          const scope = input.collection ? ` in collection "${input.collection}"` : '';
          if (ms.length === 0) {
            const text = `No memories found for that query${scope}.`;
            const userFacing = buildUserFacingTemplate({
              topic: input.query,
              collection: input.collection,
              memoryCount: 0,
              totalMemories: total,
            });
            result = toolSuccessWithUserFacing(
              text,
              { count: 0, total, memories: [], message: text },
              userFacing,
            );
          } else {
            const formatted = ms.map((m, i) => formatMemoryLine(m, i)).join('\n\n---\n\n');
            let text = `Found ${ms.length}:\n\n${formatted}`;
            const skillPrefs = await resolvePrefs();
            let suggestedSkills: ReturnType<typeof mapActiveSkillsForResponse> | undefined;
            let skillsMessage: string | undefined;
            if (
              isSkillRoutingActiveForUser(skillPrefs) &&
              shouldAppendSkillsForRecall(input.query, input.include_skills)
            ) {
              const snippets = ms.map((m) => m.content);
              const surfaced = await surfaceSkills({
                trigger: 'recall',
                topic: input.query,
                collection: input.collection,
                memorySnippets: snippets,
              });
              suggestedSkills = mapActiveSkillsForResponse(surfaced.skills);
              skillsMessage = surfaced.skillsMessage;
              text = `${text}\n\n${surfaced.skillsMessage}`;
            }
            const tokensUsed = estimateTokens(text);
            const impact = buildImpactPayload(tokensUsed);
            const userFacing = buildUserFacingTemplate({
              topic: input.query,
              collection: input.collection,
              memoryCount: ms.length,
              totalMemories: total,
              contextBlock: text,
              memoryRows: toBulletMemories(ms),
              tokensUsed,
              skills: toUserFacingSkills(undefined, suggestedSkills),
              stackConfidence: suggestedSkills?.length ? 0.8 : undefined,
            });
            result = toolSuccessWithUserFacing(
              text,
              {
                count: ms.length,
                total,
                memories: toStructuredMemories(ms),
                message: text,
                tokens_used: tokensUsed,
                ...(suggestedSkills ? { suggested_skills: suggestedSkills, skills_message: skillsMessage } : {}),
                ...(impact ?? {}),
              },
              userFacing,
            );
          }
          break;
        }
        case 'get_context': {
          assertMemoryReadScope(oauthScope, oauthOpts);
          const prefs = await resolvePrefs();
          const input = z
            .object({
              topic: z.string().min(1),
              max_memories: z.number().int().optional(),
              type: memoryTypeEnum.optional(),
              collection: z.string().optional().nullable(),
              tags: z.array(z.string()).optional(),
              visibility: z.enum(['private', 'shared', 'all']).optional(),
              group_id: z.string().uuid().optional(),
              group_name: z.string().optional(),
              exclude_memory_ids: z.array(z.string().uuid()).optional(),
            })
            .parse(a);
          const visibility = resolveDefaultReadVisibility(prefs, input.visibility);
          const contextLimit = resolveSearchLimit(limits, input.max_memories);
          const { memories: ms, total } = await searchMemories({
            userId,
            workforceWorkspaceId,
            query: input.topic,
            limit: contextLimit,
            planLimits: limits,
            type: input.type,
            collection: input.collection,
            tags: input.tags,
            visibility,
            group_id: input.group_id,
            group_name: input.group_name,
            min_similarity: MCP_CONTEXT_DEFAULTS.min_similarity,
            exclude_memory_ids: input.exclude_memory_ids,
          });
          if (ms.length === 0) {
            const scope = input.collection ? ` (collection: ${input.collection})` : '';
            const text = `No relevant memories found for this topic${scope}.`;
            const userFacing = buildUserFacingTemplate({
              topic: input.topic,
              collection: input.collection,
              memoryCount: 0,
              totalMemories: total,
            });
            result = toolSuccessWithUserFacing(
              text,
              {
                topic: input.topic,
                count: 0,
                total,
                context_block: text,
                memories: [],
                message: text,
              },
              userFacing,
            );
          } else {
            const { overheadTokens } = buildMcpContextBlock(input.topic, input.collection, []);
            const trimmed = trimMemoriesToTokenBudget(
              ms.map((m) => ({
                ...m,
                similarity: m.similarity,
              })),
              MCP_CONTEXT_DEFAULTS.max_tokens_budget,
              formatMcpContextMemoryLine,
              overheadTokens
            );
            const block = buildMcpContextBlock(
              input.topic,
              input.collection,
              trimmed.memories
            ).contextBlock;
            const impact = buildImpactPayload(trimmed.tokensUsed);
            const userFacing = buildUserFacingTemplate({
              topic: input.topic,
              collection: input.collection,
              memoryCount: trimmed.memories.length,
              totalMemories: total,
              contextBlock: block,
              memoryRows: toBulletMemories(trimmed.memories),
              tokensUsed: trimmed.tokensUsed,
            });
            result = toolSuccessWithUserFacing(
              block,
              {
                topic: input.topic,
                count: trimmed.memories.length,
                total,
                context_block: block,
                memories: toStructuredMemories(trimmed.memories),
                message: block,
                tokens_used: trimmed.tokensUsed,
                truncated: trimmed.truncated,
                ...(impact ?? {}),
              },
              userFacing,
            );
          }
          break;
        }
        case 'list_memories': {
          assertMemoryReadScope(oauthScope, oauthOpts);
          const prefs = await resolvePrefs();
          const input = z
            .object({
              limit: z.number().int().optional(),
              full_content: z.boolean().default(false),
              type: memoryTypeEnum.optional(),
              collection: z.string().optional().nullable(),
              tags: z.array(z.string()).optional(),
              visibility: z.enum(['private', 'shared', 'all']).optional(),
              group_id: z.string().uuid().optional(),
              group_name: z.string().optional(),
            })
            .parse(a);
          const visibility = resolveDefaultReadVisibility(prefs, input.visibility);
          const listLimit = resolveListLimit(limits, input.limit);
          const ms = await listMemories({
            userId,
            workforceWorkspaceId,
            limit: listLimit,
            planLimits: limits,
            type: input.type,
            collection: input.collection,
            tags: input.tags,
            visibility,
            group_id: input.group_id,
          });
          if (ms.length === 0) {
            const text = 'No memories stored yet. Use the `remember` tool to save information.';
            result = toolSuccess(text, { count: 0, memories: [], message: text });
          } else {
            const verbose = input.full_content;
            const formatted = ms.map((m, i) => formatMemoryLine(m, i, verbose)).join('\n\n');
            const text = `Your ${ms.length} most recent memories:\n\n${formatted}`;
            result = toolSuccess(text, {
              count: ms.length,
              memories: toStructuredMemories(ms),
              message: text,
            });
          }
          break;
        }
        case 'get_memory': {
          assertMemoryReadScope(oauthScope, oauthOpts);
          const input = z
            .object({ memory_id: z.string().uuid('memory_id must be a valid UUID') })
            .parse(a);
          const m = await getMemoryById({
            userId,
            workforceWorkspaceId,
            memoryId: input.memory_id,
          });
          const text = formatGetMemoryText(m);
          result = toolSuccess(text, {
            ...toStructuredMemory(m),
            message: text,
          });
          break;
        }
        case 'list_collections': {
          assertMemoryReadScope(oauthScope, oauthOpts);
          const cols = await listCollections(userId);
          if (cols.length === 0) {
            const text =
              'No collections yet. Use remember with collection=project:<name> or personal:preferences.';
            result = toolSuccess(text, { count: 0, collections: [], message: text });
          } else {
            const lines = cols.map(
              (c, i) =>
                `[${i + 1}] ${c.slug}${c.name !== c.slug ? ` (${c.name})` : ''}${c.description ? `\n    ${c.description}` : ''}`
            );
            const text = `Collections (${cols.length}):\n\n${lines.join('\n')}`;
            result = toolSuccess(text, {
              count: cols.length,
              collections: cols.map((c) => ({
                slug: c.slug,
                name: c.name,
                description: c.description ?? '',
              })),
              message: text,
            });
          }
          break;
        }
        case 'forget': {
          assertMemoryDeleteScope(oauthScope, oauthOpts);
          const input = z
            .object({ memory_id: z.string().uuid('memory_id must be a valid UUID') })
            .parse(a);
          await deleteMemory({ userId, workforceWorkspaceId, memoryId: input.memory_id });
          const text = `Memory ${input.memory_id} deleted.`;
          result = toolSuccess(text, {
            memory_id: input.memory_id,
            deleted: true,
            message: text,
          });
          invalidatePlanContextCache(userId);
          break;
        }
        case 'memory_stats': {
          assertMemoryReadScope(oauthScope, oauthOpts);
          const s = await getStats(userId, workforceWorkspaceId);
          const text = formatMemoryStatsText(s);
          result = toolSuccess(text, {
            total: s.total,
            by_type: s.byType,
            by_collection: s.byCollection,
            storage_bytes_used: s.storageBytesUsed,
            storage_bytes_limit: s.storageBytesLimit,
            message: text,
          });
          break;
        }
        case 'update': {
          assertMemoryWriteScope(oauthScope, oauthOpts);
          const input = z
            .object({
              id: z.string().uuid('id must be a valid UUID'),
              content: z.string().optional(),
              type: memoryTypeEnum.optional(),
              tags: z.array(z.string()).optional(),
              collection: z.string().optional().nullable(),
              importance: z.number().min(0).max(1).optional(),
              mode: z.enum(['replace', 'append']).default('replace'),
            })
            .parse(a);
          const m = await updateMemoryRecord({
            userId,
            workforceWorkspaceId,
            memoryId: input.id,
            mode: input.mode,
            content: input.content,
            memory_type: input.type,
            tags: input.tags,
            collection: input.collection,
            importance: input.importance,
          });
          const text = formatUpdateText(m);
          result = toolSuccess(text, {
            memory_id: m.id,
            memory_type: m.memory_type,
            collection: m.collection ?? '',
            tags: m.tags,
            importance: m.importance,
            message: text,
          });
          invalidatePlanContextCache(userId);
          break;
        }
        case 'connect_source': {
          if (!isInAppConnectEnabled()) {
            throw new Error('In-app connect is not enabled on this server');
          }
          const connectPrefs = await resolvePrefs();
          if (!isInAppConnectActiveForUser(connectPrefs)) {
            throw new Error(
              'In-app connect is disabled in your dashboard settings. Enable it under Settings → AI & MCP.'
            );
          }
          assertOAuthScopes(oauthScope, ['sources:write'], { isOAuthToken });
          const input = z
            .object({
              provider: z.enum(['github', 'notion']),
              project_slug: z.string().optional(),
            })
            .parse(a);
          const out = await connectSource({
            userId,
            provider: input.provider,
            projectSlug: input.project_slug,
          });
          result = toolSuccess(out.message, out);
          break;
        }
        case 'list_syncable_items': {
          if (!isInAppConnectEnabled()) {
            throw new Error('In-app connect is not enabled on this server');
          }
          const connectPrefs = await resolvePrefs();
          if (!isInAppConnectActiveForUser(connectPrefs)) {
            throw new Error(
              'In-app connect is disabled in your dashboard settings. Enable it under Settings → AI & MCP.'
            );
          }
          assertOAuthScopes(oauthScope, ['sources:read'], { isOAuthToken });
          const input = z.object({ provider: z.enum(['github', 'notion']) }).parse(a);
          const { items } = await listSyncableItems({ userId, provider: input.provider });
          const text = items.length
            ? `Found ${items.length} syncable ${input.provider} item(s).`
            : `No syncable ${input.provider} items found.`;
          result = toolSuccess(text, { count: items.length, items, message: text });
          break;
        }
        case 'set_sync_selection': {
          if (!isInAppConnectEnabled()) {
            throw new Error('In-app connect is not enabled on this server');
          }
          const connectPrefs = await resolvePrefs();
          if (!isInAppConnectActiveForUser(connectPrefs)) {
            throw new Error(
              'In-app connect is disabled in your dashboard settings. Enable it under Settings → AI & MCP.'
            );
          }
          assertOAuthScopes(oauthScope, ['sources:write'], { isOAuthToken });
          const input = z
            .object({
              provider: z.enum(['github', 'notion']),
              itemIds: z.array(z.string().min(1)).min(1),
              project_slug: z.string().optional(),
            })
            .parse(a);
          const out = await setSyncSelection({
            userId,
            provider: input.provider,
            itemIds: input.itemIds,
            projectSlug: input.project_slug,
          });
          let text = `Saved ${out.selected} ${input.provider} item(s) for sync.${
            out.sync?.ok ? ' Initial sync started.' : out.sync?.detail ? ` Sync note: ${out.sync.detail}` : ''
          }`;
          if (out.skills_message) {
            text = `${text}\n\n${out.skills_message}`;
          }
          result = toolSuccess(text, {
            ok: out.ok,
            selected: out.selected,
            sync_ok: out.sync?.ok ?? false,
            message: text,
            ...(out.suggested_skills ? { suggested_skills: out.suggested_skills } : {}),
            ...(out.skills_message ? { skills_message: out.skills_message } : {}),
            ...(out.discovery_degraded != null ? { discovery_degraded: out.discovery_degraded } : {}),
          });
          break;
        }
        case 'check_connect_status': {
          if (!isInAppConnectEnabled()) {
            throw new Error('In-app connect is not enabled on this server');
          }
          const connectPrefs = await resolvePrefs();
          if (!isInAppConnectActiveForUser(connectPrefs)) {
            throw new Error(
              'In-app connect is disabled in your dashboard settings. Enable it under Settings → AI & MCP.'
            );
          }
          assertOAuthScopes(oauthScope, ['sources:read'], { isOAuthToken });
          const input = z.object({ poll_token: z.string().min(1) }).parse(a);
          const out = await checkConnectStatus({ userId, pollToken: input.poll_token });
          result = toolSuccess(out.message, out);
          break;
        }
        case 'get_context_with_skills': {
          assertMemoryReadScope(oauthScope, oauthOpts);
          if (!isSkillRoutingEnabled()) {
            throw new Error('Skill routing is not enabled on this server');
          }
          const skillPrefs = await resolvePrefs();
          if (!isSkillRoutingActiveForUser(skillPrefs)) {
            throw new Error(
              'Skill routing is disabled in your dashboard settings. Enable it under Settings → AI & MCP.'
            );
          }
          const input = z
            .object({
              topic: z.string().min(1),
              max_memories: z.number().int().optional(),
              type: memoryTypeEnum.optional(),
              collection: z.string().optional().nullable(),
              tags: z.array(z.string()).optional(),
              visibility: z.enum(['private', 'shared', 'all']).optional(),
              group_id: z.string().uuid().optional(),
              group_name: z.string().optional(),
              exclude_memory_ids: z.array(z.string().uuid()).optional(),
            })
            .parse(a);
          const visibility = resolveDefaultReadVisibility(skillPrefs, input.visibility);
          const contextLimit = resolveSearchLimit(limits, input.max_memories);
          const { memories: ms, total } = await searchMemories({
            userId,
            workforceWorkspaceId,
            query: input.topic,
            limit: contextLimit,
            planLimits: limits,
            type: input.type,
            collection: input.collection,
            tags: input.tags,
            visibility,
            group_id: input.group_id,
            group_name: input.group_name,
            min_similarity: MCP_CONTEXT_DEFAULTS.min_similarity,
            exclude_memory_ids: input.exclude_memory_ids,
          });
          const assembled = await assembleContextWithSkills({
            userId,
            topic: input.topic,
            collection: input.collection,
            memories: ms.map((m) => ({
              id: m.id,
              content: m.content,
              similarity: m.similarity,
              updated_at: m.updated_at,
            })),
            max_tokens_budget: MCP_CONTEXT_DEFAULTS.max_tokens_budget,
          });
          const includedIds = new Set(
            assembled.includedMemories
              .map((m) => m.id)
              .filter((id): id is string => Boolean(id)),
          );
          const responseMs =
            includedIds.size > 0
              ? ms.filter((m) => includedIds.has(m.id))
              : ms.filter((m) =>
                  assembled.includedMemories.some((inc) => inc.content === m.content),
                );
          const impact = buildImpactPayload(assembled.tokensUsed);
          const userFacing = buildUserFacingTemplate({
            topic: input.topic,
            collection: input.collection,
            memoryCount: responseMs.length,
            totalMemories: total,
            contextBlock: assembled.contextBlock,
            memoryRows: toBulletMemories(responseMs),
            tokensUsed: assembled.tokensUsed,
            skills: toUserFacingSkills(assembled.suggestions),
            stackConfidence: assembled.routing.profile.confidence,
          });
          result = toolSuccessWithUserFacing(
            assembled.contextBlock,
            {
              topic: input.topic,
              count: responseMs.length,
              total,
              context_block: assembled.contextBlock,
              profile: assembled.routing.profile,
              intent: assembled.routing.intent,
              active_skills: mapActiveSkillsForResponse(assembled.routing.activeSkills),
              suggestions: assembled.suggestions,
              presentation_hint: assembled.presentation_hint,
              discovery_degraded: assembled.routing.discoveryDegraded ?? false,
              requires_approval: true,
              memories: toStructuredMemories(responseMs),
              message: assembled.contextBlock,
              tokens_used: assembled.tokensUsed,
              truncated: assembled.truncated,
              ...(impact ?? {}),
            },
            userFacing,
          );
          break;
        }
        case 'suggest_skills': {
          assertMemoryReadScope(oauthScope, oauthOpts);
          if (!isSkillRoutingEnabled()) {
            throw new Error('Skill routing is not enabled on this server');
          }
          const skillPrefs = await resolvePrefs();
          if (!isSkillRoutingActiveForUser(skillPrefs)) {
            throw new Error(
              'Skill routing is disabled in your dashboard settings. Enable it under Settings → AI & MCP.'
            );
          }
          const input = z
            .object({
              topic: z.string().min(1),
              collection: z.string().optional().nullable(),
              max_memories: z.number().int().optional(),
            })
            .parse(a);
          const contextLimit = resolveSearchLimit(limits, input.max_memories ?? 5);
          const { memories: ms, total } = await searchMemories({
            userId,
            workforceWorkspaceId,
            query: input.topic,
            limit: contextLimit,
            planLimits: limits,
            collection: input.collection,
            visibility: resolveDefaultReadVisibility(skillPrefs),
          });
          const surfaced = await surfaceSkills({
            trigger: 'suggest',
            topic: input.topic,
            collection: input.collection,
            memorySnippets: ms.map((m) => m.content),
            userId,
          });
          const userFacing = buildUserFacingTemplate({
            topic: input.topic,
            collection: input.collection,
            memoryCount: ms.length,
            totalMemories: total,
            skills: toUserFacingSkills(surfaced.suggestions),
            stackConfidence: surfaced.profile.confidence,
          });
          result = toolSuccessWithUserFacing(
            surfaced.skillsMessage,
            {
              topic: input.topic,
              count: ms.length,
              total,
              active_skills: mapActiveSkillsForResponse(surfaced.skills),
              suggestions: surfaced.suggestions,
              presentation_hint: surfaced.presentation_hint,
              skills_message: surfaced.skillsMessage,
              profile: surfaced.profile,
              intent: surfaced.intent,
              discovery_degraded: surfaced.discoveryDegraded,
              requires_approval: true,
              message: surfaced.skillsMessage,
            },
            userFacing,
          );
          break;
        }
        case 'use_skill_in_chat': {
          assertMemoryReadScope(oauthScope, oauthOpts);
          if (!isSkillRoutingEnabled()) {
            throw new Error('Skill routing is not enabled on this server');
          }
          const skillPrefs = await resolvePrefs();
          if (!isSkillRoutingActiveForUser(skillPrefs)) {
            throw new Error(
              'Skill routing is disabled in your dashboard settings. Enable it under Settings → AI & MCP.'
            );
          }
          const input = z
            .object({
              skill_id: z.string().min(1),
              collection: z.string().min(1),
              chat_session_id: z.string().optional(),
            })
            .parse(a);
          const loaded = await useSkillInChat({
            userId,
            collection: input.collection,
            skillId: input.skill_id,
            chatSessionId: input.chat_session_id,
          });
          const skillName = input.skill_id.split('/').pop() ?? input.skill_id;
          const skillTokensUsed = estimateTokens(loaded.instructions);
          const skillImpact = buildSkillImpactFields(skillName, skillTokensUsed);
          const userFacing = buildUserFacingTemplate({
            mode: 'skill_load',
            topic: skillName,
            skillImpactText: skillImpact?.skill_impact_text,
          });
          result = toolSuccessWithUserFacing(
            loaded.instructions,
            {
              ...loaded,
              message: loaded.instructions,
              skill_tokens_used: skillTokensUsed,
              ...(skillImpact ?? {}),
            },
            userFacing,
          );
          break;
        }
        case 'install_skill': {
          assertMemoryReadScope(oauthScope, oauthOpts);
          if (!isSkillRoutingEnabled()) {
            throw new Error('Skill routing is not enabled on this server');
          }
          const skillPrefs = await resolvePrefs();
          if (!isSkillRoutingActiveForUser(skillPrefs)) {
            throw new Error(
              'Skill routing is disabled in your dashboard settings. Enable it under Settings → AI & MCP.'
            );
          }
          const input = z
            .object({
              skill_id: z.string().min(1),
              collection: z.string().min(1),
              install_command: z.string().min(1),
              confirmed: z.boolean().optional(),
              chat_session_id: z.string().optional(),
            })
            .parse(a);
          const out = await installSkillForUser({
            userId,
            collection: input.collection,
            skillId: input.skill_id,
            installCommand: input.install_command,
            confirmed: input.confirmed,
            chatSessionId: input.chat_session_id,
          });
          result = toolSuccess(out.message, { ...out, message: out.message });
          break;
        }
        case 'skip_skill': {
          assertMemoryReadScope(oauthScope, oauthOpts);
          if (!isSkillRoutingEnabled()) {
            throw new Error('Skill routing is not enabled on this server');
          }
          const skillPrefs = await resolvePrefs();
          if (!isSkillRoutingActiveForUser(skillPrefs)) {
            throw new Error(
              'Skill routing is disabled in your dashboard settings. Enable it under Settings → AI & MCP.'
            );
          }
          const input = z
            .object({
              skill_id: z.string().min(1),
              collection: z.string().min(1),
              chat_session_id: z.string().optional(),
            })
            .parse(a);
          await skipSkillForUser({
            userId,
            collection: input.collection,
            skillId: input.skill_id,
            chatSessionId: input.chat_session_id,
          });
          const message = `Skill ${input.skill_id} omitted for this collection.`;
          result = toolSuccess(message, {
            skill_id: input.skill_id,
            collection: input.collection,
            skipped: true,
            message,
          });
          break;
        }
        case 'reset_skill_decision': {
          assertMemoryReadScope(oauthScope, oauthOpts);
          if (!isSkillRoutingEnabled()) {
            throw new Error('Skill routing is not enabled on this server');
          }
          const skillPrefs = await resolvePrefs();
          if (!isSkillRoutingActiveForUser(skillPrefs)) {
            throw new Error(
              'Skill routing is disabled in your dashboard settings. Enable it under Settings → AI & MCP.'
            );
          }
          const input = z
            .object({
              skill_id: z.string().min(1),
              collection: z.string().min(1),
            })
            .parse(a);
          const reset = await resetSkillDecision({
            userId,
            collection: input.collection,
            skillId: input.skill_id,
          });
          const message = reset
            ? `Skip cleared for ${input.skill_id}`
            : `No skip record found for ${input.skill_id}`;
          result = toolSuccess(message, { reset, skill_id: input.skill_id, message });
          break;
        }
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      if (!isForget) {
        const responseText = result.content.map((c) => c.text).join('\n');
        const structuredTokens =
          'structuredContent' in result &&
          typeof result.structuredContent.tokens_used === 'number'
            ? result.structuredContent.tokens_used
            : undefined;
        logUsage({
          userId,
          apiKeyId,
          endpoint,
          status: 'success',
          latencyMs: Date.now() - started,
          tokensUsed: structuredTokens ?? estimateTokens(responseText),
        });

        const warnState = planCtx?.planWarnings;
        if (
          warnState &&
          (warnState.level === 'approaching' || warnState.level === 'critical') &&
          'structuredContent' in result
        ) {
          result.structuredContent.warnings = warnState.warnings;
        }
      }

      return result;
    } catch (err) {
      if (err instanceof PlanLimitError) {
        logUsage({
          userId,
          apiKeyId,
          endpoint,
          status: 'error',
          latencyMs: Date.now() - started,
          tokensUsed: 0,
        });
        return {
          content: [{ type: 'text', text: formatPlanLimitToolError(err) }],
          isError: true,
        };
      }
      logUsage({
        userId,
        apiKeyId,
        endpoint,
        status: 'error',
        latencyMs: Date.now() - started,
        tokensUsed: 0,
      });
      return { content: [{ type: 'text', text: sanitizeToolError(err, toolName) }], isError: true };
    }
  });

  return server;
}
