import type { EffectiveCapabilities } from './skill-capabilities.js';
import type { SupportedLanguage } from './i18n.js';
import { t } from './i18n.js';
import type { RoutedSkill } from '../routing/types.js';

export type PresentedSkill = {
  id: string;
  name: string;
  description: string;
  reason: string;
  official: boolean;
  source: 'official' | 'community';
  sourceUrl: string | null;
  installCommand: string | null;
  installAllowed: boolean;
};

const DEFAULT_DOC_HOSTS = [
  'github.com',
  'raw.githubusercontent.com',
  'skills.sh',
  'cursor.com',
];

function sanitizeText(value: string, maxLen: number): string {
  const cleaned = Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('');
  return cleaned.trim().slice(0, maxLen);
}

function allowedDocHosts(): Set<string> {
  const configured = (process.env.ALLOWED_SKILL_DOC_HOSTS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_DOC_HOSTS);
}

export function sanitizeDocUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    if (!allowedDocHosts().has(parsed.hostname.toLowerCase())) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function sanitizeInstallCommand(command: string | undefined | null): string | null {
  if (!command) return null;
  const trimmed = sanitizeText(command, 240);
  if (!trimmed) return null;
  if (/[;&|`$<>]/.test(trimmed)) return null;
  if (!/^npx\s+/i.test(trimmed) && !/^cursor\s+/i.test(trimmed)) return null;
  return trimmed;
}

export function presentSkill(
  skill: RoutedSkill,
  caps: EffectiveCapabilities,
): PresentedSkill {
  const source = skill.official ? 'official' : 'community';
  const installCommand = sanitizeInstallCommand(skill.installCommand);
  const installAllowed = Boolean(skill.official && caps.canInstall && installCommand);

  return {
    id: sanitizeText(skill.id, 160),
    name: sanitizeText(skill.name, 120),
    description: sanitizeText(skill.description, 400),
    reason: sanitizeText(skill.reason, 240),
    official: skill.official,
    source,
    sourceUrl: sanitizeDocUrl(skill.sourceUrl),
    installCommand: installAllowed ? installCommand : null,
    installAllowed,
  };
}

export function communityNotice(
  lang: SupportedLanguage,
  skills: PresentedSkill[],
): string | null {
  return skills.some((skill) => skill.source === 'community')
    ? t(lang, 'communitySkillNotice')
    : null;
}
