export const MEMXUS_CONTEXT_PROMPT = 'memxus-context';
export const MEMXUS_CONTEXT_SKILLS_PROMPT = 'memxus-context-skills';

export const MEMXUS_CONTEXT_PROMPT_INSTRUCTION =
  'Llamá al tool get_context sin topic ni collection para mostrar el selector de colecciones. Cuando el usuario elija una colección (select_collection), llamá get_context con topic y collection iguales al slug elegido. Si el usuario pide ver todas (show_all_collections), llamá get_context con collection: "all".';

export const MEMXUS_CONTEXT_SKILLS_PROMPT_INSTRUCTION =
  'Llamá primero al tool get_context sin topic ni collection, con include_skills: true, para mostrar el selector de colecciones. Cuando el usuario elija una colección, llamá get_context_with_skills con topic y collection iguales al slug elegido. Si pide ver todas (show_all_collections), llamá get_context con collection: "all" e include_skills: true.';

export const MEMXUS_MCP_PROMPTS = [
  {
    name: MEMXUS_CONTEXT_PROMPT,
    description: 'Load context from a Memxus collection',
    arguments: [],
  },
  {
    name: MEMXUS_CONTEXT_SKILLS_PROMPT,
    description: 'Load context + skill suggestions from a Memxus collection',
    arguments: [],
  },
] as const;
