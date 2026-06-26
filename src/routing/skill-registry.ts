import type { VerifiedSkill } from './types.js';

/** Curated verified skills (MVP subset aligned with agentskills.io / anthropics/skills). */
export const VERIFIED_SKILLS: VerifiedSkill[] = [
  {
    id: 'code-review',
    name: 'code-review',
    description: 'Review code changes for bugs, security, and maintainability.',
    instructions:
      'Review the diff systematically: correctness, edge cases, security, tests, and naming. Be specific and actionable.',
    verified: true,
    priority: 0.9,
    appliesTo: {
      domains: ['web', 'mobile', 'data', 'devops'],
      intents: ['review', 'fix'],
      keywords: ['pr', 'pull request', 'review', 'diff'],
    },
  },
  {
    id: 'webapp-testing',
    name: 'webapp-testing',
    description: 'Test web applications with browser automation and verification steps.',
    instructions:
      'Use structured test plans: reproduce, assert expected behavior, capture failures with repro steps.',
    verified: true,
    priority: 0.85,
    appliesTo: {
      domains: ['web'],
      intents: ['build', 'fix', 'analyze'],
      keywords: ['test', 'e2e', 'playwright', 'browser'],
    },
  },
  {
    id: 'mcp-builder',
    name: 'mcp-builder',
    description: 'Design and implement MCP servers and tools.',
    instructions:
      'Follow MCP protocol patterns: tool schemas, OAuth, structured outputs, and non-breaking evolution.',
    verified: true,
    priority: 0.88,
    appliesTo: {
      domains: ['web', 'devops'],
      intents: ['build', 'design', 'document'],
      keywords: ['mcp', 'model context protocol', 'tools'],
    },
  },
  {
    id: 'notion-spec',
    name: 'notion-spec-to-implementation',
    description: 'Turn Notion specs into implementation plans and code tasks.',
    instructions:
      'Extract requirements from specs, map to files/modules, propose incremental tasks with acceptance criteria.',
    verified: true,
    priority: 0.8,
    appliesTo: {
      domains: ['web', 'general'],
      intents: ['plan', 'build', 'document'],
      keywords: ['notion', 'spec', 'requirements'],
    },
  },
  {
    id: 'skill-creator',
    name: 'skill-creator',
    description: 'Create Agent Skills with proper SKILL.md structure.',
    instructions:
      'Use YAML frontmatter (name, description) and clear activation criteria. Keep skills focused and verifiable.',
    verified: true,
    priority: 0.7,
    appliesTo: {
      domains: ['general', 'web'],
      intents: ['document', 'design'],
      keywords: ['skill', 'agentskills', 'SKILL.md'],
    },
  },
];

export function listVerifiedSkills(): VerifiedSkill[] {
  return VERIFIED_SKILLS.filter((s) => s.verified);
}

export function getSkillById(id: string): VerifiedSkill | undefined {
  return VERIFIED_SKILLS.find((s) => s.id === id);
}
