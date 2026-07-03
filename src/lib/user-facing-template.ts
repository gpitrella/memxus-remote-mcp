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
import { isContextPoolExhausted } from './search-total.js';
import { type SupportedLanguage, t } from './i18n.js';

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
  excludedMemoryCount?: number;
  requestedLimit?: number;
  contextBlock?: string;
  memoryRows?: BulletMemoryInput[];
  tokensUsed?: number;
  impactSummaryText?: string;
  skillImpactText?: string;
  skillTokensUsed?: number;
  skills?: UserFacingSkill[];
  stackConfidence?: number;
  environment?: 'editor' | 'chat';
  mode?: 'context' | 'skill_load';
  lang?: SupportedLanguage;
  variant?: 'full' | 'plain';
};

function formatCollectionLabel(collection?: string | null): string {
  const trimmed = collection?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'tu proyecto';
}

function shouldShowSkills(
  skills: UserFacingSkill[],
  stackConfidence: number | undefined,
): boolean {
  if (!skills.length) return false;
  if (stackConfidence !== undefined && stackConfidence < MIN_STACK_CONFIDENCE) return false;
  return true;
}

function buildSkillsSection(
  skills: UserFacingSkill[],
  stackConfidence: number | undefined,
  environment: 'editor' | 'chat',
  lang: SupportedLanguage,
): string[] {
  if (!shouldShowSkills(skills, stackConfidence)) return [];

  const lines = [t(lang, 'skillsHeader').toUpperCase()];
  for (const [i, skill] of skills.slice(0, 2).entries()) {
    const communityTag = skill.source === 'community' ? ' (community)' : '';
    const actions =
      environment === 'chat'
        ? `${t(lang, 'useInChat').toLowerCase()} / ${t(lang, 'skip').toLowerCase()}`
        : `${t(lang, 'useInChat').toLowerCase()} / ${t(lang, 'install').toLowerCase()} / ${t(lang, 'skip').toLowerCase()}`;
    lines.push(`${i + 1}. ${skill.name}${communityTag} — ${actions}`);
  }
  return lines;
}

function buildContextSection(input: UserFacingTemplateInput): string[] {
  const topic = input.topic?.trim() || 'este tema';
  const collection = formatCollectionLabel(input.collection);
  const count = input.memoryCount ?? 0;
  const total = input.totalMemories ?? count;
  const excludedCount = input.excludedMemoryCount ?? 0;

  const lines = [`CONTEXTO — ${collection}`];
  lines.push(formatContextCompletenessLine(count, total, topic, excludedCount));

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

function sectionTitle(
  lang: SupportedLanguage,
  key: 'context' | 'savings' | 'actions' | 'skillReady',
): string {
  switch (key) {
    case 'context':
      return lang === 'en' ? 'CONTEXT' : lang === 'pt' ? 'CONTEXTO' : 'CONTEXTO';
    case 'savings':
      return lang === 'en' ? 'SAVINGS' : lang === 'pt' ? 'ECONOMIA' : 'AHORRO';
    case 'actions':
      return lang === 'en' ? 'CHOOSE AN OPTION' : lang === 'pt' ? 'ESCOLHA UMA OPCAO' : 'ELEGI UNA OPCION';
    case 'skillReady':
      return lang === 'en' ? 'SKILL READY' : lang === 'pt' ? 'SKILL PRONTA' : 'SKILL LISTA';
  }
}

function projectLabel(lang: SupportedLanguage): string {
  return lang === 'en' ? 'Project' : lang === 'pt' ? 'Projeto' : 'Proyecto';
}

function expandContextLabel(lang: SupportedLanguage): string {
  return lang === 'en' ? 'expand context' : lang === 'pt' ? 'ampliar contexto' : 'ampliar contexto';
}

function allMemoriesShownNote(lang: SupportedLanguage): string {
  return lang === 'en'
    ? 'already showing all available memories'
    : lang === 'pt'
      ? 'ja mostrei todas as memorias disponiveis'
      : 'ya mostre todas las memorias disponibles';
}

function continueTaskLabel(lang: SupportedLanguage): string {
  return lang === 'en'
    ? 'continue the task'
    : lang === 'pt'
      ? 'continuar a tarefa'
      : 'seguir con la tarea';
}

function formatApproxTokens(n: number): string {
  const rounded = Math.max(0, Math.round(n));
  return rounded >= 1000 ? `~${rounded.toLocaleString('en-US')}` : `~${rounded}`;
}

function formatPlainSavingsLine(
  lang: SupportedLanguage,
  tokens: number,
  kind: 'context' | 'skill',
): string {
  const approx = formatApproxTokens(tokens);
  if (kind === 'skill') {
    return lang === 'en'
      ? `${approx} skill guidance tokens reused`
      : lang === 'pt'
        ? `${approx} tokens de guia reutilizados`
        : `${approx} tokens de guia reutilizados`;
  }
  return lang === 'en'
    ? `${approx} context tokens reused`
    : lang === 'pt'
      ? `${approx} tokens de contexto reutilizados`
      : `${approx} tokens de contexto reutilizados`;
}

function buildPlainContextSection(input: UserFacingTemplateInput): string[] {
  const lang = input.lang ?? 'es';
  const topic = input.topic?.trim() || 'este tema';
  const collection = formatCollectionLabel(input.collection);
  const count = input.memoryCount ?? 0;
  const total = input.totalMemories ?? count;
  const excludedCount = input.excludedMemoryCount ?? 0;
  const lines = [sectionTitle(lang, 'context')];

  if (input.collection?.trim()) {
    lines.push(`${projectLabel(lang)}: ${collection}`);
  }

  lines.push(formatContextCompletenessLine(count, total, topic, excludedCount));

  if (count > 0 && ((input.contextBlock?.trim() ?? '').length > 0 || (input.memoryRows?.length ?? 0) > 0)) {
    const bullets = extractContextBullets({
      contextBlock: input.contextBlock ?? '',
      memories: input.memoryRows ?? [],
      maxBullets: 2,
    });
    for (const bullet of bullets) {
      lines.push(`• ${bullet}`);
    }
  }

  return lines;
}

function buildPlainSkillsSection(
  skills: UserFacingSkill[],
  stackConfidence: number | undefined,
  environment: 'editor' | 'chat',
  lang: SupportedLanguage,
): string[] {
  if (!shouldShowSkills(skills, stackConfidence)) return [];

  const lines = [t(lang, 'skillsHeader').toUpperCase()];
  for (const [i, skill] of skills.slice(0, 2).entries()) {
    const n = i + 1;
    const communityTag = skill.source === 'community' ? ' (community)' : '';
    const commands =
      environment === 'chat'
        ? `use ${n} / skip ${n}`
        : `use ${n} / install ${n} / skip ${n}`;
    lines.push(`${n}. ${skill.name}${communityTag}`);
    lines.push(`   ${commands}`);
  }

  return lines;
}

function buildPlainSavingsSection(input: UserFacingTemplateInput): string[] {
  const lang = input.lang ?? 'es';
  const lines: string[] = [];
  let summary: string | null = null;

  if (input.skillTokensUsed !== undefined && input.skillTokensUsed > 0) {
    summary = formatPlainSavingsLine(lang, input.skillTokensUsed, 'skill');
  } else if (input.tokensUsed !== undefined && input.tokensUsed > 0) {
    summary = formatPlainSavingsLine(lang, input.tokensUsed, 'context');
  } else if (input.skillImpactText?.trim()) {
    summary = input.skillImpactText.trim();
  } else if (input.impactSummaryText?.trim()) {
    summary = input.impactSummaryText.trim();
  }

  if (!summary) return lines;
  lines.push(sectionTitle(lang, 'savings'));
  lines.push(summary);
  return lines;
}

function buildPlainActionSection(input: UserFacingTemplateInput): string[] {
  const lang = input.lang ?? 'es';
  const environment = input.environment ?? 'editor';
  const visibleSkills = shouldShowSkills(input.skills ?? [], input.stackConfidence)
    ? (input.skills ?? []).slice(0, 2)
    : [];
  const lines = [sectionTitle(lang, 'actions')];
  const options: string[] = [];

  if (input.mode === 'skill_load') {
    options.push(continueTaskLabel(lang));
  } else {
    for (const [i] of visibleSkills.entries()) {
      const n = i + 1;
      options.push(`use ${n}`);
      if (environment === 'editor') {
        options.push(`install ${n}`);
      }
    }

    if (visibleSkills.length > 0) {
      options.push('skip all');
    }

    const count = input.memoryCount;
    const total = input.totalMemories ?? input.memoryCount;
    if (count === undefined || total === undefined) {
      options.push(expandContextLabel(lang));
    } else {
      const exhausted = isContextPoolExhausted({
        returnedCount: count,
        total,
        excludedCount: input.excludedMemoryCount ?? 0,
        requestedLimit: input.requestedLimit ?? count,
      });
      options.push(
        exhausted && total > 0
          ? `${expandContextLabel(lang)} (${allMemoriesShownNote(lang)})`
          : expandContextLabel(lang),
      );
    }
  }

  for (const [i, option] of options.entries()) {
    lines.push(`${i + 1}. ${option}`);
  }

  return lines;
}

function buildPlainSkillLoadSection(input: UserFacingTemplateInput): string[] {
  const lang = input.lang ?? 'es';
  const topic = input.topic?.trim() || 'skill';
  const lines = [
    sectionTitle(lang, 'skillReady'),
    lang === 'en'
      ? `${topic} is ready in this chat.`
      : lang === 'pt'
        ? `${topic} esta pronta neste chat.`
        : `${topic} ya esta lista en este chat.`,
  ];
  const savings = buildPlainSavingsSection(input);
  if (savings.length > 0) {
    lines.push('');
    lines.push(...savings);
  }
  lines.push('');
  lines.push(...buildPlainActionSection({ ...input, mode: 'skill_load' }));
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

function buildQuestionLine(input: UserFacingTemplateInput): string {
  const lang = input.lang ?? 'es';
  const topic = input.topic;
  const count = input.memoryCount;
  const total = input.totalMemories ?? input.memoryCount;
  const subject =
    topic?.trim() ||
    (lang === 'en' ? 'this' : lang === 'pt' ? 'isso' : 'esto');
  const base =
    lang === 'en'
      ? `What do you want to do with ${subject}? · Continue the task · Save a decision`
      : lang === 'pt'
        ? `O que voce quer fazer com ${subject}? · Continuar a tarefa · Salvar uma decisao`
        : `¿Qué querés hacer con ${subject}? · Seguir con la tarea · Guardar una decisión`;
  const expand =
    lang === 'en'
      ? 'Expand context'
      : lang === 'pt'
        ? 'Ampliar contexto'
        : 'Ampliar el contexto';

  if (count === undefined || total === undefined) {
    return `${base} · ${expand}`;
  }

  const exhausted = isContextPoolExhausted({
    returnedCount: count,
    total,
    excludedCount: input.excludedMemoryCount ?? 0,
    requestedLimit: input.requestedLimit ?? count,
  });

  if (!exhausted && count < total) {
    return `${base} · ${expand}`;
  }
  if (exhausted && total > 0) {
    const exhaustedNote =
      lang === 'en'
        ? 'already showing every available memory'
        : lang === 'pt'
          ? 'ja mostrei todas as memorias disponiveis'
          : 'ya mostré todas las memorias disponibles';
    return `${base} · ${expand} (${exhaustedNote})`;
  }
  return `${base} · ${expand}`;
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
  const lang = input.lang ?? 'es';
  const variant = input.variant ?? 'full';
  const lines: string[] = [];

  if (variant === 'plain') {
    if (input.mode === 'skill_load') {
      return buildPlainSkillLoadSection(input).join('\n');
    }

    lines.push(...buildPlainContextSection(input));
    const plainSkills = buildPlainSkillsSection(
      input.skills ?? [],
      input.stackConfidence,
      environment,
      lang,
    );
    if (plainSkills.length > 0) {
      lines.push('');
      lines.push(...plainSkills);
    }

    const plainSavings = buildPlainSavingsSection(input);
    if (plainSavings.length > 0) {
      lines.push('');
      lines.push(...plainSavings);
    }

    lines.push('');
    lines.push(...buildPlainActionSection(input));
    return lines.join('\n');
  }

  if (input.mode === 'skill_load') {
    if (input.skillImpactText?.trim()) {
      lines.push(input.skillImpactText.trim());
    }
    lines.push('');
    lines.push(buildQuestionLine({ topic: input.topic, lang }));
    return lines.join('\n');
  }

  lines.push(...buildContextSection(input));

  const skillLines = buildSkillsSection(
    input.skills ?? [],
    input.stackConfidence,
    environment,
    lang,
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
  lines.push(buildQuestionLine(input));

  return lines.join('\n');
}

export { formatSkillInjectedSummary };
