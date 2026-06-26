import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const SCHEMA_URL =
  'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';
const DESCRIPTION_MAX = 100;
const EXPECTED_REMOTE = 'https://mcp.memxus.com/mcp';
const CORE_TOOLS = [
  'remember',
  'recall',
  'get_context',
  'list_memories',
  'get_memory',
  'list_collections',
  'forget',
  'memory_stats',
  'update',
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverJson = JSON.parse(readFileSync(join(root, 'server.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const errors = [];

const schemaRes = await fetch(SCHEMA_URL);
if (!schemaRes.ok) {
  console.error(`Failed to fetch MCP schema (${schemaRes.status}): ${SCHEMA_URL}`);
  process.exit(1);
}
const schema = await schemaRes.json();

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(serverJson)) {
  for (const err of validate.errors ?? []) {
    errors.push(`${err.instancePath || '/'} ${err.message}`);
  }
}

if (serverJson.description.length > DESCRIPTION_MAX) {
  errors.push(
    `description exceeds ${DESCRIPTION_MAX} chars (${serverJson.description.length})`
  );
}

if (serverJson.version !== packageJson.version) {
  errors.push(
    `version mismatch: server.json=${serverJson.version}, package.json=${packageJson.version}`
  );
}

const remoteUrl = serverJson.remotes?.[0]?.url;
if (remoteUrl !== EXPECTED_REMOTE) {
  errors.push(`remotes[0].url must be ${EXPECTED_REMOTE}, got ${remoteUrl ?? 'undefined'}`);
}

const meta = serverJson._meta?.['io.modelcontextprotocol.registry/publisher-provided'];
const toolNames = (meta?.tools ?? []).map((t) => t.name);
const missingCore = CORE_TOOLS.filter((name) => !toolNames.includes(name));
if (missingCore.length > 0) {
  errors.push(`_meta.tools missing core tools: ${missingCore.join(', ')}`);
}

if (errors.length > 0) {
  console.error('server.json validation failed:');
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log('server.json validation passed (schema + custom checks)');
