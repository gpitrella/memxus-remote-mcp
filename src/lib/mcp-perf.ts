const MCP_PERF_LOGS = process.env.MCP_PERF_LOGS === 'true';

export function logPerfPhase(phase: string, ms: number, extra?: Record<string, unknown>): void {
  if (!MCP_PERF_LOGS) return;
  // eslint-disable-next-line no-console
  console.info('mcp_perf_phase', { phase, ms, ...extra });
}

export function isMcpPerfLogsEnabled(): boolean {
  return MCP_PERF_LOGS;
}
