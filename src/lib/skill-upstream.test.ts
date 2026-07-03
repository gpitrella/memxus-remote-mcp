import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { resolveUpstreamLocation, resetGithubSkillCacheForTests } from './skill-upstream.js';

const originalFetch = globalThis.fetch;
const originalOfficialRepos = process.env.OFFICIAL_SKILL_REPOS;

function mockFetch(handler: (url: string) => Response | Promise<Response>): void {
  globalThis.fetch = (async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.href;
    return handler(url);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetGithubSkillCacheForTests();
  if (originalOfficialRepos === undefined) {
    delete process.env.OFFICIAL_SKILL_REPOS;
  } else {
    process.env.OFFICIAL_SKILL_REPOS = originalOfficialRepos;
  }
});

describe('resolveUpstreamLocation', () => {
  it('resolves mirrored skill id to official repo location', async () => {
    process.env.OFFICIAL_SKILL_REPOS = 'supabase/agent-skills';
    mockFetch((url) => {
      if (url.includes('/repos/supabase/agent-skills') && !url.includes('/git/trees')) {
        return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
      }
      if (url.includes('/repos/supabase/agent-skills/git/trees/main')) {
        return new Response(
          JSON.stringify({
            tree: [
              {
                type: 'blob',
                path: 'skills/supabase-postgres-best-practices/SKILL.md',
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    });

    const location = await resolveUpstreamLocation(
      'supabase-postgres-best-practices',
      'davila7/claude-code-templates',
    );

    assert.deepEqual(location, {
      repo: 'supabase/agent-skills',
      relativePath: 'supabase-postgres-best-practices',
    });
  });
});
