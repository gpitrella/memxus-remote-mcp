import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntent } from './intent-classifier.js';
import { profileProject } from './project-profiler.js';
import { routeSkills } from './routing-engine.js';
import { shouldAppendSkillsForRecall } from './skill-surfacing.js';

test('profileProject detects web stack from query', () => {
  const profile = profileProject({
    query: 'Next.js Supabase MCP integration',
    collection: 'project:memxus',
  });
  assert.equal(profile.domain, 'web');
  assert.ok(profile.confidence > 0.3);
});

test('classifyIntent detects review action', () => {
  const intent = classifyIntent('review this pull request for security issues');
  assert.equal(intent.action, 'review');
});

test('routeSkills returns at most 2 discovered skills', async () => {
  const profile = profileProject({ query: 'MCP tools Next.js', collection: 'project:memxus' });
  const intent = classifyIntent('build mcp server integration');
  const skills = await routeSkills({ profile, intent, query: 'build mcp react' });
  assert.ok(skills.length <= 2);
});

test('shouldAppendSkillsForRecall for work intents', () => {
  assert.equal(shouldAppendSkillsForRecall('review this PR'), true);
  assert.equal(shouldAppendSkillsForRecall('hello world'), false);
  assert.equal(shouldAppendSkillsForRecall('hello', false), false);
});
