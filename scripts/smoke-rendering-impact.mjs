/**
 * Smoke test: cross-platform rendering + real-token impact summary.
 * Usage: ENABLE_IMPACT_SUMMARY=true node scripts/smoke-rendering-impact.mjs
 */
import { buildImpactPayload, applyImpactToContextResponse } from '../dist/lib/impact-summary.js';
import { RENDERING_INSTRUCTIONS_FULL } from '../dist/lib/rendering-instructions.js';
import { getActiveMcpTools } from '../dist/mcp/tool-schemas.js';

const enabled = process.env.ENABLE_IMPACT_SUMMARY?.trim().toLowerCase() === 'true';
console.log('ENABLE_IMPACT_SUMMARY:', enabled);

const payload = buildImpactPayload(1509);
const block = '=== Memory Context ===\n- spec memxus\n=== End ===';
const applied = applyImpactToContextResponse(block, 1509, false);
const tools = getActiveMcpTools();
const gc = tools.find((t) => t.name === 'get_context');
const rc = tools.find((t) => t.name === 'recall');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('OK:', msg);
  }
}

if (enabled) {
  assert(payload !== null, 'buildImpactPayload returns payload when flag on');
  assert(
    payload?.impact_summary_text?.includes('~1,509 tokens de contexto reutilizados'),
    'impact copy uses real token count',
  );
  assert(!payload?.impact_summary_text?.includes('Sin Memxus'), 'no sin/con table');
} else {
  assert(payload === null, 'buildImpactPayload null when flag off');
}

assert(applied.contextBlock === block, 'context_block not mutated');
assert(
  enabled ? !!applied.impact_summary_text : !applied.impact_summary_text,
  'impact fields match flag',
);
assert(RENDERING_INSTRUCTIONS_FULL.includes('CONTEXTO'), 'rendering MD loaded');
assert(gc?.description?.includes('memxus-rendering-instructions'), 'get_context has rendering brief');
assert(rc?.description?.includes('memxus-rendering-instructions'), 'recall has rendering brief');
assert(!!gc?.outputSchema?.properties?.tokens_used, 'get_context schema has tokens_used');
assert(!!rc?.outputSchema?.properties?.tokens_used, 'recall schema has tokens_used');

console.log('\n--- Sample impact_summary_text ---');
console.log(payload?.impact_summary_text ?? '(flag off)');

process.exit(failed > 0 ? 1 : 0);
