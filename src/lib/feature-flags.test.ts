import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isFeatureFlagEnabled,
  isInAppConnectEnabled,
  isSkillRoutingEnabled,
  ENABLE_INAPP_CONNECT,
  ENABLE_SKILL_ROUTING,
  DISABLE_SKILLS,
  areSkillsHardDisabled,
} from './feature-flags.js';

test('feature flags default to false', () => {
  const prevConnect = process.env[ENABLE_INAPP_CONNECT];
  const prevRouting = process.env[ENABLE_SKILL_ROUTING];
  delete process.env[ENABLE_INAPP_CONNECT];
  delete process.env[ENABLE_SKILL_ROUTING];
  assert.equal(isInAppConnectEnabled(), false);
  assert.equal(isSkillRoutingEnabled(), false);
  if (prevConnect) process.env[ENABLE_INAPP_CONNECT] = prevConnect;
  if (prevRouting) process.env[ENABLE_SKILL_ROUTING] = prevRouting;
});

test('isFeatureFlagEnabled respects true', () => {
  const prev = process.env.TEST_FLAG_XYZ;
  process.env.TEST_FLAG_XYZ = 'true';
  assert.equal(isFeatureFlagEnabled('TEST_FLAG_XYZ'), true);
  if (prev) process.env.TEST_FLAG_XYZ = prev;
  else delete process.env.TEST_FLAG_XYZ;
});

test('areSkillsHardDisabled respects DISABLE_SKILLS', () => {
  const prev = process.env[DISABLE_SKILLS];
  delete process.env[DISABLE_SKILLS];
  assert.equal(areSkillsHardDisabled(), false);
  process.env[DISABLE_SKILLS] = 'true';
  assert.equal(areSkillsHardDisabled(), true);
  if (prev === undefined) delete process.env[DISABLE_SKILLS];
  else process.env[DISABLE_SKILLS] = prev;
});
