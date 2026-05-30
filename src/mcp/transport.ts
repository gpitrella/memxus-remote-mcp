import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMCPServer } from './server.js';
import { AuthedRequest } from '../lib/auth.js';

interface Session {
  transport: StreamableHTTPServerTransport;
  userId: string;
  apiKeyId?: string;
  lastActivityAt: number;
}

const sessions = new Map<string, Session>();

const SESSION_TTL_MS = Number(process.env.MCP_SESSION_TTL_MS ?? 60 * 60 * 1000);
const MCP_STATELESS = process.env.MCP_STATELESS === 'true';

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

function touchSession(session: Session): void {
  session.lastActivityAt = Date.now();
}

export async function handleMcp(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

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

    const newSessionId = MCP_STATELESS ? undefined : randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: MCP_STATELESS ? undefined : () => newSessionId!,
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
    const server = createMCPServer({
      userId: req.userId,
      apiKeyId: req.apiKeyId,
      workforceWorkspaceId: req.workforceWorkspaceId,
    });
    await server.connect(transport);
    session = {
      transport,
      userId: req.userId,
      apiKeyId: req.apiKeyId,
      lastActivityAt: Date.now(),
    };
    if (MCP_STATELESS && transport.sessionId) {
      sessions.set(transport.sessionId, session);
    }
  } else {
    touchSession(session);
  }

  await session.transport.handleRequest(req, res, req.body);
}

export async function handleMcpGet(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'invalid_token' });
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
    res.status(401).json({ error: 'invalid_token' });
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
