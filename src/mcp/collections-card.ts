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

// Collections picker: plain text only — interactive cards are Skills-only.
export function buildCollectionsPickerToolResult(input: {
  lang: SupportedLanguage;
  collections: CollectionCardItem[];
  showMore: boolean;
  showAll: boolean;
  allCollections?: CollectionCardItem[];
  includeSkills: boolean;
  caps: EffectiveCapabilities;
}): ToolSuccessResult {
  void input.caps;
  void input.includeSkills;
  const template = buildCollectionsTemplate({
    lang: input.lang,
    collections: input.collections,
    showMore: input.showMore,
    allCollections: input.showAll ? input.allCollections : undefined,
  });

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
    undefined,
    'template_only',
  );
}
