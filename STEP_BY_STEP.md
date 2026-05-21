# AI Memory Remote MCP — Step by Step

Guía operativa, end-to-end, para llevar el Remote MCP de cero hasta usuarios reales conectados. Cubre desarrollo local, base de datos, deploy a Railway, integración con dashboard y landing, y conexión desde cada cliente (Claude, Cursor, VS Code).

Audiencia: vos (o el próximo dev) que toma este repo en frío.

---

## 0. Antes de empezar — qué hay y qué hace cada cosa

```
MEMORY/
├── AIMemory/packages/mcp        # MCP stdio (legacy, sigue funcionando para uso local)
├── API-IAMemory                 # REST API en Railway (Express + Supabase)
├── Dash-AIMemory                # Dashboard Next.js (NextAuth + Google) — Vercel
├── Landing-IAMemory             # Landing pública Next.js — Vercel
└── RemoteMCP-AIMemory           # ← ESTE. Remote MCP con OAuth 2.1 + PKCE
```

Una sola fuente de verdad: Supabase. El mismo `aimem_*` API key funciona en los tres servicios porque todos validan contra `api_keys.key_hash` (SHA256).

---

## 1. Pre-requisitos

Verificar antes de tocar nada:

```bash
node --version   # >= 20
npm --version    # >= 10
```

Cuentas necesarias:

- Supabase (mismo proyecto que ya usa Dashboard + API)
- Railway (para deployar este servicio)
- Vercel (Dashboard y Landing ya están allá — no se toca)
- Google Cloud Console (OAuth client ya configurado para el Dashboard — tampoco se toca)

---

## 2. Migración de base de datos (Supabase)

Esta migración es **additiva e idempotente** — no toca tablas existentes.

### 2.1 Abrir el SQL Editor

1. Supabase Dashboard → tu proyecto → SQL Editor → New query.

### 2.2 Pegar y ejecutar

Pegar el contenido completo de `[RemoteMCP-AIMemory/supabase/migration.sql](supabase/migration.sql)` y correr.

Crea:

- Tabla `public.oauth_codes` (tickets temporales del flujo OAuth)
- Índices `idx_oauth_codes_user`, `idx_oauth_codes_expires`
- Columnas `api_keys.oauth_client_id` y `api_keys.metadata` (para distinguir keys emitidas por OAuth vs. creadas manualmente en el dashboard)

### 2.3 Verificar

```sql
select count(*) from public.oauth_codes;          -- 0
select column_name from information_schema.columns
 where table_name = 'api_keys' and column_name in ('oauth_client_id','metadata');
-- ambas deben aparecer
```

---

## 3. Setup local (desarrollo)

### 3.1 Instalar dependencias

```bash
cd RemoteMCP-AIMemory
npm install
```

### 3.2 Crear `.env`

```bash
cp .env.example .env
```

El servidor carga `.env` automáticamente en local (vía `dotenv` en `src/config.ts`). En Railway **no** subas `.env`: configurá las variables en Settings → Variables; `npm start` ejecuta `node dist/index.js` y lee `process.env` del contenedor.

Editar `.env`:

```bash
PORT=3002

# URL pública de este servidor. Para dev local con Claude Desktop, expone tu
# 3002 con ngrok/cloudflared y pegá la URL HTTPS acá.
MCP_PUBLIC_URL=http://localhost:3002

# El Dashboard donde el usuario va a loguearse
DASHBOARD_URL=http://localhost:3000

# Mismo proyecto Supabase que usa la API y el Dashboard
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...service-role

# Opcional: habilita búsqueda semántica (si no, cae a ILIKE)
OPENAI_API_KEY=

# Cliente OAuth pre-registrado (no usar DCR todavía)
OAUTH_CLIENT_ID=26228572556-3kqushtjoe1s4rfdtd84f2ivbjckp19l.apps.googleusercontent.com

# Allow-list de redirect_uri que clientes pueden usar
ALLOWED_REDIRECT_URIS=https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback,http://localhost:3334/callback

# Origenes CORS permitidos
CORS_ORIGINS=https://claude.ai,https://claude.com,https://api.anthropic.com
```

### 3.3 Levantar en watch mode

```bash
npm run dev
```

Salida esperada:

```
[RemoteMCP] up on :3002  public=http://localhost:3002  dashboard=http://localhost:3000
```

### 3.4 Smoke tests (curl)

En otra terminal (con `npm run dev` corriendo):

```bash
curl -s http://localhost:3002/health
# {"status":"healthy","timestamp":"...","service":"aimemory-mcp-remote"}

curl -s http://localhost:3002/.well-known/oauth-authorization-server
# Debe listar authorization_endpoint, token_endpoint, code_challenge_methods_supported: ["S256"], etc.

curl -s http://localhost:3002/.well-known/oauth-protected-resource
# Debe listar resource, authorization_servers y scopes_supported
```

**Formatear JSON (opcional)** — en Git Bash / Windows suele faltar `jq`. Si ves `jq: command not found` o `curl: (23) Failed writing body`, el servidor igual respondió; usá una de estas alternativas:

```bash
# Python (suele venir con Node/Git for Windows)
curl -s http://localhost:3002/.well-known/oauth-authorization-server | python -m json.tool
curl -s http://localhost:3002/.well-known/oauth-protected-resource | python -m json.tool

# Node (ya tenés Node por este proyecto)
curl -s http://localhost:3002/.well-known/oauth-authorization-server | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(s),null,2)))"

# jq (macOS/Linux o: choco install jq / scoop install jq)
curl -s http://localhost:3002/.well-known/oauth-authorization-server | jq
```

Si alguno falla:

- `connection refused` → el server no está arriba o el puerto 3002 está ocupado (`netstat -ano | findstr :3002` en Windows).
- `ZodError` al arrancar → revisar `.env` (el servidor carga `.env` vía `dotenv` en `src/config.ts`).
- Para estos endpoints `.well-known/*` no hace falta Supabase; si `/health` OK pero `.well-known` 404, hacer `npm run build` y restart.
- Si solo falla el pipe a `jq`, usar `curl -s` sin pipe o las alternativas de arriba.

---

## 4. Sincronizar Dashboard y Landing locales

El Remote MCP no funciona aislado — necesita al Dashboard para el step de login OAuth, y a la Landing para el botón "Install".

### 4.1 Dashboard

```bash
cd ../Dash-AIMemory
```

Verificar que tu `.env.local` tenga (esto ya lo agregamos al `.env.example`):

```bash
NEXT_PUBLIC_MCP_PUBLIC_URL=http://localhost:3002
```

Levantar:

```bash
npm run dev   # http://localhost:3000
```

Una vez logueado con Google, gracias al cambio en `[Dash-AIMemory/lib/auth.ts](../Dash-AIMemory/lib/auth.ts)` ya se auto-provisiona un `aimem_*` "Default Key" (idempotente — sólo si no tenés uno activo).

Verificar:

```sql
select id, name, key_prefix, is_active, created_at
  from public.api_keys
 where user_id = (select id from public.users where email = 'TU_EMAIL_GOOGLE')
 order by created_at desc;
```

### 4.2 Landing

```bash
cd ../Landing-IAMemory
```

Agregar al `.env.local`:

```bash
NEXT_PUBLIC_MCP_PUBLIC_URL=http://localhost:3002
```

Levantar:

```bash
npm run dev   # http://localhost:3001 (Next elige otro puerto si 3000 está ocupado)
```

Abrir `http://localhost:3001/install` — debe mostrar el botón "Connect with One Click" y la URL de manual setup.

---

## 5. Probar el flujo OAuth end-to-end (local)

Con los tres servicios corriendo (`:3002` Remote MCP, `:3000` Dashboard, `:3001` Landing):

### 5.1 Simular el flujo con curl (sin Claude todavía)

```bash
# Paso 1: cliente abre /oauth/authorize
open "http://localhost:3002/oauth/authorize?response_type=code&client_id=aimemory-claude&redirect_uri=http%3A%2F%2Flocalhost%3A3334%2Fcallback&code_challenge=DUMMY_CHALLENGE_FOR_TEST&code_challenge_method=S256&state=test123"
```

Si **NO** estás logueado en el dashboard, te redirige a `/login`. Logueate con Google, después seguís el flujo.

Si **SÍ** estás logueado: el browser te lleva al `redirect_uri` (`localhost:3334/callback`) con `?code=XXXX&state=test123`. Como no hay nada escuchando ahí, simplemente ves un error de conexión — está bien, copiate el `code` de la URL.

### 5.2 Intercambiar code por token

PKCE de prueba: usar `code_verifier=test` + `code_challenge=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08` no funciona (no es S256 válido). Para test real, generá un par:

```bash
# Generar verifier + challenge S256 (base64url: + → -, / → _, sin =)
VERIFIER=$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-43)
CHALLENGE=$(echo -n "$VERIFIER" | openssl dgst -binary -sha256 | openssl base64 -A | tr '+/' '-_' | tr -d '=')
echo "verifier=$VERIFIER"
echo "challenge=$CHALLENGE"
```

En Windows/Git Bash, **no** uses `base64 | tr -d '=+/'` para el challenge: borra `+` en vez de convertirlos y el servidor responde `PKCE verification failed`. Alternativa que coincide con `src/lib/pkce.ts`:

```bash
node --input-type=module -e "
import { randomBytes, createHash } from 'crypto';
const b64url = (b) => b.toString('base64').replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
const VERIFIER = b64url(randomBytes(32)).replace(/=+/g,'').slice(0,43);
const CHALLENGE = b64url(createHash('sha256').update(VERIFIER).digest());
console.log('VERIFIER='+VERIFIER);
console.log('CHALLENGE='+CHALLENGE);
"
```

Repetir el paso 5.1 con `code_challenge=$CHALLENGE`, copiar el `code`, y:

```bash
curl -X POST http://localhost:3002/oauth/token \
  -H "Content-Type: application/json" \
  -d "{
    \"grant_type\":\"authorization_code\",
    \"code\":\"PEGAR_CODE_DE_URL\",
    \"code_verifier\":\"$VERIFIER\",
    \"client_id\":\"aimemory-claude\",
    \"redirect_uri\":\"http://localhost:3334/callback\"
  }"
```

Respuesta esperada:

```json
{
  "access_token": "aimem_abcdef...",
  "token_type": "Bearer",
  "expires_in": 31536000,
  "scope": "memories:read memories:write"
}
```

### 5.3 Probar el endpoint MCP con el token

```bash
TOKEN="aimem_loque_te_devolvio"

# Initialize MCP session
curl -X POST http://localhost:3002/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{
      "protocolVersion":"2024-11-05",
      "capabilities":{},
      "clientInfo":{"name":"curl-test","version":"1.0"}
    }
  }' -i
```

La respuesta debe traer un header `mcp-session-id`. Guardalo y usalo en las llamadas siguientes (`tools/list`, `tools/call`).

---

## 6. Deploy a Railway

### 6.1 Crear el servicio

1. Railway Dashboard → tu proyecto → New Service → GitHub Repo → elegir `RemoteMCP-AIMemory` (o subir como deploy desde CLI).
2. Settings → **Root Directory**: dejar en blanco si subiste sólo este folder, o setear `RemoteMCP-AIMemory` si está dentro de un monorepo.
3. El `[railway.toml](railway.toml)` ya define `buildCommand`, `startCommand` y `healthcheckPath=/health`.

### 6.2 Variables de entorno en Railway

Settings → Variables. Mínimo:

**`MCP_PUBLIC_URL`:** copiá la URL pública del servicio en Railway → Settings → **Networking** (ej. `https://nombre-servicio.up.railway.app`). Sin barra final y **sin** `/mcp`. No subas un archivo `.env` al deploy.

| Variable                    | Valor (prod)                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `PORT`                      | `3002` (Railway lo sobrescribe con el suyo — está bien)                                   |
| `MCP_PUBLIC_URL`            | `https://TU-SERVICIO.up.railway.app` (o `https://mcp.aimemory.lat` cuando configures DNS) |
| `DASHBOARD_URL`             | `https://ia-memory-dashboard.vercel.app` (o tu dominio del dashboard)                     |
| `SUPABASE_URL`              | mismo que API y Dashboard                                                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | mismo que API y Dashboard                                                                 |
| `OPENAI_API_KEY`            | opcional, mejora el recall                                                                |
| `OAUTH_CLIENT_ID`           | `aimemory-claude`                                                                         |
| `ALLOWED_REDIRECT_URIS`     | `https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback`        |
| `CORS_ORIGINS`              | `https://claude.ai,https://claude.com,https://api.anthropic.com`                          |


### 6.3 Deploy

Push a `main` (o trigger manual desde Railway). El healthcheck pega a `/health`; si responde 200, el deploy queda live.

### 6.4 Verificar prod

```bash
curl https://TU-SERVICIO.up.railway.app/health
curl https://TU-SERVICIO.up.railway.app/.well-known/oauth-authorization-server
```

### 6.5 (Opcional) Dominio custom `mcp.aimemory.lat`

Railway → Settings → Networking → Custom Domain → `mcp.aimemory.lat`. Te da un `CNAME` para apuntar en tu DNS (Cloudflare/Vercel DNS). Después actualizá `MCP_PUBLIC_URL` en Railway → redeploy → actualizá `NEXT_PUBLIC_MCP_PUBLIC_URL` en Vercel (Dashboard y Landing).

---

## 7. Actualizar Vercel (Dashboard + Landing)

### 7.1 Dashboard (Vercel)

Project → Settings → Environment Variables → agregar para **Production y Preview**:

```
NEXT_PUBLIC_MCP_PUBLIC_URL=https://TU-SERVICIO.up.railway.app
```

Redeploy.

Verificar que `/api/oauth/mcp/authorize?ticket=xxx` exista (debe responder 400 sin ticket válido, no 404).

### 7.2 Landing (Vercel)

Mismo procedimiento, mismo nombre de variable. Redeploy.

Verificar `https://aimemory.lat/install` — el botón debe llevar a `claude://mcp/install?...` con la URL correcta.

---

## 8. Conectar desde cada cliente

### 8.1 Claude Desktop / claude.ai (OAuth, one-click)

1. Usuario abre `https://aimemory.lat/install`.
2. Hace clic en **Connect with One Click**.
3. El browser abre `claude://mcp/install?name=AI%20Memory&url=https://TU-SERVICIO.up.railway.app/mcp`.
4. Claude Desktop pide confirmación → confirma.
5. Claude redirige al dashboard → login con Google si hace falta → autoriza.
6. Claude recibe el token y queda conectado.

Si la versión de Claude no soporta el deep link, usar el fallback de la misma página `/install`: copiar la URL del MCP, ir a Claude → Settings → Connectors → Add Custom Connector → pegar.

### 8.2 Cursor (HTTP MCP, manual con Bearer)

Cursor todavía no implementa OAuth para MCP. Flujo:

1. Usuario va a `https://ia-memory-dashboard.vercel.app/api-keys` y copia su `aimem_`* (ya provisionado en el primer login).
2. En Cursor: `Settings → MCP → + Add new MCP server`.
3. Pegar este JSON:

```json
{
  "mcpServers": {
    "aimemory": {
      "url": "https://TU-SERVICIO.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer aimem_..."
      }
    }
  }
}
```

1. Save → Cursor muestra los 6 tools disponibles.

### 8.3 VS Code (Copilot + MCP, manual con Bearer)

VS Code soporta MCP via `mcp.json`. Mismo patrón que Cursor:

```json
{
  "servers": {
    "aimemory": {
      "type": "http",
      "url": "https://TU-SERVICIO.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer aimem_..."
      }
    }
  }
}
```

Ubicación: `.vscode/mcp.json` (workspace) o User Settings global.

### 8.4 ChatGPT (NO usa MCP — Custom GPT Actions)

Camino separado: usar el [Custom GPT existente](../AIMemory/packages/custom-gpt/README.md) con el `openapi-schema.json` apuntando a la REST API en Railway (no a este Remote MCP). Misma key `aimem_*` sirve.

---

## 9. Troubleshooting


| Síntoma                                        | Causa probable                                                | Fix                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `node: .env: not found` en logs Railway        | `start` antiguo con `--env-file=.env` (archivo no va al deploy) | Usar `npm start` = `node dist/index.js`; vars en Railway panel; redeploy                              |
| `curl /health` → connection refused            | Server no levantó                                             | Revisar logs `npm run dev`; `.env` sin parsear (probablemente falta una var requerida por `config.ts`) |
| `EADDRINUSE :::3002`                           | Puerto ocupado por otra instancia                             | `netstat -ano \| findstr :3002` y `taskkill /PID <pid> /F` (Windows) o cerrar el `npm run dev` anterior |
| `jq: command not found` / `curl: (23)`         | `jq` no instalado; el JSON sí llegó                           | Usar `curl -s` sin pipe, `python -m json.tool`, o instalar `jq` (ver §3.4)                              |
| `/.well-known/oauth-authorization-server` 404  | Server vieja sin estos endpoints                              | `npm run build` y restart                                                                              |
| OAuth: `invalid_redirect_uri`                  | URI no está en `ALLOWED_REDIRECT_URIS`                        | Agregarlo (coma-separado, sin espacios) y restart                                                      |
| OAuth: `invalid_client`                        | `client_id` no coincide con `OAUTH_CLIENT_ID`                 | Usar `aimemory-claude` o el que pusiste en env                                                         |
| OAuth: `invalid_grant` en /token               | code expirado (>10min), ya usado, o redirect_uri distinto     | Reiniciar flujo desde `/oauth/authorize`                                                               |
| OAuth: `PKCE verification failed`              | `code_challenge` de la URL ≠ hash del `code_verifier` (común en Windows: `tr -d '=+/'` en el doc viejo) | Regenerar par con §5.2 (comando `openssl base64 -A \| tr` o script `node`), **nuevo** 5.1 y **nuevo** `code` |
| `/mcp` → `invalid_token`                       | API key no existe en `api_keys` o `is_active=false`           | Revisar tabla; regenerar key desde dashboard                                                           |
| `/mcp` → "no valid session and not initialize" | El cliente saltó el `initialize` o perdió el `mcp-session-id` | Asegurar header `mcp-session-id` en requests subsiguientes                                             |
| Dashboard: signIn falla con AccessDenied       | Bug típico: `SUPABASE_URL` con `/rest/v1` al final            | Quitar el sufijo (la lib lo agrega sola)                                                               |
| Dashboard no auto-provisiona API key           | `supabaseAdmin` null por env mal seteado                      | Setear `SUPABASE_SERVICE_ROLE_KEY` en Vercel                                                           |
| Claude Desktop no abre el deep link            | Versión vieja sin `claude://` handler                         | Usar el manual fallback en `/install`                                                                  |


### Habilitar logs de auth en API (debug)

Si problemas de "invalid token" entre Remote MCP y la API REST:

```bash
# En Railway, en el servicio de la API:
DEBUG_AUTH_LOGS=1
```

Después revisar `console.info('[auth:debug]')` en los logs.

---

## 10. Checklist de release

Antes de mandar usuarios reales:

- `supabase/migration.sql` corrida en prod
- Remote MCP deployado en Railway, `/health` 200
- `MCP_PUBLIC_URL` correcto en Railway
- `NEXT_PUBLIC_MCP_PUBLIC_URL` correcto en Vercel (Dashboard y Landing) → redeploy
- `ALLOWED_REDIRECT_URIS` incluye los callbacks de Claude
- Login con Google en Dashboard auto-provisiona key (verificado en `api_keys`)
- `/install` muestra la URL de prod
- Flujo OAuth completo testeado con un user real desde Claude Desktop o claude.ai
- Logs de Railway sin errores en los últimos 5 minutos de tráfico
- Backups de Supabase activos (point-in-time recovery)

---

## 10.1 Plan limits (enforcement)

Limits are enforced in **Remote MCP**, **API**, and **Dashboard** (default ON; set `PLAN_LIMITS_ENABLED=false` only for local debugging).

| Plan | API calls / day | Memories |
|------|-----------------|----------|
| Free | 100 | 500 |
| Pro | 10,000 | 5,000 |
| Team | Unlimited | 25,000 |
| Enterprise | Unlimited | Unlimited |

**Rules (strict — no grandfathering):**

- If `count(memories) >= limit`: all MCP tools blocked except `forget`; dashboard GET memories still works for cleanup.
- If daily quota exceeded: all tools blocked except `forget`.
- Paid plan with `subscription_status !== active` → free limits.
- `usage_logs` feeds the dashboard **Usage** page (`/usage`).

**Errors:** `PLAN_LIMIT_MEMORY` (403), `PLAN_LIMIT_DAILY` (429). Upgrade URL: dashboard `/billing`.

**SYNC:** keep `plans.ts` identical in `Dash-AIMemory/lib`, `API-IAMemory/src/lib`, `RemoteMCP-AIMemory/src/lib`.

---

## 11. Siguiente iteración (deferred, NO hoy)


| Item                                                                        | Esfuerzo                            | ROI                                                              |
| --------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| npm publish `@aimemory/mcp-remote`                                          | 30 min                              | Alto — habilita citas oficiales                                  |
| Submit a Claude Connectors Directory                                        | 1h llenar form + 2-4 semanas review | Alto — distribución masiva                                       |
| Submit a MCP Registry oficial                                               | 1h                                  | Medio — agregadores auto-sync                                    |
| Dynamic Client Registration (`/oauth/register` real)                        | 4h                                  | Alto si querés que clientes nuevos no requieran whitelist manual |
| Refresh tokens                                                              | 3h                                  | Bajo (tokens son de 1 año)                                       |
| Selector de cliente en `/install` (Claude/Cursor/VS Code en un mismo flujo) | 2h                                  | Alto para UX                                                     |
| Rate limiting en `/oauth/token`                                             | 1h                                  | Medio (anti-abuse)                                               |


---

## 12. Referencias rápidas

- [Plan de implementación](../.cursor/plans/remote_mcp_oauth_hybrid_bb07b396.plan.md) (interno)
- MCP spec: [https://spec.modelcontextprotocol.io/](https://spec.modelcontextprotocol.io/)
- OAuth 2.1 draft: [https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- Anthropic Connectors docs: [https://docs.anthropic.com/en/docs/agents-and-tools/mcp](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)

