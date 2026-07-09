import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadUserPlan } from '../lib/plan-enforcement.js';
import { getPlan } from '../lib/plans.js';
import { listMemories } from './tools.js';
import { SKILL_CARD_RESOURCE_URI } from './skill-card.js';
import { COLLECTIONS_CARD_RESOURCE_URI } from './collections-card.js';

export interface ResourceListItem {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export const RESOURCES: ResourceListItem[] = [
  {
    uri: 'memory://recent',
    name: 'Recent Memories',
    description: 'Your most recent memories (count capped per plan)',
    mimeType: 'text/html',
  },
  {
    uri: SKILL_CARD_RESOURCE_URI,
    name: 'Memxus Skill Card',
    description: 'Interactive MCP Apps card for suggested skills',
    mimeType: 'text/html;profile=mcp-app',
  },
  {
    uri: COLLECTIONS_CARD_RESOURCE_URI,
    name: 'Memxus Collections',
    description: 'Collection picker for Memxus context',
    mimeType: 'text/html;profile=mcp-app',
  },
];

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadInlineDocument(relativeDir: string): string {
  const base = join(__dirname, '../../resources', relativeDir);
  const html = readFileSync(join(base, 'index.html'), 'utf8');
  const css = readFileSync(join(base, 'card.css'), 'utf8');
  const js = readFileSync(join(base, 'card.js'), 'utf8');
  return html.replace('/* __INLINE_CSS__ */', css).replace('/* __INLINE_JS__ */', js);
}

const skillCardDocument = loadInlineDocument('skill-card');
const collectionsCardDocument = loadInlineDocument('collections-card');

export function getResourceMimeType(uri: string): string {
  return RESOURCES.find((r) => r.uri === uri)?.mimeType ?? 'text/html';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function readResource(
  uri: string,
  userId: string,
  workforceWorkspaceId?: string
): Promise<string> {
  if (uri === SKILL_CARD_RESOURCE_URI) {
    return skillCardDocument;
  }
  if (uri === COLLECTIONS_CARD_RESOURCE_URI) {
    return collectionsCardDocument;
  }
  if (uri !== 'memory://recent') throw new Error(`Unknown resource: ${uri}`);
  const planCtx = await loadUserPlan(userId);
  const limits = planCtx?.limits ?? getPlan('free').limits;
  const memories = await listMemories({ userId, workforceWorkspaceId, planLimits: limits });
  const items = memories
    .map(
      (m) =>
        `<li><strong>${escapeHtml(m.content.slice(0, 100))}${m.content.length > 100 ? '…' : ''}</strong> <small>${new Date(m.created_at).toLocaleDateString()}</small></li>`
    )
    .join('');
  return `<div><h3>Your Recent Memories</h3><ul>${items || '<li>No memories yet.</li>'}</ul></div>`;
}
