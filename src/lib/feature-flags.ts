/** Spec v2.0 feature flags — off by default for non-regression. */

export const ENABLE_SKILL_ROUTING = 'ENABLE_SKILL_ROUTING';
export const ENABLE_INAPP_CONNECT = 'ENABLE_INAPP_CONNECT';
export const ENABLE_SKILL_CARD_UI = 'ENABLE_SKILL_CARD_UI';
export const FORCE_PLAIN_TEXT = 'FORCE_PLAIN_TEXT';
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

export function isSkillCardUiEnabled(): boolean {
  return isFeatureFlagEnabled(ENABLE_SKILL_CARD_UI);
}

export function isForcePlainTextEnabled(): boolean {
  return isFeatureFlagEnabled(FORCE_PLAIN_TEXT);
}
