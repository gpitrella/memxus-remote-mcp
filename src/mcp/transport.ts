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
}

const sessions = new Map<string, Session>();

const SESSION_TTL_MS = Number(process.env.MCP_SESSION_TTL_MS ?? 60 * 60 * 1000);

let mcpStatelessOverride: boolean | undefined;

function isMcpStateless(): boolean {
  if (mcpStatelessOverride !== undefined) return mcpStatelessOverride;
  return process.env.MCP_STATELESS === 'true';
}

function pruneIdleSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivityAt > SESSION_TTL_MS) {
      sessions.delete(id);
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

function createServerContext(req: AuthedRequest) {
  return {
    userId: req.userId!,
    apiKeyId: req.apiKeyId,
    workforceWorkspaceId: req.workforceWorkspaceId,
  };
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
      sessionJsonError(
        res,
        'Bad Request: no valid session and not an initialize request'
      );
      return;
    }

    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (id) => {
        sessions.set(id, {
          transport,
          userId: req.userId!,
          apiKeyId: req.apiKeyId,
          lastActivityAt: Date.now(),
        });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    const server = createMCPServer(createServerContext(req));
    await server.connect(transport);
    session = {
      transport,
      userId: req.userId!,
      apiKeyId: req.apiKeyId,
      lastActivityAt: Date.now(),
    };
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
    sessionJsonError(res, 'Bad Request: missing or expired MCP session id');
    return;
  }
  touchSession(session);
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

  const sessionIdHeader = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    sessionJsonError(res, 'Bad Request: missing or expired MCP session id');
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
  isStatelessMode: isMcpStateless,
};
