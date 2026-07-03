import { MIN_STACK_CONFIDENCE } from '../routing/project-profiler.js';
import {
  extractContextBullets,
  formatContextCompletenessLine,
  type BulletMemoryInput,
} from './context-bullets.js';
import {
  formatContextReuseSummary,
  formatSkillInjectedSummary,
} from './impact-summary.js';

const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

export type UserFacingSkill = {
  name: string;
  reason: string;
  source: string;
};

export type UserFacingTemplateInput = {
  collection?: string | null;
  topic?: string;
  memoryCount?: number;
  totalMemories?: number;
  contextBlock?: string;
  memoryRows?: BulletMemoryInput[];
  tokensUsed?: number;
  impactSummaryText?: string;
  skillImpactText?: string;
  skills?: UserFacingSkill[];
  stackConfidence?: number;
  environment?: 'editor' | 'chat';
  mode?: 'context' | 'skill_load';
};

function formatCollectionLabel(collection?: string | null): string {
  const trimmed = collection?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'tu proyecto';
}

function buildSkillsSection(
  skills: UserFacingSkill[],
  stackConfidence: number | undefined,
  environment: 'editor' | 'chat',
): string[] {
  if (!skills.length) return [];
  if (stackConfidence !== undefined && stackConfidence < MIN_STACK_CONFIDENCE) return [];

  const lines = ['SKILLS SUGERIDAS'];
  for (const [i, skill] of skills.slice(0, 2).entries()) {
    const communityTag = skill.source === 'community' ? ' (community)' : '';
    const actions =
      environment === 'chat'
        ? 'usar en chat / omitir'
        : 'usar en chat / instalar / omitir';
    lines.push(`${i + 1}. ${skill.name}${communityTag} — ${actions}`);
  }
  return lines;
}

function buildContextSection(input: UserFacingTemplateInput): string[] {
  const topic = input.topic?.trim() || 'este tema';
  const collection = formatCollectionLabel(input.collection);
  const count = input.memoryCount ?? 0;
  const total = input.totalMemories ?? count;

  const lines = [`CONTEXTO — ${collection}`];
  lines.push(formatContextCompletenessLine(count, total, topic));

  if (count > 0 && input.contextBlock) {
    const bullets = extractContextBullets({
      contextBlock: input.contextBlock,
      memories: input.memoryRows ?? [],
    });
    if (bullets.length > 0) {
      lines.push('');
      for (const bullet of bullets) {
        lines.push(`• ${bullet}`);
      }
    }
  }

  return lines;
}

function buildSavingsSection(input: UserFacingTemplateInput): string[] {
  const lines: string[] = [];

  if (input.skillImpactText?.trim()) {
    lines.push(input.skillImpactText.trim());
  } else if (input.tokensUsed !== undefined && input.tokensUsed > 0) {
    lines.push(formatContextReuseSummary(input.tokensUsed));
  } else if (input.impactSummaryText?.trim()) {
    lines.push(input.impactSummaryText.trim());
  }

  return lines;
}

function buildQuestionLine(topic?: string, count?: number, total?: number): string {
  const subject = topic?.trim() || 'esto';
  const base = `¿Qué querés hacer con ${subject}? · Seguir con la tarea · Guardar una decisión`;
  if (count !== undefined && total !== undefined && count < total) {
    return `${base} · Ampliar el contexto`;
  }
  if (count !== undefined && total !== undefined && count >= total && total > 0) {
    return `${base} · Ampliar el contexto (ya mostré todas las memorias disponibles)`;
  }
  return `${base} · Ampliar el contexto`;
}

export function toUserFacingSkills(
  suggestions?: Array<{ name: string; reason: string; source?: string }>,
  activeSkills?: Array<{ name: string; reason: string; official?: boolean }>,
): UserFacingSkill[] {
  if (suggestions?.length) {
    return suggestions.slice(0, 2).map((s) => ({
      name: s.name,
      reason: s.reason,
      source: s.source ?? 'community',
    }));
  }
  return (activeSkills ?? []).slice(0, 2).map((s) => ({
    name: s.name,
    reason: s.reason,
    source: s.official ? 'official' : 'community',
  }));
}

export function buildUserFacingTemplate(input: UserFacingTemplateInput): string {
  const environment = input.environment ?? 'editor';
  const lines: string[] = [SEPARATOR, ''];

  if (input.mode === 'skill_load') {
    if (input.skillImpactText?.trim()) {
      lines.push(input.skillImpactText.trim());
    }
    lines.push('');
    lines.push(buildQuestionLine(input.topic));
    lines.push('');
    lines.push(SEPARATOR);
    return lines.join('\n');
  }

  lines.push(...buildContextSection(input));

  const skillLines = buildSkillsSection(
    input.skills ?? [],
    input.stackConfidence,
    environment,
  );
  if (skillLines.length > 0) {
    lines.push('');
    lines.push(...skillLines);
  }

  const savings = buildSavingsSection(input);
  if (savings.length > 0) {
    lines.push('');
    lines.push(...savings);
  }

  lines.push('');
  lines.push(
    buildQuestionLine(input.topic, input.memoryCount, input.totalMemories ?? input.memoryCount),
  );
  lines.push('');
  lines.push(SEPARATOR);

  return lines.join('\n');
}

export { formatSkillInjectedSummary };
