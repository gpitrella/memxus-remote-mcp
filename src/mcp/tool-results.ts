import type { FormattableMemory } from './format-memory.js';

export type ToolSuccessResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

export type UserFacingDisplayMode = 'append' | 'template_only';

export function toStructuredMemory(m: FormattableMemory): Record<string, unknown> {
  return {
    id: m.id,
    memory_type: m.memory_type,
    content: m.content,
    importance: m.importance,
    tags: m.tags,
    collection: m.collection ?? '',
    created_at: m.created_at,
  };
}

export function toStructuredMemories(ms: FormattableMemory[]): Record<string, unknown>[] {
  return ms.map(toStructuredMemory);
}

export function toolSuccess(
  text: string,
  structured: Record<string, unknown>,
  meta?: Record<string, unknown>,
): ToolSuccessResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent: structured,
    ...(meta ? { _meta: meta } : {}),
  };
}

/**
 * Render invariant: `_meta.ui.resourceUri` is allowed only in the Skills domain (skill-card.ts).
 * `displayMode='template_only'` is reserved for card fallbacks when renderApps is false
 * (collections picker, skills). Memory tools use default `'append'`.
 */
export function toolSuccessWithUserFacing(
  body: string,
  structured: Record<string, unknown>,
  userFacing: string | null,
  meta?: Record<string, unknown>,
  displayMode: UserFacingDisplayMode = 'append',
): ToolSuccessResult {
  const displayText = userFacing
    ? displayMode === 'template_only'
      ? userFacing
      : `${body}\n\n${userFacing}`
    : body;
  return toolSuccess(displayText, {
    ...structured,
    message: displayText,
    ...(userFacing ? { user_facing_template: userFacing } : {}),
  }, meta);
}
