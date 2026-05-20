import { listMemories } from './tools.js';

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
    description: 'Your 10 most recent memories',
    mimeType: 'text/html',
  },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function readResource(uri: string, userId: string): Promise<string> {
  if (uri !== 'memory://recent') throw new Error(`Unknown resource: ${uri}`);
  const memories = await listMemories({ userId, limit: 10 });
  const items = memories
    .map(
      (m) =>
        `<li><strong>${escapeHtml(m.content.slice(0, 100))}${m.content.length > 100 ? '…' : ''}</strong> <small>${new Date(m.created_at).toLocaleDateString()}</small></li>`
    )
    .join('');
  return `<div><h3>Your Recent Memories</h3><ul>${items || '<li>No memories yet.</li>'}</ul></div>`;
}
