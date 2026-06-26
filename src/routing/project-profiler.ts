import type { ProjectProfile } from './types.js';

const DOMAIN_SIGNALS: Record<string, RegExp[]> = {
  web: [/next\.?js/i, /react/i, /typescript/i, /node\.?js/i, /supabase/i],
  mobile: [/react-native/i, /expo/i, /flutter/i],
  data: [/python/i, /pandas/i, /jupyter/i],
  devops: [/docker/i, /kubernetes/i, /railway/i, /github actions/i],
  design: [/figma/i, /\.dwg/i, /\.ifc/i],
  legal: [/contract/i, /\.docx/i, /legal/i],
};

export function profileProject(input: {
  query: string;
  collection?: string | null;
  memorySnippets?: string[];
}): ProjectProfile {
  const corpus = [
    input.query,
    input.collection ?? '',
    ...(input.memorySnippets ?? []),
  ]
    .join('\n')
    .toLowerCase();

  let bestDomain = 'general';
  let bestHits = 0;
  const stack: string[] = [];

  for (const [domain, patterns] of Object.entries(DOMAIN_SIGNALS)) {
    let hits = 0;
    for (const p of patterns) {
      if (p.test(corpus)) {
        hits += 1;
        const token = p.source.replace(/\\b|\\/gi, '').slice(0, 24);
        if (!stack.includes(token)) stack.push(token);
      }
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestDomain = domain;
    }
  }

  const confidence = bestHits === 0 ? 0.25 : Math.min(0.95, 0.35 + bestHits * 0.12);
  return { domain: bestDomain, stack: stack.slice(0, 8), confidence };
}
