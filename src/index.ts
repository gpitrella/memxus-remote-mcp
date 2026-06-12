import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, getEffectiveCorsOrigins } from './config.js';
import { health } from './routes/health.js';
import { glamaWellKnown } from './routes/glama-well-known.js';
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
} from './oauth/metadata.js';
import { authorize } from './oauth/authorize.js';
import { token } from './oauth/token.js';
import { register } from './oauth/register.js';
import { bearerAuth } from './lib/auth.js';
import { oauthRateLimit } from './middleware/oauthRateLimit.js';
import { mcpRateLimit } from './middleware/mcpRateLimit.js';
import { mcpOriginValidation } from './middleware/origin-validation.js';
import { handleMcp, handleMcpGet, handleMcpDelete } from './mcp/transport.js';

const app = express();
const mcpRouter = express.Router();

app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: getEffectiveCorsOrigins(),
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id'],
    exposedHeaders: ['mcp-session-id'],
  })
);

app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', health);

app.get('/.well-known/oauth-authorization-server', authorizationServerMetadata);
app.get('/.well-known/oauth-authorization-server/mcp', authorizationServerMetadata);
app.get('/.well-known/oauth-protected-resource', protectedResourceMetadata);
app.get('/.well-known/oauth-protected-resource/mcp', protectedResourceMetadata);
app.get('/.well-known/glama.json', glamaWellKnown);
app.get('/oauth/authorize', oauthRateLimit, authorize);
app.post('/oauth/token', oauthRateLimit, token);
app.post('/oauth/register', oauthRateLimit, register);

mcpRouter.use(mcpOriginValidation);
mcpRouter.post('/', bearerAuth, mcpRateLimit, handleMcp);
mcpRouter.get('/', bearerAuth, mcpRateLimit, handleMcpGet);
mcpRouter.delete('/', bearerAuth, mcpRateLimit, handleMcpDelete);
app.use('/mcp', mcpRouter);

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

app.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[RemoteMCP] up on :${config.PORT}  public=${config.MCP_PUBLIC_URL}  dashboard=${config.DASHBOARD_URL}`
  );
});
