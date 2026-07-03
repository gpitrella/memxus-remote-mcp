import type { RoutedSkill } from '../routing/types.js';
import type { EffectiveCapabilities } from '../lib/skill-capabilities.js';
import type { SupportedLanguage } from '../lib/i18n.js';
import { t } from '../lib/i18n.js';
import { communityNotice, presentSkill } from '../lib/skill-sanitizers.js';

export const SKILL_CARD_RESOURCE_URI = 'ui://memxus/skill-card';

export type SkillCardPayload = {
  version: '1';
  lang: SupportedLanguage;
  surface: EffectiveCapabilities['surface'];
  compactLayout: boolean;
  collection?: string | null;
  topic?: string;
  userFacingTemplate: string | null;
  notice?: string | null;
  client: {
    renderApps: boolean;
    canInstall: boolean;
    canUseInChat: boolean;
    hostSkipAction: boolean;
  };
  actions: {
    useLabel: string;
    installLabel: string;
    skipLabel: string;
    docsLabel: string;
  };
  skills: ReturnType<typeof presentSkill>[];
};

export function buildSkillCardPayload(input: {
  lang: SupportedLanguage;
  skills: RoutedSkill[];
  caps: EffectiveCapabilities;
  topic?: string;
  collection?: string | null;
  cardTemplate?: string | null;
}): SkillCardPayload {
  const presented = input.skills.slice(0, 2).map((skill) => presentSkill(skill, input.caps));
  return {
    version: '1',
    lang: input.lang,
    surface: input.caps.surface,
    compactLayout: input.caps.compactLayout,
    collection: input.collection ?? null,
    topic: input.topic,
    userFacingTemplate: input.cardTemplate ?? null,
    notice: communityNotice(input.lang, presented),
    client: {
      renderApps: input.caps.renderApps,
      canInstall: input.caps.canInstall,
      canUseInChat: input.caps.canUseInChat,
      hostSkipAction: input.caps.hostSkipAction,
    },
    actions: {
      useLabel: t(input.lang, 'useInChat'),
      installLabel: t(input.lang, 'install'),
      skipLabel: t(input.lang, 'skip'),
      docsLabel: t(input.lang, 'viewDocs'),
    },
    skills: presented,
  };
}

export function buildSkillCardMeta(
  payload: SkillCardPayload,
): Record<string, unknown> | undefined {
  if (!payload.client.renderApps) return undefined;
  return {
    ui: {
      resourceUri: SKILL_CARD_RESOURCE_URI,
      prefHeight: payload.compactLayout ? 520 : 420,
    },
  };
}
