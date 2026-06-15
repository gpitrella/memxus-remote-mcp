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
import { sanitizeToolError } from '../lib/tool-errors.js';
import { MCP_TOOLS } from './tool-schemas.js';
import {
  formatMemoryLine,
  formatRememberText,
  formatGetMemoryText,
  formatContextBlock,
  formatMemoryStatsText,
} from './format-memory.js';
import { toolSuccess, toStructuredMemory, toStructuredMemories, type ToolSuccessResult } from './tool-results.js';

export { MCP_TOOLS } from './tool-schemas.js';

export interface McpContext {
  userId: string;
  apiKeyId?: string;
  workforceWorkspaceId?: string;
}

const memoryTypeEnum = z.enum(['general', 'preference', 'fact', 'instruction', 'conversation']);

export function createMCPServer(ctx: McpContext): Server {
  const { userId, apiKeyId, workforceWorkspaceId } = ctx;
  const server = new Server(
    { name: 'aimemory-remote', version: '1.0.2' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOLS }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

  // Glama Inspector probes optional MCP methods; empty lists avoid -32601 Method not found.
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
    const isWriteMemory = toolName === 'remember';
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
          const input = z
            .object({
              content: z.string().min(1),
              type: memoryTypeEnum.default('general'),
              tags: z.array(z.string()).default([]),
              collection: z.string().optional().nullable(),
              importance: z.number().min(0).max(1).default(0.5),
              append_to: z.string().uuid().optional(),
              visibility: z.enum(['private', 'shared']).default('private'),
              group_id: z.string().uuid().optional(),
              group_name: z.string().optional(),
            })
            .parse(a);
          const m = await saveMemory({
            userId,
            workforceWorkspaceId,
            content: input.content,
            type: input.type,
            tags: input.tags,
            collection: input.collection,
            importance: input.importance,
            append_to: input.append_to,
            visibility: input.visibility,
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
            message: text,
          });
          invalidatePlanContextCache(userId);
          break;
        }
        case 'recall': {
          const input = z
            .object({
              query: z.string().min(1),
              limit: z.number().int().optional(),
              type: memoryTypeEnum.optional(),
              collection: z.string().optional().nullable(),
              tags: z.array(z.string()).optional(),
              visibility: z.enum(['private', 'shared', 'all']).default('all'),
              group_id: z.string().uuid().optional(),
              group_name: z.string().optional(),
            })
            .parse(a);
          const searchLimit = resolveSearchLimit(limits, input.limit);
          const ms = await searchMemories({
            userId,
            workforceWorkspaceId,
            query: input.query,
            limit: searchLimit,
            planLimits: limits,
            type: input.type,
            collection: input.collection,
            tags: input.tags,
            visibility: input.visibility,
            group_id: input.group_id,
            group_name: input.group_name,
          });
          if (ms.length === 0) {
            const scope = input.collection ? ` in collection "${input.collection}"` : '';
            const text = `No memories found for that query${scope}.`;
            result = toolSuccess(text, {
              count: 0,
              memories: [],
              message: text,
            });
          } else {
            const formatted = ms.map((m, i) => formatMemoryLine(m, i)).join('\n\n---\n\n');
            const text = `Found ${ms.length}:\n\n${formatted}`;
            result = toolSuccess(text, {
              count: ms.length,
              memories: toStructuredMemories(ms),
              message: text,
            });
          }
          break;
        }
        case 'get_context': {
          const input = z
            .object({
              topic: z.string().min(1),
              max_memories: z.number().int().optional(),
              type: memoryTypeEnum.optional(),
              collection: z.string().optional().nullable(),
              tags: z.array(z.string()).optional(),
              visibility: z.enum(['private', 'shared', 'all']).default('all'),
              group_id: z.string().uuid().optional(),
              group_name: z.string().optional(),
            })
            .parse(a);
          const contextLimit = resolveSearchLimit(limits, input.max_memories);
          const ms = await searchMemories({
            userId,
            workforceWorkspaceId,
            query: input.topic,
            limit: contextLimit,
            planLimits: limits,
            type: input.type,
            collection: input.collection,
            tags: input.tags,
            visibility: input.visibility,
            group_id: input.group_id,
            group_name: input.group_name,
          });
          if (ms.length === 0) {
            const scope = input.collection ? ` (collection: ${input.collection})` : '';
            const text = `No relevant memories found for this topic${scope}.`;
            result = toolSuccess(text, {
              topic: input.topic,
              count: 0,
              context_block: text,
              memories: [],
              message: text,
            });
          } else {
            const block = formatContextBlock(input.topic, input.collection, ms);
            result = toolSuccess(block, {
              topic: input.topic,
              count: ms.length,
              context_block: block,
              memories: toStructuredMemories(ms),
              message: block,
            });
          }
          break;
        }
        case 'list_memories': {
          const input = z
            .object({
              limit: z.number().int().optional(),
              full_content: z.boolean().default(false),
              type: memoryTypeEnum.optional(),
              collection: z.string().optional().nullable(),
              tags: z.array(z.string()).optional(),
              visibility: z.enum(['private', 'shared', 'all']).default('all'),
              group_id: z.string().uuid().optional(),
              group_name: z.string().optional(),
            })
            .parse(a);
          const listLimit = resolveListLimit(limits, input.limit);
          const ms = await listMemories({
            userId,
            workforceWorkspaceId,
            limit: listLimit,
            planLimits: limits,
            type: input.type,
            collection: input.collection,
            tags: input.tags,
            visibility: input.visibility,
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
          const s = await getStats(userId, workforceWorkspaceId);
          const text = formatMemoryStatsText(s);
          result = toolSuccess(text, {
            total: s.total,
            by_type: s.byType,
            by_collection: s.byCollection,
            message: text,
          });
          break;
        }
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      if (!isForget) {
        const responseText = result.content.map((c) => c.text).join('\n');
        logUsage({
          userId,
          apiKeyId,
          endpoint,
          status: 'success',
          latencyMs: Date.now() - started,
          tokensUsed: estimateTokens(responseText),
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
