/** Spec v2.0 feature flags — off by default for non-regression. */

export const ENABLE_SKILL_ROUTING = 'ENABLE_SKILL_ROUTING';
export const ENABLE_INAPP_CONNECT = 'ENABLE_INAPP_CONNECT';
export { ENABLE_IMPACT_SUMMARY, isImpactSummaryEnabled } from './impact-summary.js';

export function isFeatureFlagEnabled(flag: string): boolean {
  return process.env[flag]?.trim().toLowerCase() === 'true';
}

export function isSkillRoutingEnabled(): boolean {
  return isFeatureFlagEnabled(ENABLE_SKILL_ROUTING);
}

export function isInAppConnectEnabled(): boolean {
  return isFeatureFlagEnabled(ENABLE_INAPP_CONNECT);
}
