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
}

const sessions = new Map<string, Session>();

export async function handleMcp(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  const sessionIdHeader = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

  let session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session) {
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: no valid session and not an initialize request' },
        id: null,
      });
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
        });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    const server = createMCPServer({
      userId: req.userId,
      apiKeyId: req.apiKeyId,
    });
    await server.connect(transport);
    session = { transport, userId: req.userId, apiKeyId: req.apiKeyId };
  }

  await session.transport.handleRequest(req, res, req.body);
}

export async function handleMcpGet(req: AuthedRequest, res: Response): Promise<void> {
  const sessionIdHeader = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    res.status(400).send('Missing session id');
    return;
  }
  await session.transport.handleRequest(req, res);
}

export async function handleMcpDelete(req: Request, res: Response): Promise<void> {
  const sessionIdHeader = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    res.status(400).send('Missing session id');
    return;
  }
  await session.transport.handleRequest(req, res);
}
