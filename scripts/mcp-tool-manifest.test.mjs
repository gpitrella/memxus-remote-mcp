import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_TOOL_NAMES,
  CONNECT_TOOL_NAMES,
  SKILL_TOOL_NAMES,
  ALL_KNOWN_TOOL_NAMES,
  validateToolManifest,
} from './mcp-tool-manifest.mjs';

function manifestWithConnect() {
  return [...CORE_TOOL_NAMES, ...CONNECT_TOOL_NAMES];
}

function manifestWithSkills() {
  return [...CORE_TOOL_NAMES, ...SKILL_TOOL_NAMES];
}

test('validateToolManifest accepts core-only (9 tools)', () => {
  const result = validateToolManifest([...CORE_TOOL_NAMES], 'auto');
  assert.equal(result.tier, 'core');
  assert.equal(result.count, 9);
});

test('validateToolManifest accepts connect tier (13 tools)', () => {
  const names = manifestWithConnect();
  const result = validateToolManifest(names, 'auto');
  assert.equal(result.tier, 'connect');
  assert.equal(result.count, 13);
});

test('validateToolManifest accepts skills tier (15 tools)', () => {
  const names = manifestWithSkills();
  const result = validateToolManifest(names, 'auto');
  assert.equal(result.tier, 'skills');
  assert.equal(result.count, 15);
});

test('validateToolManifest accepts full tier (19 tools)', () => {
  const result = validateToolManifest([...ALL_KNOWN_TOOL_NAMES], 'auto');
  assert.equal(result.tier, 'full');
  assert.equal(result.count, 19);
});

test('validateToolManifest rejects partial connect manifest', () => {
  const partial = [...CORE_TOOL_NAMES, ...CONNECT_TOOL_NAMES.slice(0, 3)];
  assert.throws(
    () => validateToolManifest(partial, 'auto'),
    /Partial connect manifest/,
  );
});

test('validateToolManifest rejects partial skills manifest', () => {
  const partial = [...CORE_TOOL_NAMES, SKILL_TOOL_NAMES[0]];
  assert.throws(
    () => validateToolManifest(partial, 'auto'),
    /Partial skills manifest/,
  );
});

test('SMOKE_MANIFEST=full rejects connect tier', () => {
  assert.throws(
    () => validateToolManifest(manifestWithConnect(), 'full'),
    /SMOKE_MANIFEST=full requires all 19 tools/,
  );
});

test('SMOKE_MANIFEST=auto accepts connect tier (CI production case)', () => {
  const result = validateToolManifest(manifestWithConnect(), 'auto');
  assert.equal(result.tier, 'connect');
});

test('SMOKE_MANIFEST=connect requires exactly connect tier', () => {
  assert.throws(
    () => validateToolManifest([...CORE_TOOL_NAMES], 'connect'),
    /SMOKE_MANIFEST=connect requires 13 tools/,
  );
  const result = validateToolManifest(manifestWithConnect(), 'connect');
  assert.equal(result.tier, 'connect');
});
