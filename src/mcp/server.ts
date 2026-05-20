import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  saveMemory,
  searchMemories,
  listMemories,
  deleteMemory,
  getStats,
} from './tools.js';
import { RESOURCES, readResource } from './resources.js';
import {
  assertWithinPlanLimits,
  formatPlanLimitToolError,
  logUsage,
  PlanLimitError,
} from '../lib/plan-enforcement.js';

export interface McpContext {
  userId: string;
  apiKeyId?: string;
}

const TOOLS: Tool[] = [
  {
    name: 'remember',
    description:
      'Save important information to long-term memory. Use when the user shares preferences, facts, decisions, instructions, or anything to recall later.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The information to remember.' },
        type: {
          type: 'string',
          enum: ['general', 'preference', 'fact', 'instruction', 'conversation'],
          default: 'general',
        },
        tags: { type: 'array', items: { type: 'string' }, default: [] },
        importance: { type: 'number', minimum: 0, maximum: 1, default: 0.5 },
      },
      required: ['content'],
    },
  },
  {
    name: 'recall',
    description:
      'Search long-term memory for information relevant to the current conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', default: 5, minimum: 1, maximum: 20 },
        type: {
          type: 'string',
          enum: ['general', 'preference', 'fact', 'instruction', 'conversation'],
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_context',
    description:
      'Build a formatted context block with memories relevant to the current topic.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        max_memories: { type: 'number', default: 5, minimum: 1, maximum: 10 },
      },
      required: ['topic'],
    },
  },
  {
    name: 'list_memories',
    description: 'List the most recent memories stored.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 10, minimum: 1, maximum: 50 },
        type: {
          type: 'string',
          enum: ['general', 'preference', 'fact', 'instruction', 'conversation'],
        },
      },
    },
  },
  {
    name: 'forget',
    description: 'Delete a specific memory by ID.',
    inputSchema: {
      type: 'object',
      properties: { memory_id: { type: 'string' } },
      required: ['memory_id'],
    },
  },
  {
    name: 'memory_stats',
    description: 'Show statistics about the stored memories.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export function createMCPServer(ctx: McpContext): Server {
  const { userId, apiKeyId } = ctx;
  const server = new Server(
    { name: 'aimemory-remote', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

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
      if (!isForget) {
        await assertWithinPlanLimits({
          userId,
          toolOrEndpoint: endpoint,
          isForget: false,
          isWriteMemory,
        });
      }

      const a = (req.params.arguments ?? {}) as Record<string, unknown>;
      let result: { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

      switch (toolName) {
        case 'remember': {
          const input = z
            .object({
              content: z.string().min(1),
              type: z
                .enum(['general', 'preference', 'fact', 'instruction', 'conversation'])
                .default('general'),
              tags: z.array(z.string()).default([]),
              importance: z.number().min(0).max(1).default(0.5),
            })
            .parse(a);
          const m = await saveMemory({ userId, ...input });
          result = {
            content: [
              {
                type: 'text',
                text: `Remembered (ID: ${m.id})\nType: ${m.memory_type}\nTags: ${m.tags.join(', ') || 'none'}\nImportance: ${m.importance}`,
              },
            ],
          };
          break;
        }
        case 'recall': {
          const input = z
            .object({
              query: z.string().min(1),
              limit: z.number().int().min(1).max(20).default(5),
              type: z
                .enum(['general', 'preference', 'fact', 'instruction', 'conversation'])
                .optional(),
            })
            .parse(a);
          const ms = await searchMemories({ userId, ...input });
          if (ms.length === 0) {
            result = { content: [{ type: 'text', text: 'No memories found for that query.' }] };
          } else {
            const formatted = ms
              .map(
                (m, i) =>
                  `[${i + 1}] ID: ${m.id}\nType: ${m.memory_type} | Importance: ${m.importance}\nTags: ${m.tags.join(', ') || 'none'}\n${m.content}\nSaved: ${new Date(m.created_at).toLocaleDateString()}`
              )
              .join('\n\n---\n\n');
            result = { content: [{ type: 'text', text: `Found ${ms.length}:\n\n${formatted}` }] };
          }
          break;
        }
        case 'get_context': {
          const input = z
            .object({
              topic: z.string().min(1),
              max_memories: z.number().int().min(1).max(10).default(5),
            })
            .parse(a);
          const ms = await searchMemories({
            userId,
            query: input.topic,
            limit: input.max_memories,
          });
          if (ms.length === 0) {
            result = {
              content: [{ type: 'text', text: 'No relevant memories found for this topic.' }],
            };
          } else {
            const block = [
              '=== AI Memory Context ===',
              `Topic: ${input.topic}`,
              `Memories retrieved: ${ms.length}`,
              '',
              ...ms.map((m, i) => `[${i + 1}] [${m.memory_type.toUpperCase()}] ${m.content}`),
              '',
              '=== End of Memory Context ===',
            ].join('\n');
            result = { content: [{ type: 'text', text: block }] };
          }
          break;
        }
        case 'list_memories': {
          const input = z
            .object({
              limit: z.number().int().min(1).max(50).default(10),
              type: z
                .enum(['general', 'preference', 'fact', 'instruction', 'conversation'])
                .optional(),
            })
            .parse(a);
          const ms = await listMemories({ userId, ...input });
          if (ms.length === 0) {
            result = {
              content: [
                {
                  type: 'text',
                  text: 'No memories stored yet. Use the `remember` tool to save information.',
                },
              ],
            };
          } else {
            const formatted = ms
              .map(
                (m, i) =>
                  `[${i + 1}] ID: ${m.id}\n[${m.memory_type}] ${m.content.slice(0, 120)}${m.content.length > 120 ? '...' : ''}\nTags: ${m.tags.join(', ') || 'none'} | ${new Date(m.created_at).toLocaleDateString()}`
              )
              .join('\n\n');
            result = {
              content: [
                { type: 'text', text: `Your ${ms.length} most recent memories:\n\n${formatted}` },
              ],
            };
          }
          break;
        }
        case 'forget': {
          const input = z
            .object({ memory_id: z.string().uuid('memory_id must be a valid UUID') })
            .parse(a);
          await deleteMemory({ userId, memoryId: input.memory_id });
          result = {
            content: [{ type: 'text', text: `Memory ${input.memory_id} deleted.` }],
          };
          break;
        }
        case 'memory_stats': {
          const s = await getStats(userId);
          const breakdown = Object.entries(s.byType)
            .map(([t, c]) => `  ${t}: ${c}`)
            .join('\n');
          result = {
            content: [
              {
                type: 'text',
                text: `Memory Statistics\n\nTotal: ${s.total}\n\nBy type:\n${breakdown || '  (no memories yet)'}`,
              },
            ],
          };
          break;
        }
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      if (!isForget) {
        logUsage({
          userId,
          apiKeyId,
          endpoint,
          status: 'success',
          latencyMs: Date.now() - started,
        });
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
        });
        return {
          content: [{ type: 'text', text: formatPlanLimitToolError(err) }],
          isError: true,
        };
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      logUsage({
        userId,
        apiKeyId,
        endpoint,
        status: 'error',
        latencyMs: Date.now() - started,
      });
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  });

  return server;
}
