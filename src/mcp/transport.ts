import { randomUUID } from 'crypto';
import { Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMCPServer } from './server.js';
import { AuthedRequest } from '../lib/auth.js';
import { sendMcpUnauthorized } from '../oauth/unauthorized.js';

interface Session {
  transport: StreamableHTTPServerTransport;
  userId: string;
  apiKeyId?: string;
  lastActivityAt: number;
  sseActive: boolean;
}

const sessions = new Map<string, Session>();

const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000;

let sessionTtlOverride: number | undefined;

function getSessionTtlMs(): number {
  if (sessionTtlOverride !== undefined) return sessionTtlOverride;
  const fromEnv = process.env.MCP_SESSION_TTL_MS;
  if (fromEnv === undefined || fromEnv === '') return DEFAULT_SESSION_TTL_MS;
  const parsed = Number(fromEnv);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_TTL_MS;
}

let mcpStatelessOverride: boolean | undefined;

function isMcpStateless(): boolean {
  if (mcpStatelessOverride !== undefined) return mcpStatelessOverride;
  return process.env.MCP_STATELESS === 'true';
}

function pruneIdleSessions(): void {
  const now = Date.now();
  const sessionTtlMs = getSessionTtlMs();
  for (const [id, session] of sessions) {
    const idleMs = now - session.lastActivityAt;
    if (idleMs > sessionTtlMs) {
      sessions.delete(id);
      logMcpSessionExpired(id, session.userId, idleMs, sessionTtlMs);
      void session.transport.close().catch(() => undefined);
    }
  }
}

function sessionJsonError(res: Response, message: string, code = -32000): void {
  res.status(400).json({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  });
}

function sessionConflictError(res: Response, message: string): void {
  res.status(409).json({
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  });
}

function methodNotAllowed(res: Response, message: string): void {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  });
}

function touchSession(session: Session): void {
  session.lastActivityAt = Date.now();
}

function logMcpSessionCreated(sessionId: string, userId: string): void {
  // eslint-disable-next-line no-console
  console.info('mcp_session_created', { sessionId, userId });
}

function logMcpSessionMiss(
  method: string,
  userId: string,
  sessionId: string | undefined,
  reason: string
): void {
  // eslint-disable-next-line no-console
  console.info('mcp_session_miss', { method, userId, sessionId, reason });
}

function logMcpSseConflict(sessionId: string, userId: string): void {
  // eslint-disable-next-line no-console
  console.info('mcp_sse_conflict', { sessionId, userId });
}

function logMcpSessionExpired(
  sessionId: string,
  userId: string,
  idleMs: number,
  sessionTtlMs: number
): void {
  // eslint-disable-next-line no-console
  console.info('mcp_session_expired', {
    sessionId,
    userId,
    idleMs,
    sessionTtlMs,
    idleMinutes: Math.round(idleMs / 60_000),
  });
}

function createServerContext(req: AuthedRequest) {
  return {
    userId: req.userId!,
    apiKeyId: req.apiKeyId,
    workforceWorkspaceId: req.workforceWorkspaceId,
  };
}

function createSessionEntry(
  transport: StreamableHTTPServerTransport,
  req: AuthedRequest
): Session {
  return {
    transport,
    userId: req.userId!,
    apiKeyId: req.apiKeyId,
    lastActivityAt: Date.now(),
    sseActive: false,
  };
}

function trackSseLifecycle(session: Session, res: Response): void {
  session.sseActive = true;
  res.on('close', () => {
    session.sseActive = false;
  });
  res.on('finish', () => {
    if (res.statusCode !== 200) {
      session.sseActive = false;
    }
  });
}

async function handleStatelessPost(req: AuthedRequest, res: Response): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMCPServer(createServerContext(req));
  await server.connect(transport);
  try {
    await transport.handleRequest(req, res, req.body);
  } finally {
    await transport.close().catch(() => undefined);
  }
}

async function handleStatefulPost(req: AuthedRequest, res: Response): Promise<void> {
  pruneIdleSessions();

  const sessionIdHeader = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

  let session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session) {
    if (!isInitializeRequest(req.body)) {
      logMcpSessionMiss('POST', req.userId!, sessionId, 'no_session_not_initialize');
      sessionJsonError(
        res,
        'Bad Request: no valid session and not an initialize request. Send a new initialize request to create a session.'
      );
      return;
    }

    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (id) => {
        const existing = sessions.get(id);
        if (existing) {
          touchSession(existing);
        }
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    const server = createMCPServer(createServerContext(req));
    await server.connect(transport);
    session = createSessionEntry(transport, req);
    sessions.set(newSessionId, session);
    logMcpSessionCreated(newSessionId, req.userId!);
  } else {
    touchSession(session);
  }

  await session.transport.handleRequest(req, res, req.body);
}

export async function handleMcp(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.userId) {
    sendMcpUnauthorized(res);
    return;
  }

  if (isMcpStateless()) {
    await handleStatelessPost(req, res);
    return;
  }

  await handleStatefulPost(req, res);
}

export async function handleMcpGet(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.userId) {
    sendMcpUnauthorized(res);
    return;
  }

  if (isMcpStateless()) {
    methodNotAllowed(res, 'Method Not Allowed: SSE not supported in stateless MCP mode');
    return;
  }

  pruneIdleSessions();

  const sessionIdHeader = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    logMcpSessionMiss('GET', req.userId!, sessionId, 'missing_or_expired');
    sessionJsonError(
      res,
      'Bad Request: missing or expired MCP session id. Re-initialize the MCP connection (POST initialize).'
    );
    return;
  }

  if (session.sseActive) {
    logMcpSseConflict(sessionId!, req.userId!);
    sessionConflictError(
      res,
      'Conflict: only one SSE stream is allowed per MCP session. Close the existing stream or re-initialize.'
    );
    return;
  }

  touchSession(session);
  trackSseLifecycle(session, res);
  await session.transport.handleRequest(req, res);
}

export async function handleMcpDelete(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.userId) {
    sendMcpUnauthorized(res);
    return;
  }

  if (isMcpStateless()) {
    methodNotAllowed(res, 'Method Not Allowed: session DELETE not supported in stateless MCP mode');
    return;
  }

  pruneIdleSessions();

  const sessionIdHeader = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    logMcpSessionMiss('DELETE', req.userId!, sessionId, 'missing_or_expired');
    sessionJsonError(
      res,
      'Bad Request: missing or expired MCP session id. Re-initialize the MCP connection (POST initialize).'
    );
    return;
  }
  touchSession(session);
  await session.transport.handleRequest(req, res);
}

/** @internal test helper */
export function _resetSessionsForTest(): void {
  sessions.clear();
}

export const _test = {
  resetSessions: _resetSessionsForTest,
  setStatelessMode: (value: boolean | undefined) => {
    mcpStatelessOverride = value;
  },
  setSessionTtlMs: (value: number | undefined) => {
    sessionTtlOverride = value;
  },
  seedSession: (sessionId: string, lastActivityAt: number, userId = 'user-test') => {
    const transport = {
      close: async () => undefined,
      handleRequest: async () => undefined,
    } as unknown as StreamableHTTPServerTransport;
    sessions.set(sessionId, {
      transport,
      userId,
      lastActivityAt,
      sseActive: false,
    });
  },
  hasSession: (sessionId: string) => sessions.has(sessionId),
  pruneIdleSessions,
  getSessionTtlMs,
  isStatelessMode: isMcpStateless,
};
