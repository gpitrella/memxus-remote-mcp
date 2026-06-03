import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GLAMA_CONNECTOR_SCHEMA,
  glamaConnectorDocument,
} from './glama-well-known.js';

test('glamaConnectorDocument returns connector schema with maintainer email', () => {
  const doc = glamaConnectorDocument('gabriel98_@hotmail.com');
  assert.ok(doc);
  assert.equal(doc.$schema, GLAMA_CONNECTOR_SCHEMA);
  assert.deepEqual(doc.maintainers, [{ email: 'gabriel98_@hotmail.com' }]);
});

test('glamaConnectorDocument returns null when email missing or blank', () => {
  assert.equal(glamaConnectorDocument(undefined), null);
  assert.equal(glamaConnectorDocument(''), null);
  assert.equal(glamaConnectorDocument('   '), null);
});
