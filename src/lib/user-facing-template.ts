import { isImpactSummaryEnabled } from './impact-summary.js';
import { MIN_STACK_CONFIDENCE } from '../routing/project-profiler.js';

const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const HEADER = 'MEMXUS — Resumen para el usuario';

export type UserFacingSkill = {
  name: string;
  reason: string;
  source: string;
};

export type UserFacingTemplateInput = {
  collection?: string | null;
  topic?: string;
  memoryCount?: number;
  impactSummaryText?: string;
  skillImpactText?: string;
  skills?: UserFacingSkill[];
  stackConfidence?: number;
  environment?: 'editor' | 'chat';
  /** use_skill_in_chat: skip context line, show skill impact only */
  mode?: 'context' | 'skill_load';
};

function formatCollectionLabel(collection?: string | null): string {
  const trimmed = collection?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'tu proyecto';
}

function formatSkillActionLine(index: number, environment: 'editor' | 'chat'): string {
  const n = index + 1;
  return environment === 'chat'
    ? `    → use ${n} → inyectar en este chat · skip ${n}`
    : `    → use ${n} → inyectar · install ${n} → instalar en el proyecto · skip ${n}`;
}

function buildSkillsSection(
  skills: UserFacingSkill[],
  stackConfidence: number | undefined,
  environment: 'editor' | 'chat',
): string[] {
  if (!skills.length) return [];
  if (stackConfidence !== undefined && stackConfidence < MIN_STACK_CONFIDENCE) return [];

  const lines = ['🧩 SKILLS SUGERIDAS:'];
  for (const [i, skill] of skills.slice(0, 2).entries()) {
    lines.push(`  [${i + 1}] ${skill.name} (${skill.source}) — ${skill.reason}`);
    lines.push(formatSkillActionLine(i, environment));
  }
  return lines;
}

function buildContextLine(input: UserFacingTemplateInput): string {
  const topic = input.topic?.trim() || 'este tema';
  const count = input.memoryCount ?? 0;
  const collection = formatCollectionLabel(input.collection);
  if (count === 0) {
    return `🧠 CONTEXTO — ${collection}: No encontré memorias relevantes para "${topic}".`;
  }
  const memoryLabel = count === 1 ? '1 memoria' : `${count} memorias`;
  return `🧠 CONTEXTO — ${collection}: Recuperé ${memoryLabel} sobre "${topic}".`;
}

function buildQuestionLine(topic?: string): string {
  const subject = topic?.trim() || 'esto';
  return `¿Qué querés hacer con ${subject}? · Seguir con la tarea · Guardar una decisión · Ampliar el contexto`;
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

export function buildUserFacingTemplate(input: UserFacingTemplateInput): string | null {
  const hasSkillImpact = Boolean(input.skillImpactText?.trim());
  if (!isImpactSummaryEnabled() && !hasSkillImpact) return null;

  const environment = input.environment ?? 'editor';
  const lines: string[] = [SEPARATOR, HEADER, SEPARATOR, ''];

  if (input.mode === 'skill_load') {
    if (hasSkillImpact) {
      lines.push(input.skillImpactText!.trim());
    }
    lines.push('');
    lines.push(buildQuestionLine(input.topic));
    lines.push(SEPARATOR);
    return lines.join('\n');
  }

  lines.push(buildContextLine(input));
  lines.push('');

  const skillLines = buildSkillsSection(
    input.skills ?? [],
    input.stackConfidence,
    environment,
  );
  if (skillLines.length > 0) {
    lines.push(...skillLines, '');
  }

  if (input.impactSummaryText?.trim()) {
    lines.push(input.impactSummaryText.trim());
    lines.push('');
  }

  lines.push(buildQuestionLine(input.topic));
  lines.push(SEPARATOR);

  return lines.join('\n');
}
