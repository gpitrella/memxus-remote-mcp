import type { ProjectProfile } from './types.js';

export const MIN_STACK_CONFIDENCE = 0.7;

const STACK_SIGNALS: Array<{
  key: string;
  field: keyof Pick<ProjectProfile, 'framework' | 'language' | 'db' | 'cms' | 'infra' | 'testing'>;
  patterns: RegExp[];
  weight: number;
  label: string;
}> = [
  { key: 'nextjs', field: 'framework', patterns: [/next\.?js/i, /app\/router/i], weight: 0.3, label: 'Next.js' },
  { key: 'react', field: 'framework', patterns: [/react(?!-native)/i], weight: 0.2, label: 'React' },
  { key: 'supabase', field: 'db', patterns: [/supabase/i, /@supabase\//i], weight: 0.25, label: 'Supabase' },
  { key: 'postgres', field: 'db', patterns: [/postgres/i, /postgresql/i], weight: 0.2, label: 'PostgreSQL' },
  { key: 'typescript', field: 'language', patterns: [/typescript/i, /\.tsx?\b/i], weight: 0.15, label: 'TypeScript' },
  { key: 'nodejs', field: 'language', patterns: [/node\.?js/i, /express/i], weight: 0.15, label: 'Node.js' },
  {
    key: 'hubspot',
    field: 'cms',
    patterns: [/hubspot/i, /hubl\b/i, /theme\.json/i, /modules\//i, /@hubspot\//i],
    weight: 0.4,
    label: 'HubSpot CMS',
  },
  { key: 'docker', field: 'infra', patterns: [/docker/i, /dockerfile/i], weight: 0.15, label: 'Docker' },
  { key: 'vitest', field: 'testing', patterns: [/vitest/i], weight: 0.1, label: 'Vitest' },
  { key: 'jest', field: 'testing', patterns: [/jest/i], weight: 0.1, label: 'Jest' },
  { key: 'mcp', field: 'framework', patterns: [/\bmcp\b/i, /modelcontextprotocol/i], weight: 0.25, label: 'MCP' },
];

export function extractBannedTokensFromCollection(collection: string | null | undefined): string[] {
  if (!collection) return [];
  const slug = collection.replace(/^project:/, '').toLowerCase();
  return slug.split(/[-_:/]+/).filter((t) => t.length > 2);
}

export function detectStack(input: {
  query: string;
  memorySnippets?: string[];
  collection?: string | null;
}): ProjectProfile {
  const memoryCorpus = (input.memorySnippets ?? []).join('\n').toLowerCase();
  const evidence: string[] = [];
  const stack: string[] = [];
  let confidence = 0;

  const profile: ProjectProfile = {
    domain: 'general',
    stack: [],
    confidence: 0,
    framework: null,
    language: null,
    db: null,
    cms: null,
    infra: null,
    testing: null,
    evidence: [],
  };

  if (memoryCorpus.length < 20) {
    return {
      ...profile,
      confidence: 0.1,
      evidence: ['insufficient project memory for stack detection'],
    };
  }

  for (const signal of STACK_SIGNALS) {
    if (signal.patterns.some((p) => p.test(memoryCorpus))) {
      confidence += signal.weight;
      stack.push(signal.key);
      evidence.push(`${signal.label} signals in memory`);
      if (!profile[signal.field]) {
        (profile as Record<string, unknown>)[signal.field] = signal.label;
      }
    }
  }

  if (profile.cms) profile.domain = 'web';
  else if (profile.framework || profile.language) profile.domain = 'web';
  else if (profile.db) profile.domain = 'data';

  confidence = Math.min(0.95, confidence);
  return {
    ...profile,
    stack: stack.slice(0, 8),
    confidence,
    evidence,
  };
}

/** @deprecated use detectStack — kept for callers expecting profileProject */
export function profileProject(input: {
  query: string;
  collection?: string | null;
  memorySnippets?: string[];
}): ProjectProfile {
  return detectStack({
    query: input.query,
    memorySnippets: input.memorySnippets,
    collection: input.collection,
  });
}
