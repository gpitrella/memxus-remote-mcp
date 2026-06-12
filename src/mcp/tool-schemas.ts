import type { Tool } from '@modelcontextprotocol/sdk/types.js';

const MEMORY_TYPE_ENUM = [
  'general',
  'preference',
  'fact',
  'instruction',
  'conversation',
] as const;

const MEMORY_TYPE_PROPERTY = {
  type: 'string',
  enum: [...MEMORY_TYPE_ENUM],
  description:
    'Memory category: general, preference, fact, instruction, or conversation. Omit to include all types.',
};

const GROUP_VISIBILITY_FIELDS = {
  visibility: {
    type: 'string',
    enum: ['private', 'shared', 'all'],
    description:
      'private = only you; shared = group memories; all = personal + accessible groups (default for recall/get_context).',
  },
  group_id: {
    type: 'string',
    description: 'UUID of a shared group. Required with visibility=shared when group_name is not set.',
  },
  group_name: {
    type: 'string',
    description: 'Exact group name (case-insensitive). Alternative to group_id for shared memories.',
  },
};

const SCOPE_FIELDS = {
  collection: {
    type: 'string',
    description:
      'Scope slug (e.g. project:henry-memory, personal:preferences). Partial names work — the server resolves similar slugs. Call list_collections first when unsure.',
  },
  tags: {
    type: 'array',
    items: { type: 'string' },
    description: 'Optional tags. A tag like project:my-app also sets collection automatically.',
  },
};

const MEMORY_ITEM_SCHEMA = {
  type: 'object',
  description: 'A single memory record.',
  properties: {
    id: { type: 'string', description: 'Memory UUID.' },
    memory_type: { type: 'string', description: 'Category of the memory.' },
    content: { type: 'string', description: 'Full memory text.' },
    importance: { type: 'number', description: 'Relevance weight from 0 to 1.' },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Tags attached to the memory.',
    },
    collection: {
      type: 'string',
      description: 'Collection slug, or empty string if uncategorized.',
    },
    created_at: { type: 'string', description: 'ISO 8601 creation timestamp.' },
  },
  required: ['id', 'memory_type', 'content'],
};

const COLLECTION_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: 'string', description: 'Collection identifier used in remember/recall.' },
    name: { type: 'string', description: 'Display name.' },
    description: { type: 'string', description: 'Optional description.' },
  },
  required: ['slug', 'name'],
};

function toolMeta(
  title: string,
  hints: {
    readOnly?: boolean;
    destructive?: boolean;
    openWorld?: boolean;
    idempotent?: boolean;
  }
): Pick<Tool, 'title' | 'annotations'> {
  return {
    title,
    annotations: {
      title,
      readOnlyHint: hints.readOnly ?? false,
      destructiveHint: hints.destructive ?? false,
      openWorldHint: hints.openWorld ?? false,
      idempotentHint: hints.idempotent ?? false,
    },
  };
}

export const MCP_TOOLS: Tool[] = [
  {
    name: 'remember',
    ...toolMeta('Remember', { openWorld: true, idempotent: false }),
    description:
      'Save important information to long-term memory. Always set collection when the topic is clear: project work → project:<slug>, personal tastes → personal:preferences. Use append_to to extend an existing memory instead of creating duplicates.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The information to remember.' },
        type: {
          ...MEMORY_TYPE_PROPERTY,
          default: 'general',
          description:
            'Category for this memory. Default: general. Use preference for tastes, fact for stable truths, instruction for rules.',
        },
        ...SCOPE_FIELDS,
        importance: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          default: 0.5,
          description:
            'Relevance weight from 0 (low) to 1 (high) for ranking in recall. Default: 0.5.',
        },
        append_to: {
          type: 'string',
          description: 'UUID of an existing memory to append to (same user). Keeps revision history.',
        },
        visibility: {
          type: 'string',
          enum: ['private', 'shared'],
          default: 'private',
          description: 'private = personal only (default). shared = save to a group (set group_id or group_name).',
        },
        group_id: GROUP_VISIBILITY_FIELDS.group_id,
        group_name: GROUP_VISIBILITY_FIELDS.group_name,
      },
      required: ['content'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string', description: 'UUID of the saved memory.' },
        memory_type: { type: 'string', description: 'Stored memory category.' },
        collection: { type: 'string', description: 'Collection slug, or empty string if none.' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags applied to the memory.',
        },
        importance: { type: 'number', description: 'Stored importance (0–1).' },
        message: { type: 'string', description: 'Human-readable confirmation (same as content text).' },
      },
      required: ['memory_id', 'memory_type', 'message'],
    },
  },
  {
    name: 'recall',
    ...toolMeta('Recall memories', { readOnly: true, openWorld: true, idempotent: true }),
    description:
      'Search long-term memory. Call list_collections first when the scope is unclear. Partial collection names are OK — the server resolves similar slugs. Put topic keywords in query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural-language search query (e.g. "Henry project stack", "user prefers dark mode").',
        },
        limit: {
          type: 'number',
          description:
            'Max results. Omit for server default (10). Capped per your plan on the server.',
        },
        type: MEMORY_TYPE_PROPERTY,
        ...SCOPE_FIELDS,
        visibility: {
          ...GROUP_VISIBILITY_FIELDS.visibility,
          default: 'all',
        },
        group_id: GROUP_VISIBILITY_FIELDS.group_id,
        group_name: GROUP_VISIBILITY_FIELDS.group_name,
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of memories returned.' },
        memories: {
          type: 'array',
          items: MEMORY_ITEM_SCHEMA,
          description: 'Matching memories, ordered by relevance.',
        },
        message: { type: 'string', description: 'Human-readable summary (same as content text).' },
      },
      required: ['count', 'memories', 'message'],
    },
  },
  {
    name: 'get_context',
    ...toolMeta('Get context', { readOnly: true, openWorld: true, idempotent: true }),
    description:
      'Build a formatted context block for the current topic. Call list_collections when unsure of the exact slug. Partial collection names are resolved server-side.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description:
            'Subject to build context for (e.g. "current project", "client meeting notes").',
        },
        max_memories: {
          type: 'number',
          description:
            'Max memories in context block. Omit for server default (10). Capped per your plan.',
        },
        type: MEMORY_TYPE_PROPERTY,
        ...SCOPE_FIELDS,
        visibility: {
          ...GROUP_VISIBILITY_FIELDS.visibility,
          default: 'all',
        },
        group_id: GROUP_VISIBILITY_FIELDS.group_id,
        group_name: GROUP_VISIBILITY_FIELDS.group_name,
      },
      required: ['topic'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic that was searched.' },
        count: { type: 'number', description: 'Number of memories included.' },
        context_block: {
          type: 'string',
          description: 'Formatted context block for injection into the conversation.',
        },
        memories: {
          type: 'array',
          items: MEMORY_ITEM_SCHEMA,
          description: 'Memories used to build the context block.',
        },
        message: { type: 'string', description: 'Human-readable output (same as content text).' },
      },
      required: ['topic', 'count', 'context_block', 'message'],
    },
  },
  {
    name: 'list_memories',
    ...toolMeta('List memories', { readOnly: true, idempotent: true }),
    description: 'List recent memories. Filter by collection, tags, or type to browse one group.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description:
            'How many memories to return. Omit for server default (20). Capped per your plan.',
        },
        full_content: {
          type: 'boolean',
          description: 'When true, return full memory text instead of a 120-character preview.',
          default: false,
        },
        type: MEMORY_TYPE_PROPERTY,
        ...SCOPE_FIELDS,
        visibility: {
          ...GROUP_VISIBILITY_FIELDS.visibility,
          default: 'all',
        },
        group_id: GROUP_VISIBILITY_FIELDS.group_id,
        group_name: GROUP_VISIBILITY_FIELDS.group_name,
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of memories listed.' },
        memories: {
          type: 'array',
          items: MEMORY_ITEM_SCHEMA,
          description: 'Recent memories matching filters.',
        },
        message: { type: 'string', description: 'Human-readable listing (same as content text).' },
      },
      required: ['count', 'memories', 'message'],
    },
  },
  {
    name: 'get_memory',
    ...toolMeta('Get memory', { readOnly: true, idempotent: true }),
    description: 'Get the full content of a single memory by its UUID (from list_memories or recall).',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string', description: 'UUID of the memory to retrieve.' },
      },
      required: ['memory_id'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ...MEMORY_ITEM_SCHEMA.properties,
        message: { type: 'string', description: 'Human-readable detail (same as content text).' },
      },
      required: ['id', 'memory_type', 'content', 'message'],
    },
  },
  {
    name: 'list_collections',
    ...toolMeta('List collections', { readOnly: true, idempotent: true }),
    description:
      'List memory collections (folders/scopes) for this user. Call before scoped recall/get_context when the user mentions a project or approximate folder name.',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of collections.' },
        collections: {
          type: 'array',
          items: COLLECTION_ITEM_SCHEMA,
          description: 'Collection slugs and metadata.',
        },
        message: { type: 'string', description: 'Human-readable listing (same as content text).' },
      },
      required: ['count', 'collections', 'message'],
    },
  },
  {
    name: 'forget',
    ...toolMeta('Forget memory', { destructive: true, idempotent: false }),
    description: 'Delete a specific memory by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description: 'UUID of the memory to delete (from list_memories or recall).',
        },
      },
      required: ['memory_id'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string', description: 'UUID of the deleted memory.' },
        deleted: { type: 'boolean', description: 'True when deletion succeeded.' },
        message: { type: 'string', description: 'Human-readable confirmation (same as content text).' },
      },
      required: ['memory_id', 'deleted', 'message'],
    },
  },
  {
    name: 'memory_stats',
    ...toolMeta('Get memory statistics', { readOnly: true, idempotent: true }),
    description: 'Show statistics about stored memories (by type and collection).',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        total: { type: 'number', description: 'Total number of memories.' },
        by_type: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'Count per memory_type.',
        },
        by_collection: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'Count per collection slug.',
        },
        message: { type: 'string', description: 'Human-readable statistics (same as content text).' },
      },
      required: ['total', 'by_type', 'by_collection', 'message'],
    },
  },
];
