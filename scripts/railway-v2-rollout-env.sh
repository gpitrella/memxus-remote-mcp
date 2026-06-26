#!/usr/bin/env bash
# Enable Memxus v2.0 feature flags on RemoteMCP-AIMemory (Railway).
# Requires: railway login + railway link (service: Remote MCP)
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v railway >/dev/null 2>&1; then
  RAILWAY_BIN="npx --yes @railway/cli@4.6.3"
else
  RAILWAY_BIN="railway"
fi

echo "== Railway context (RemoteMCP-AIMemory) =="
$RAILWAY_BIN status

echo ""
echo "== Setting v2.0 production flags =="
$RAILWAY_BIN variables --set "ENABLE_INAPP_CONNECT=true"
$RAILWAY_BIN variables --set "ENABLE_SKILL_ROUTING=true"
$RAILWAY_BIN variables --set "FEATURE_CONNECTOR_GITHUB=true"
$RAILWAY_BIN variables --set "FEATURE_CONNECTOR_NOTION_V2=true"
$RAILWAY_BIN variables --set "FEATURE_PROJECT_UNIFIED_COLLECTION=false"
$RAILWAY_BIN variables --set "MCP_PREFS_CACHE_TTL_MS=60000"
$RAILWAY_BIN variables --set "PROJECT_PROFILE_CACHE_TTL_MS=300000"

echo ""
echo "== Redeploy =="
$RAILWAY_BIN up --detach -m "Enable Memxus v2.0 flags (in-app connect + skill routing)"

echo "Done. Verify: curl https://mcp.memxus.com/health"
