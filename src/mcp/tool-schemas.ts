import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  isInAppConnectEnabled,
  isSkillRoutingEnabled,
} from '../lib/feature-flags.js';
import { appendRenderingInstructions } from '../lib/rendering-instructions.js';
import { COLLECTIONS_CARD_RESOURCE_URI } from './collections-card.js';
import { SKILL_CARD_RESOURCE_URI } from './skill-card.js';
import type { UserMcpPreferences } from '../lib/mcp-preferences.js';
import {
  isInAppConnectActiveForUser,
  isSkillRoutingActiveForUser,
} from '../lib/mcp-preferences.js';

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
      'private = only you; shared = group memories; all = personal + accessible groups. Omit to use dashboard preference.',
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
      'Scope slug (e.g. project:memxus, personal:preferences). GitHub/Notion connector syncs use project:<slug> — one collection per project. Partial names work; call list_collections when unsure.',
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

const TOOL_UI_COLLECTIONS_CARD = {
  _meta: {
    ui: {
      resourceUri: COLLECTIONS_CARD_RESOURCE_URI,
      visibility: ['model', 'app'],
    },
  },
} as const;

const TOOL_UI_SKILL_CARD = {
  _meta: {
    ui: {
      resourceUri: SKILL_CARD_RESOURCE_URI,
      visibility: ['model', 'app'],
    },
  },
} as const;

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

export const MCP_CORE_TOOLS: Tool[] = [
  {
    name: 'remember',
    ...toolMeta('Remember', { openWorld: true, idempotent: false }),
    description:
      'Save important information to long-term memory. Always set collection when the topic is clear: project work → project:<slug>, personal tastes → personal:preferences. Use append_to to extend an existing memory instead of creating duplicates. Vector search indexing completes asynchronously within a few seconds after save.',
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
    description: appendRenderingInstructions(
      'Search long-term memory. Call list_collections when scope is unclear. For GitHub/Notion synced content use collection project:<slug> (unified per project) or tags github/notion. Connect at dashboard.memxus.com/integrations.',
    ),
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
          description:
            'Optional. Defaults to user dashboard preference (private unless include_group_memories_in_context is on).',
        },
        group_id: GROUP_VISIBILITY_FIELDS.group_id,
        group_name: GROUP_VISIBILITY_FIELDS.group_name,
        include_skills: {
          type: 'boolean',
          description:
            'When skill routing is enabled, append official skill suggestions for work intents (build/review/fix/test). Default: auto-detect from query.',
        },
        exclude_memory_ids: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description:
            'Memory IDs to exclude (for "Ampliar el contexto" follow-up calls).',
        },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of memories returned.' },
        total: {
          type: 'number',
          description: 'Total eligible memories for ranking (before LIMIT).',
        },
        memories: {
          type: 'array',
          items: MEMORY_ITEM_SCHEMA,
          description: 'Matching memories, ordered by relevance.',
        },
        message: { type: 'string', description: 'Human-readable summary (same as content text).' },
        suggested_skills: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
          description: 'Optional skill suggestions when skill routing is active.',
        },
        skills_message: { type: 'string', description: 'Formatted skills block when skill routing is active.' },
        tokens_used: { type: 'number', description: 'Estimated tokens in the injected response.' },
        impact_summary: { type: 'object', additionalProperties: true },
        impact_summary_text: { type: 'string', description: 'Token reuse line for the AHORRO block when ENABLE_IMPACT_SUMMARY is on.' },
      },
      required: ['count', 'memories', 'message'],
    },
  },
  {
    name: 'get_context',
    ...toolMeta('Get context', { readOnly: true, openWorld: true, idempotent: true }),
    ...TOOL_UI_COLLECTIONS_CARD,
    description: appendRenderingInstructions(
      'Build a formatted context block for the current topic. Omit topic and collection to show the interactive collection picker (Memxus menu flow). Call list_collections when unsure of the exact slug. Partial collection names are resolved server-side. If the user\'s first message appears to be a coding task, technical question, or project-related request, call get_context with the detected topic BEFORE responding — do not wait for the user to ask.',
    ),
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description:
            'Subject to build context for (e.g. "current project", "client meeting notes"). Omit with collection to show the collection picker.',
        },
        include_skills: {
          type: 'boolean',
          description:
            'When showing the collection picker, set true if the user chose context + skills (default false).',
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
          description:
            'Optional. Defaults to user dashboard preference (private unless include_group_memories_in_context is on).',
        },
        group_id: GROUP_VISIBILITY_FIELDS.group_id,
        group_name: GROUP_VISIBILITY_FIELDS.group_name,
        exclude_memory_ids: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description:
            'Memory IDs to exclude (for "Ampliar el contexto" follow-up calls).',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: 'collection_picker when showing the collection selector; omitted for context results.',
        },
        topic: { type: 'string', description: 'Topic that was searched.' },
        count: { type: 'number', description: 'Number of memories included.' },
        total: {
          type: 'number',
          description: 'Total eligible memories for ranking (before LIMIT).',
        },
        context_block: {
          type: 'string',
          description: 'Formatted context block for injection into the conversation.',
        },
        collections: {
          type: 'array',
          items: COLLECTION_ITEM_SCHEMA,
          description: 'Collections shown in picker mode.',
        },
        memories: {
          type: 'array',
          items: MEMORY_ITEM_SCHEMA,
          description: 'Memories used to build the context block.',
        },
        message: { type: 'string', description: 'Human-readable output (same as content text).' },
        tokens_used: { type: 'number', description: 'Estimated tokens in the context block.' },
        truncated: { type: 'boolean', description: 'True when memories were trimmed to the token budget.' },
        impact_summary: { type: 'object', additionalProperties: true },
        impact_summary_text: { type: 'string', description: 'Token reuse line for the AHORRO block when ENABLE_IMPACT_SUMMARY is on.' },
      },
      required: ['count', 'message'],
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
          description:
            'Optional. Defaults to user dashboard preference (private unless include_group_memories_in_context is on).',
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
      'List memory collections (folders/scopes) for this user. GitHub/Notion syncs appear under project:<slug> when unified collections are enabled. Call before scoped recall/get_context when the user mentions a project name.',
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
        storage_bytes_used: {
          type: 'number',
          description: 'Total storage bytes used (content + metadata + embedding).',
        },
        storage_bytes_limit: {
          type: 'number',
          description: 'Plan storage limit in bytes (-1 = unlimited).',
        },
        message: { type: 'string', description: 'Human-readable statistics (same as content text).' },
      },
      required: ['total', 'by_type', 'by_collection', 'message'],
    },
  },
  {
    name: 'update',
    ...toolMeta('Update memory', { openWorld: true, idempotent: true }),
    description:
      'Update an existing memory by ID. Use mode replace (default) to patch fields, or append to extend content. Re-embeds only when content changes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'UUID of the memory to update.' },
        content: { type: 'string', description: 'New or appended content.' },
        type: MEMORY_TYPE_PROPERTY,
        ...SCOPE_FIELDS,
        importance: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Relevance weight from 0 to 1.',
        },
        mode: {
          type: 'string',
          enum: ['replace', 'append'],
          default: 'replace',
          description: 'replace = patch fields; append = extend content with revision history.',
        },
      },
      required: ['id'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string', description: 'UUID of the updated memory.' },
        memory_type: { type: 'string', description: 'Stored memory category.' },
        collection: { type: 'string', description: 'Collection slug, or empty string if none.' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags attached to the memory.',
        },
        importance: { type: 'number', description: 'Stored importance (0–1).' },
        message: { type: 'string', description: 'Human-readable confirmation.' },
      },
      required: ['memory_id', 'memory_type', 'message'],
    },
  },
];

const MCP_INAPP_CONNECT_TOOLS: Tool[] = [
  {
    name: 'connect_source',
    ...toolMeta('Connect source', { openWorld: true, idempotent: false }),
    description:
      'Start GitHub App install or Notion OAuth from chat. Returns authUrl to open in browser and pollToken to check connection status.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['github', 'notion'],
          description: 'Source to connect.',
        },
        project_slug: {
          type: 'string',
          description: 'Optional project slug for unified project:<slug> collection.',
        },
      },
      required: ['provider'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        authUrl: { type: 'string', description: 'URL to authorize the connection.' },
        pollToken: { type: 'string', description: 'Token to poll connection status.' },
        message: { type: 'string', description: 'Human-readable instructions.' },
      },
      required: ['authUrl', 'pollToken', 'message'],
    },
  },
  {
    name: 'list_syncable_items',
    ...toolMeta('List syncable items', { readOnly: true, idempotent: true }),
    description:
      'List GitHub repositories or Notion pages available to sync after connect_source. Requires sources:read scope.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['github', 'notion'],
          description: 'Connected source provider.',
        },
      },
      required: ['provider'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of items.' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              meta: { type: 'object', additionalProperties: true },
            },
            required: ['id', 'label'],
          },
        },
        message: { type: 'string', description: 'Human-readable listing.' },
      },
      required: ['count', 'items', 'message'],
    },
  },
  {
    name: 'set_sync_selection',
    ...toolMeta('Set sync selection', { openWorld: true, idempotent: true }),
    description:
      'Save which repos or Notion pages to sync, then trigger initial sync. GitHub ids are full_name; Notion ids are page UUIDs.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['github', 'notion'],
          description: 'Source provider.',
        },
        itemIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Selected item identifiers from list_syncable_items.',
        },
        project_slug: {
          type: 'string',
          description: 'Optional project slug for project:<slug> collection.',
        },
      },
      required: ['provider', 'itemIds'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        selected: { type: 'number' },
        sync_ok: { type: 'boolean' },
        message: { type: 'string' },
      },
      required: ['ok', 'selected', 'message'],
    },
  },
  {
    name: 'check_connect_status',
    ...toolMeta('Check connect status', { readOnly: true, idempotent: true }),
    description:
      'Poll whether GitHub or Notion finished connecting after connect_source. Pass the pollToken from connect_source.',
    inputSchema: {
      type: 'object',
      properties: {
        poll_token: {
          type: 'string',
          description: 'pollToken returned by connect_source.',
        },
      },
      required: ['poll_token'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        connected: { type: 'boolean' },
        provider: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['connected', 'message'],
    },
  },
];

export const MCP_SKILL_ROUTING_TOOLS: Tool[] = [
  {
    name: 'get_context_with_skills',
    ...toolMeta('Get context with skills', { readOnly: true, openWorld: true, idempotent: true }),
    ...TOOL_UI_SKILL_CARD,
    description:
      'Build context for a topic and suggest official Agent Skills from skills.sh. Compatible clients can render an interactive skill card; all clients still receive plain text fallback.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Subject to build context for.',
        },
        max_memories: {
          type: 'number',
          description: 'Max memories in context block.',
        },
        type: MEMORY_TYPE_PROPERTY,
        ...SCOPE_FIELDS,
        visibility: {
          ...GROUP_VISIBILITY_FIELDS.visibility,
          description:
            'Optional. Defaults to user dashboard preference (private unless include_group_memories_in_context is on).',
        },
        group_id: GROUP_VISIBILITY_FIELDS.group_id,
        group_name: GROUP_VISIBILITY_FIELDS.group_name,
        exclude_memory_ids: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description:
            'Memory IDs to exclude (for "Ampliar el contexto" follow-up calls).',
        },
      },
      required: ['topic'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        count: { type: 'number' },
        total: { type: 'number', description: 'Total eligible memories for ranking.' },
        context_block: { type: 'string' },
        profile: { type: 'object', additionalProperties: true },
        intent: { type: 'object', additionalProperties: true },
        active_skills: { type: 'array', items: { type: 'object', additionalProperties: true } },
        suggestions: { type: 'array', items: { type: 'object', additionalProperties: true } },
        presentation_hint: { type: 'string' },
        discovery_degraded: { type: 'boolean' },
        memories: { type: 'array', items: MEMORY_ITEM_SCHEMA },
        requires_approval: { type: 'boolean' },
        message: { type: 'string' },
        user_facing_template: { type: 'string' },
        tokens_used: { type: 'number' },
        truncated: { type: 'boolean' },
        skill_card: { type: 'object', additionalProperties: true },
        presentation: { type: 'object', additionalProperties: true },
        impact_summary: { type: 'object', additionalProperties: true },
        impact_summary_text: { type: 'string' },
      },
      required: ['topic', 'count', 'context_block', 'requires_approval', 'message'],
    },
  },
  {
    name: 'suggest_skills',
    ...toolMeta('Suggest skills', { readOnly: true, openWorld: true, idempotent: true }),
    description: appendRenderingInstructions(
      'Discover official Agent Skills for a topic via skills.sh without building a full context block. Compatible clients can render an interactive skill card; all clients still receive plain text fallback.',
    ),
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Subject to find skills for (e.g. "nextjs testing", "mcp server").',
        },
        collection: {
          type: 'string',
          description: 'Optional collection scope (e.g. project:my-app).',
        },
        max_memories: {
          type: 'number',
          description: 'Optional memories to sample for stack detection (default 5).',
        },
      },
      required: ['topic'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        count: { type: 'number' },
        total: { type: 'number' },
        active_skills: { type: 'array', items: { type: 'object', additionalProperties: true } },
        suggestions: { type: 'array', items: { type: 'object', additionalProperties: true } },
        presentation_hint: { type: 'string' },
        skills_message: { type: 'string' },
        profile: { type: 'object', additionalProperties: true },
        intent: { type: 'object', additionalProperties: true },
        discovery_degraded: { type: 'boolean' },
        requires_approval: { type: 'boolean' },
        message: { type: 'string' },
        user_facing_template: { type: 'string' },
        skill_card: { type: 'object', additionalProperties: true },
        presentation: { type: 'object', additionalProperties: true },
      },
      required: ['topic', 'active_skills', 'requires_approval', 'message'],
    },
  },
];

const MCP_SKILL_ACTION_TOOLS: Tool[] = [
  {
    name: 'use_skill_in_chat',
    ...toolMeta('Use skill in chat', { readOnly: true, openWorld: true, idempotent: false }),
    description:
      'Load a suggested skill into the current chat session (no local install). Call after the user replies "use N" to a suggest_skills or get_context_with_skills result.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'Skill id from active_skills (e.g. anthropics/skills/supabase).' },
        collection: { type: 'string', description: 'Collection scope (e.g. project:my-app).' },
        chat_session_id: { type: 'string', description: 'Optional session id for analytics.' },
      },
      required: ['skill_id', 'collection'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        instructions: { type: 'string' },
        source: { type: 'string', enum: ['official', 'community'] },
        warning: { type: 'string' },
        message: { type: 'string' },
        user_facing_template: { type: 'string' },
        skill_tokens_used: { type: 'number' },
        skill_impact_text: { type: 'string' },
      },
      required: ['instructions', 'source', 'message'],
    },
  },
  {
    name: 'install_skill',
    ...toolMeta('Install skill', { readOnly: true, openWorld: true, idempotent: false }),
    description:
      'Return the install command for a suggested skill. Set confirmed=true after the user runs the command in their terminal. Install can be unavailable on web/mobile surfaces.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string' },
        collection: { type: 'string' },
        install_command: { type: 'string', description: 'From active_skills installCommand.' },
        confirmed: { type: 'boolean', description: 'True after user ran the install command.' },
        chat_session_id: { type: 'string' },
      },
      required: ['skill_id', 'collection', 'install_command'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        install_command: { type: 'string' },
        confirmed: { type: 'boolean' },
        message: { type: 'string' },
      },
      required: ['install_command', 'confirmed', 'message'],
    },
  },
  {
    name: 'skip_skill',
    ...toolMeta('Skip skill', { readOnly: false, idempotent: true }),
    description:
      'Record that the user chose to omit a suggested skill for this collection (reply "skip N" or "omitir").',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string' },
        collection: { type: 'string' },
        chat_session_id: { type: 'string' },
        correlation_id: {
          type: 'string',
          description: 'Optional client correlation id for button analytics.',
        },
      },
      required: ['skill_id', 'collection'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string' },
        collection: { type: 'string' },
        skipped: { type: 'boolean' },
        message: { type: 'string' },
      },
      required: ['skill_id', 'collection', 'skipped', 'message'],
    },
  },
  {
    name: 'reset_skill_decision',
    ...toolMeta('Reset skill decision', { readOnly: false, idempotent: true }),
    description: 'Clear a skip decision so a skill can be suggested again for a collection.',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string' },
        collection: { type: 'string' },
      },
      required: ['skill_id', 'collection'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        reset: { type: 'boolean' },
        skill_id: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['reset', 'skill_id', 'message'],
    },
  },
];

function patchSkillRoutingToolDescriptions(tools: Tool[]): Tool[] {
  return tools.map((t) => {
    if (t.name === 'get_context') {
      return {
        ...t,
        description: `${t.description} When skill routing is enabled, prefer get_context_with_skills — same memory context plus ranked skill suggestions.`,
      };
    }
    if (t.name === 'get_context_with_skills') {
      return {
        ...t,
        description: appendRenderingInstructions(
          'Preferred context tool when skill routing is on. Builds memory context and suggests matching Agent Skills (default: use in chat, no install). User must approve via use N | install N | skip N.',
        ),
      };
    }
    return t;
  });
}

export function getActiveMcpTools(opts?: { prefs?: UserMcpPreferences }): Tool[] {
  const tools = [...MCP_CORE_TOOLS];
  const prefs = opts?.prefs;
  const skillRoutingOn = prefs
    ? isSkillRoutingActiveForUser(prefs)
    : isSkillRoutingEnabled();
  if (prefs) {
    if (isInAppConnectActiveForUser(prefs)) tools.push(...MCP_INAPP_CONNECT_TOOLS);
    if (isSkillRoutingActiveForUser(prefs)) {
      tools.push(...MCP_SKILL_ROUTING_TOOLS, ...MCP_SKILL_ACTION_TOOLS);
    }
  } else {
    if (isInAppConnectEnabled()) tools.push(...MCP_INAPP_CONNECT_TOOLS);
    if (isSkillRoutingEnabled()) {
      tools.push(...MCP_SKILL_ROUTING_TOOLS, ...MCP_SKILL_ACTION_TOOLS);
    }
  }
  return skillRoutingOn ? patchSkillRoutingToolDescriptions(tools) : tools;
}

/** Active tool list (respects feature flags at process start). */
export const MCP_TOOLS = getActiveMcpTools();
