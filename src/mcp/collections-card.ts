import type { SupportedLanguage } from '../lib/i18n.js';
import type { EffectiveCapabilities } from '../lib/skill-capabilities.js';
import { buildCollectionsTemplate } from '../lib/user-facing-template.js';
import { toolSuccessWithUserFacing, type ToolSuccessResult } from './tool-results.js';

export type CollectionCardItem = {
  slug: string;
  name: string;
  description: string | null;
  memoryCount: number;
};

// Collections picker: plain text only — interactive MCP-app widgets removed.
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
