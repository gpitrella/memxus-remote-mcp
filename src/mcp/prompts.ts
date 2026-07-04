export const MEMXUS_CONTEXT_PROMPT = 'memxus-context';
export const MEMXUS_CONTEXT_SKILLS_PROMPT = 'memxus-context-skills';

export const MEMXUS_MCP_PROMPTS = [
  {
    name: MEMXUS_CONTEXT_PROMPT,
    description: 'Load context from a Memxus collection',
    arguments: [
      {
        name: 'collection',
        description: 'Collection slug (optional — shows picker when omitted)',
        required: false,
      },
    ],
  },
  {
    name: MEMXUS_CONTEXT_SKILLS_PROMPT,
    description: 'Load context + skill suggestions from a Memxus collection',
    arguments: [
      {
        name: 'collection',
        description: 'Collection slug (optional — shows picker when omitted)',
        required: false,
      },
    ],
  },
] as const;
