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
  listCollections,
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
import { estimateTokens } from '../lib/estimate-tokens.js';

export interface McpContext {
  userId: string;
  apiKeyId?: string;
}

const memoryTypeEnum = z.enum(['general', 'preference', 'fact', 'instruction', 'conversation']);

const scopeFields = {
  collection: {
    type: 'string',
    description:
      'Scope slug for this memory (e.g. project:henry-memory, personal:preferences, work:client-x). Use the same collection in recall/get_context when the user asks about that topic.',
  },
  tags: {
    type: 'array',
    items: { type: 'string' },
    description: 'Optional tags. A tag like project:my-app also sets collection automatically.',
  },
};

const TOOLS: Tool[] = [
  {
    name: 'remember',
    description:
      'Save important information to long-term memory. Always set collection when the topic is clear: project work → project:<slug>, personal tastes → personal:preferences. Use append_to to extend an existing memory instead of creating duplicates.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The information to remember.' },
        type: {
          type: 'string',
          enum: ['general', 'preference', 'fact', 'instruction', 'conversation'],
          default: 'general',
        },
        ...scopeFields,
        importance: { type: 'number', minimum: 0, maximum: 1, default: 0.5 },
        append_to: {
          type: 'string',
          description: 'UUID of an existing memory to append to (same user). Keeps revision history.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'recall',
    description:
      'Search long-term memory. Pass collection (and/or tags, type) to search only that scope — e.g. collection=project:henry-memory for project questions, collection=personal:preferences for tastes.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', default: 5, minimum: 1, maximum: 20 },
        type: {
          type: 'string',
          enum: ['general', 'preference', 'fact', 'instruction', 'conversation'],
        },
        ...scopeFields,
      },
      required: ['query'],
    },
  },
  {
    name: 'get_context',
    description:
      'Build a formatted context block for the current topic. Use collection to limit results to one domain (project, preferences, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        max_memories: { type: 'number', default: 5, minimum: 1, maximum: 10 },
        type: {
          type: 'string',
          enum: ['general', 'preference', 'fact', 'instruction', 'conversation'],
        },
        ...scopeFields,
      },
      required: ['topic'],
    },
  },
  {
    name: 'list_memories',
    description: 'List recent memories. Filter by collection, tags, or type to browse one group.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 10, minimum: 1, maximum: 50 },
        type: {
          type: 'string',
          enum: ['general', 'preference', 'fact', 'instruction', 'conversation'],
        },
        ...scopeFields,
      },
    },
  },
  {
    name: 'list_collections',
    description:
      'List memory collections (folders/scopes) for this user. Use slugs in remember/recall/get_context.',
    inputSchema: { type: 'object', properties: {} },
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
    description: 'Show statistics about stored memories (by type and collection).',
    inputSchema: { type: 'object', properties: {} },
  },
];

function formatMemoryLine(m: {
  id: string;
  memory_type: string;
  importance: number;
  tags: string[];
  collection: string | null;
  content: string;
  created_at: string;
}, i: number, verbose = true): string {
  const coll = m.collection ? ` | Collection: ${m.collection}` : '';
  if (!verbose) {
    return `[${i + 1}] ID: ${m.id}\n[${m.memory_type}] ${m.content.slice(0, 120)}${m.content.length > 120 ? '...' : ''}\nTags: ${m.tags.join(', ') || 'none'}${coll} | ${new Date(m.created_at).toLocaleDateString()}`;
  }
  return `[${i + 1}] ID: ${m.id}\nType: ${m.memory_type} | Importance: ${m.importance}\nTags: ${m.tags.join(', ') || 'none'}${coll}\n${m.content}\nSaved: ${new Date(m.created_at).toLocaleDateString()}`;
}

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
              type: memoryTypeEnum.default('general'),
              tags: z.array(z.string()).default([]),
              collection: z.string().optional().nullable(),
              importance: z.number().min(0).max(1).default(0.5),
              append_to: z.string().uuid().optional(),
            })
            .parse(a);
          const m = await saveMemory({
            userId,
            content: input.content,
            type: input.type,
            tags: input.tags,
            collection: input.collection,
            importance: input.importance,
            append_to: input.append_to,
          });
          result = {
            content: [
              {
                type: 'text',
                text: `Remembered (ID: ${m.id})\nType: ${m.memory_type}\nCollection: ${m.collection || 'none'}\nTags: ${m.tags.join(', ') || 'none'}\nImportance: ${m.importance}`,
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
              type: memoryTypeEnum.optional(),
              collection: z.string().optional().nullable(),
              tags: z.array(z.string()).optional(),
            })
            .parse(a);
          const ms = await searchMemories({
            userId,
            query: input.query,
            limit: input.limit,
            type: input.type,
            collection: input.collection,
            tags: input.tags,
          });
          if (ms.length === 0) {
            const scope = input.collection ? ` in collection "${input.collection}"` : '';
            result = { content: [{ type: 'text', text: `No memories found for that query${scope}.` }] };
          } else {
            const formatted = ms.map((m, i) => formatMemoryLine(m, i)).join('\n\n---\n\n');
            result = { content: [{ type: 'text', text: `Found ${ms.length}:\n\n${formatted}` }] };
          }
          break;
        }
        case 'get_context': {
          const input = z
            .object({
              topic: z.string().min(1),
              max_memories: z.number().int().min(1).max(10).default(5),
              type: memoryTypeEnum.optional(),
              collection: z.string().optional().nullable(),
              tags: z.array(z.string()).optional(),
            })
            .parse(a);
          const ms = await searchMemories({
            userId,
            query: input.topic,
            limit: input.max_memories,
            type: input.type,
            collection: input.collection,
            tags: input.tags,
          });
          if (ms.length === 0) {
            const scope = input.collection ? ` (collection: ${input.collection})` : '';
            result = {
              content: [{ type: 'text', text: `No relevant memories found for this topic${scope}.` }],
            };
          } else {
            const collLine = input.collection ? `Collection: ${input.collection}\n` : '';
            const block = [
              '=== AI Memory Context ===',
              `Topic: ${input.topic}`,
              collLine + `Memories retrieved: ${ms.length}`,
              '',
              ...ms.map((m, i) => {
                const coll = m.collection ? ` [${m.collection}]` : '';
                return `[${i + 1}] [${m.memory_type.toUpperCase()}]${coll} ${m.content}`;
              }),
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
              type: memoryTypeEnum.optional(),
              collection: z.string().optional().nullable(),
              tags: z.array(z.string()).optional(),
            })
            .parse(a);
          const ms = await listMemories({
            userId,
            limit: input.limit,
            type: input.type,
            collection: input.collection,
            tags: input.tags,
          });
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
            const formatted = ms.map((m, i) => formatMemoryLine(m, i, false)).join('\n\n');
            result = {
              content: [
                { type: 'text', text: `Your ${ms.length} most recent memories:\n\n${formatted}` },
              ],
            };
          }
          break;
        }
        case 'list_collections': {
          const cols = await listCollections(userId);
          if (cols.length === 0) {
            result = {
              content: [
                {
                  type: 'text',
                  text:
                    'No collections yet. Use remember with collection=project:<name> or personal:preferences.',
                },
              ],
            };
          } else {
            const lines = cols.map(
              (c, i) =>
                `[${i + 1}] ${c.slug}${c.name !== c.slug ? ` (${c.name})` : ''}${c.description ? `\n    ${c.description}` : ''}`
            );
            result = {
              content: [{ type: 'text', text: `Collections (${cols.length}):\n\n${lines.join('\n')}` }],
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
          const typeBreakdown = Object.entries(s.byType)
            .map(([t, c]) => `  ${t}: ${c}`)
            .join('\n');
          const collBreakdown = Object.entries(s.byCollection)
            .map(([t, c]) => `  ${t}: ${c}`)
            .join('\n');
          result = {
            content: [
              {
                type: 'text',
                text: `Memory Statistics\n\nTotal: ${s.total}\n\nBy type:\n${typeBreakdown || '  (none)'}\n\nBy collection:\n${collBreakdown || '  (none)'}`,
              },
            ],
          };
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
      const message = err instanceof Error ? err.message : 'Unknown error';
      logUsage({
        userId,
        apiKeyId,
        endpoint,
        status: 'error',
        latencyMs: Date.now() - started,
        tokensUsed: 0,
      });
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  });

  return server;
}
