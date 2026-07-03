import { supabase } from './supabase.js';

type CommunityFetchStatus =
  | 'success'
  | 'timeout'
  | 'rate_limited'
  | 'circuit_open'
  | 'error';

type HostState = {
  openedUntil: number;
  hits: number[];
  failures: number[];
  attempts: number[];
};

const hostStates = new Map<string, HostState>();

function now(): number {
  return Date.now();
}

function getHostState(host: string): HostState {
  let state = hostStates.get(host);
  if (!state) {
    state = { openedUntil: 0, hits: [], failures: [], attempts: [] };
    hostStates.set(host, state);
  }
  return state;
}

function trimWindow(values: number[], windowMs: number, time: number): void {
  while (values.length > 0 && time - values[0]! > windowMs) {
    values.shift();
  }
}

async function logCommunityFetchEvent(
  originHost: string,
  status: CommunityFetchStatus,
  durationMs?: number,
): Promise<void> {
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  if (!process.env.SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
  const { error } = await supabase.from('community_fetch_events').insert({
    origin_host: originHost,
    status,
    duration_ms: durationMs,
  });
  if (error) {
    console.warn('[community-fetch] log:', error.message);
  }
}

function getWindowMs(): number {
  return Number(process.env.COMMUNITY_FETCH_WINDOW_MS ?? 60_000);
}

function getMaxPerWindow(): number {
  return Number(process.env.COMMUNITY_FETCH_MAX_PER_WINDOW ?? 30);
}

function getCircuitErrorPct(): number {
  return Number(process.env.COMMUNITY_FETCH_CIRCUIT_ERROR_PCT ?? 50);
}

function getCircuitMinAttempts(): number {
  return Number(process.env.COMMUNITY_FETCH_CIRCUIT_MIN_ATTEMPTS ?? 4);
}

function getCircuitOpenMs(): number {
  return Number(process.env.COMMUNITY_FETCH_CIRCUIT_OPEN_MS ?? 60_000);
}

export async function withCommunityFetch<T>(
  urlString: string,
  execute: () => Promise<T>,
  fallback: T,
): Promise<T> {
  const host = new URL(urlString).hostname.toLowerCase();
  const state = getHostState(host);
  const started = now();
  const windowMs = getWindowMs();

  trimWindow(state.hits, windowMs, started);
  trimWindow(state.attempts, windowMs, started);
  trimWindow(state.failures, windowMs, started);

  if (state.openedUntil > started) {
    void logCommunityFetchEvent(host, 'circuit_open');
    return fallback;
  }

  if (state.hits.length >= getMaxPerWindow()) {
    void logCommunityFetchEvent(host, 'rate_limited');
    return fallback;
  }

  state.hits.push(started);
  state.attempts.push(started);

  try {
    const value = await execute();
    void logCommunityFetchEvent(host, 'success', now() - started);
    return value;
  } catch (error) {
    const status: CommunityFetchStatus =
      error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'error';
    state.failures.push(now());
    trimWindow(state.failures, windowMs, now());
    trimWindow(state.attempts, windowMs, now());
    const attempts = state.attempts.length;
    const errorPct = attempts === 0 ? 0 : (state.failures.length / attempts) * 100;
    if (attempts >= getCircuitMinAttempts() && errorPct >= getCircuitErrorPct()) {
      state.openedUntil = now() + getCircuitOpenMs();
    }
    void logCommunityFetchEvent(host, status, now() - started);
    return fallback;
  }
}

export function resetCommunityFetchStateForTests(): void {
  hostStates.clear();
}
