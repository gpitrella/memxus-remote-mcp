import type { SupportedLanguage } from '../lib/i18n.js';
import { t } from '../lib/i18n.js';
import type { EffectiveCapabilities } from '../lib/skill-capabilities.js';
import { buildCollectionsTemplate } from '../lib/user-facing-template.js';
import { toolSuccessWithUserFacing, type ToolSuccessResult } from './tool-results.js';

export const COLLECTIONS_CARD_RESOURCE_URI = 'ui://memxus/collections-card';

export type CollectionCardItem = {
  slug: string;
  name: string;
  description: string | null;
  memoryCount: number;
};

export type CollectionsCardPayload = {
  version: '1';
  lang: SupportedLanguage;
  collections: CollectionCardItem[];
  showMore: boolean;
  includeSkills: boolean;
  tokensSaved?: number;
  actions: {
    selectLabel: string;
    showMoreLabel: string;
  };
};

export function buildCollectionsCardPayload(input: {
  lang: SupportedLanguage;
  collections: CollectionCardItem[];
  showMore: boolean;
  includeSkills: boolean;
  tokensSaved?: number;
}): CollectionsCardPayload {
  return {
    version: '1',
    lang: input.lang,
    collections: input.collections,
    showMore: input.showMore,
    includeSkills: input.includeSkills,
    tokensSaved: input.tokensSaved,
    actions: {
      selectLabel: t(input.lang, 'collectionsSelect'),
      showMoreLabel: t(input.lang, 'collectionsShowMore'),
    },
  };
}

export function buildCollectionsCardMeta(
  renderApps: boolean,
): Record<string, unknown> | undefined {
  if (!renderApps) return undefined;
  return {
    ui: {
      resourceUri: COLLECTIONS_CARD_RESOURCE_URI,
      prefHeight: 380,
    },
  };
}

export function buildCollectionsPickerToolResult(input: {
  lang: SupportedLanguage;
  collections: CollectionCardItem[];
  showMore: boolean;
  showAll: boolean;
  allCollections?: CollectionCardItem[];
  includeSkills: boolean;
  caps: EffectiveCapabilities;
}): ToolSuccessResult {
  const template = buildCollectionsTemplate({
    lang: input.lang,
    collections: input.collections,
    showMore: input.showMore,
    allCollections: input.showAll ? input.allCollections : undefined,
  });
  const cardPayload = buildCollectionsCardPayload({
    lang: input.lang,
    collections: input.collections,
    showMore: input.showMore,
    includeSkills: input.includeSkills,
  });
  const cardMeta = buildCollectionsCardMeta(input.caps.renderApps);
  const meta = cardMeta
    ? {
        ...cardMeta,
        collections_card: cardPayload,
        resourceUri: COLLECTIONS_CARD_RESOURCE_URI,
      }
    : undefined;

  return toolSuccessWithUserFacing(
    template,
    {
      mode: 'collection_picker',
      count: input.collections.length,
      collections: input.collections.map((c) => ({
        slug: c.slug,
        name: c.name,
        description: c.description ?? '',
        memoryCount: c.memoryCount,
      })),
      message: template,
    },
    template,
    meta,
    input.caps.renderApps ? 'append' : 'template_only',
  );
}
