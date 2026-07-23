import { randomUUID } from 'crypto';
import { Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMCPServer } from './server.js';
import { AuthedRequest } from '../lib/auth.js';
import { getCachedUserMcpPreferences } from '../lib/mcp-preferences-cache.js';
import { sendMcpUnauthorized } from '../oauth/unauthorized.js';
import type { McpHandshakeContext } from '../lib/skill-capabilities.js';
import { recordClientSession } from '../lib/client-sessions.js';

interface Session {
  transport: StreamableHTTPServerTransport;
  userId: string;
  apiKeyId?: string;
  lastActivityAt: number;
  sseActive: boolean;
  handshake?: McpHandshakeContext;
}

const sessions = new Map<string, Session>();

/** Methods safe to run as one-shot stateless POST when the stateful session was lost (deploy / TTL). */
const STATELESS_POST_FALLBACK_METHODS = new Set([
  'tools/call',
  'tools/list',
  'resources/list',
  'resources/templates/list',
  'prompts/list',
  'prompts/get',
]);

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

function getJsonRpcMethod(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const method = (body as Record<string, unknown>).method;
  return typeof method === 'string' ? method : undefined;
}

function canStatelessPostFallback(body: unknown): boolean {
  const method = getJsonRpcMethod(body);
  return method !== undefined && STATELESS_POST_FALLBACK_METHODS.has(method);
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

async function createServerContext(req: AuthedRequest) {
  const mcpPreferences = await getCachedUserMcpPreferences(req.userId!);
  const acceptLanguageHeader = req.headers['accept-language'];
  const acceptLanguage = Array.isArray(acceptLanguageHeader)
    ? acceptLanguageHeader[0]
    : acceptLanguageHeader;
  return {
    userId: req.userId!,
    apiKeyId: req.apiKeyId,
    workforceWorkspaceId: req.workforceWorkspaceId,
    oauthScope: req.oauthScope,
    isOAuthToken: req.isOAuthToken,
    acceptLanguage,
    mcpPreferences,
  };
}

function extractHandshake(body: unknown): McpHandshakeContext | undefined {
  if (!isInitializeRequest(body)) return undefined;
  const params = (body as { params?: Record<string, unknown> }).params ?? {};
  const meta = params._meta;
  const caps = params.capabilities as Record<string, unknown> | undefined;
  const extensions = caps?.extensions;
  const apps = caps?.experimental;
  const directActions =
    apps && typeof apps === 'object'
      ? (apps as Record<string, unknown>).directActions === true ||
        ((apps as Record<string, unknown>).apps as Record<string, unknown> | undefined)?.directActions === true
      : false;

  return {
    clientInfo:
      params.clientInfo && typeof params.clientInfo === 'object'
        ? (params.clientInfo as { name?: string; version?: string })
        : undefined,
    clientCapabilities:
      caps && typeof caps === 'object' ? caps : undefined,
    negotiatedExtensions: (() => {
      if (Array.isArray(extensions)) return extensions as string[];
      if (extensions && typeof extensions === 'object') {
        return Object.keys(extensions as Record<string, unknown>);
      }
      return undefined;
    })(),
    extensionsDetail: (() => {
      if (extensions && typeof extensions === 'object' && !Array.isArray(extensions)) {
        return extensions as Record<string, { mimeTypes?: string[] }>;
      }
      return undefined;
    })(),
    appsFeatures: { directActions },
    meta:
      meta && typeof meta === 'object'
        ? (meta as McpHandshakeContext['meta'])
        : undefined,
  };
}

function createSessionEntry(
  transport: StreamableHTTPServerTransport,
  req: AuthedRequest,
  handshake?: McpHandshakeContext
): Session {
  return {
    transport,
    userId: req.userId!,
    apiKeyId: req.apiKeyId,
    lastActivityAt: Date.now(),
    sseActive: false,
    handshake,
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
  const handshake = extractHandshake(req.body);
  if (handshake) recordClientSession(req.userId!, handshake, undefined, true);
  const server = await createMCPServer({
    ...(await createServerContext(req)),
    handshake,
  });
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
      if (canStatelessPostFallback(req.body)) {
        logMcpSessionMiss('POST', req.userId!, sessionId, 'stateless_fallback');
        await handleStatelessPost(req, res);
        return;
      }
      logMcpSessionMiss('POST', req.userId!, sessionId, 'no_session_not_initialize');
      sessionJsonError(
        res,
        'Bad Request: no valid session and not an initialize request. Send a new initialize request to create a session.'
      );
      return;
    }

    const handshake = extractHandshake(req.body);
    const newSessionId = randomUUID();
    if (handshake) recordClientSession(req.userId!, handshake, newSessionId, false);
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
    const server = await createMCPServer({
      ...(await createServerContext(req)),
      handshake,
      sessionId: newSessionId,
    });
    await server.connect(transport);
    session = createSessionEntry(transport, req, handshake);
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
  extractHandshake,
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
