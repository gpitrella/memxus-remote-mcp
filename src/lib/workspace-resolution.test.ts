import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { supabase } from './supabase.js';
import {
  matchWorkspaceIdentifier,
  normalizeWorkspaceParam,
  WorkspaceResolutionError,
  type WorkspaceCandidate,
} from './workspace-resolution.js';

const ACME: WorkspaceCandidate = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Acme',
  slug: 'acme',
  role: 'member',
  writes_allowed: true,
};

const BETA: WorkspaceCandidate = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Beta',
  slug: 'beta',
  role: 'owner',
  writes_allowed: true,
};

const DUPLICATE_ACME: WorkspaceCandidate = {
  id: '33333333-3333-3333-3333-333333333333',
  name: 'Acme',
  slug: 'acme-2',
  role: 'viewer',
  writes_allowed: false,
};

test('matchWorkspaceIdentifier matches by name, slug, and uuid, case-insensitive', () => {
  const candidates = [ACME, BETA];
  assert.deepEqual(matchWorkspaceIdentifier(candidates, 'acme'), [ACME]);
  assert.deepEqual(matchWorkspaceIdentifier(candidates, 'ACME'), [ACME]);
  assert.deepEqual(matchWorkspaceIdentifier(candidates, 'Acme'), [ACME]);
  assert.deepEqual(matchWorkspaceIdentifier(candidates, ACME.slug), [ACME]);
  assert.deepEqual(matchWorkspaceIdentifier(candidates, ACME.id.toUpperCase()), [ACME]);
  assert.deepEqual(matchWorkspaceIdentifier(candidates, 'nope'), []);
});

test('matchWorkspaceIdentifier never picks arbitrarily on name collision', () => {
  const candidates = [ACME, DUPLICATE_ACME];
  const matches = matchWorkspaceIdentifier(candidates, 'acme');
  assert.equal(matches.length, 2);
});

function mockCandidatesQuery(rows: Array<{ role: string; workforce_workspaces: unknown }>) {
  return mock.method(supabase, 'from', () => ({
    select: () => ({
      eq: async () => ({ data: rows, error: null }),
    }),
  })) as unknown as ReturnType<typeof mock.method>;
}

function candidateRow(c: WorkspaceCandidate) {
  return {
    role: c.role,
    workforce_workspaces: {
      id: c.id,
      name: c.name,
      slug: c.slug,
      subscription_status: 'active',
    },
  };
}

test('normalizeWorkspaceParam: no workspace param -> Personal, never touches DB', async (t) => {
  const spy = mock.method(supabase, 'from', () => {
    throw new Error('should not query DB for personal default');
  });
  t.after(() => spy.mock.restore());

  const result = await normalizeWorkspaceParam({}, 'user-1');
  assert.equal(result.workspace_id, null);
  assert.deepEqual(result.resolved_workspace, { id: null, name: 'Personal', writes_allowed: true });
});

test('normalizeWorkspaceParam: workspace="personal" -> Personal explicitly', async (t) => {
  const spy = mock.method(supabase, 'from', () => {
    throw new Error('should not query DB for explicit personal token');
  });
  t.after(() => spy.mock.restore());

  const result = await normalizeWorkspaceParam({ workspace: 'Personal' }, 'user-1');
  assert.equal(result.workspace_id, null);
  assert.equal(result.resolved_workspace.name, 'Personal');
});

test('normalizeWorkspaceParam: resolves workspace by exact name match', async (t) => {
  const spy = mockCandidatesQuery([candidateRow(ACME), candidateRow(BETA)]);
  t.after(() => spy.mock.restore());

  const result = await normalizeWorkspaceParam({ workspace: 'Acme' }, 'user-1');
  assert.equal(result.workspace_id, ACME.id);
  assert.equal(result.resolved_workspace.name, 'Acme');
  assert.equal(result.resolved_workspace.writes_allowed, true);
});

test('normalizeWorkspaceParam: unknown workspace -> NOT_FOUND', async (t) => {
  const spy = mockCandidatesQuery([candidateRow(ACME)]);
  t.after(() => spy.mock.restore());

  await assert.rejects(
    () => normalizeWorkspaceParam({ workspace: 'Ghostworks' }, 'user-1'),
    (err: unknown) => err instanceof WorkspaceResolutionError && err.code === 'NOT_FOUND'
  );
});

test('normalizeWorkspaceParam: ambiguous name collision -> AMBIGUOUS, never picks arbitrarily', async (t) => {
  const spy = mockCandidatesQuery([candidateRow(ACME), candidateRow(DUPLICATE_ACME)]);
  t.after(() => spy.mock.restore());

  await assert.rejects(
    () => normalizeWorkspaceParam({ workspace: 'acme' }, 'user-1'),
    (err: unknown) => err instanceof WorkspaceResolutionError && err.code === 'AMBIGUOUS'
  );
});

test('normalizeWorkspaceParam: dedicated aimem_wk_ key forces its own workspace regardless of param', async (t) => {
  const spy = mockCandidatesQuery([candidateRow(ACME)]);
  t.after(() => spy.mock.restore());

  const result = await normalizeWorkspaceParam({}, 'user-1', ACME.id);
  assert.equal(result.workspace_id, ACME.id);
  assert.equal(result.resolved_workspace.id, ACME.id);
  assert.equal(result.resolved_workspace.name, 'Acme');
});

test('normalizeWorkspaceParam: dedicated aimem_wk_ key rejects workspace param pointing elsewhere (no escape)', async (t) => {
  const spy = mockCandidatesQuery([candidateRow(ACME), candidateRow(BETA)]);
  t.after(() => spy.mock.restore());

  await assert.rejects(
    () => normalizeWorkspaceParam({ workspace: BETA.id }, 'user-1', ACME.id),
    (err: unknown) => err instanceof WorkspaceResolutionError && err.code === 'FORBIDDEN'
  );
  await assert.rejects(
    () => normalizeWorkspaceParam({ workspace: 'Beta' }, 'user-1', ACME.id),
    (err: unknown) => err instanceof WorkspaceResolutionError && err.code === 'FORBIDDEN'
  );
  await assert.rejects(
    () => normalizeWorkspaceParam({ workspace: 'personal' }, 'user-1', ACME.id),
    (err: unknown) => err instanceof WorkspaceResolutionError && err.code === 'FORBIDDEN'
  );
});

test('normalizeWorkspaceParam: dedicated aimem_wk_ key accepts its own workspace id explicitly', async (t) => {
  const spy = mockCandidatesQuery([candidateRow(ACME)]);
  t.after(() => spy.mock.restore());

  const result = await normalizeWorkspaceParam({ workspace: ACME.id }, 'user-1', ACME.id);
  assert.equal(result.workspace_id, ACME.id);
});
