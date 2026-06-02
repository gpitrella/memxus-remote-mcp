#!/usr/bin/env node
/**
 * Upsert oauth_clients row for ChatGPT Custom GPT Actions (no PKCE).
 *
 * Requires in .env or shell:
 *   CHATGPT_OAUTH_CLIENT_ID (default memxus-chatgpt)
 *   CHATGPT_OAUTH_CLIENT_SECRET
 *   CHATGPT_OAUTH_REDIRECT_URI  — exact Callback URL from GPT editor (Configure tab)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Also add CHATGPT_OAUTH_REDIRECT_URI to Railway ALLOWED_REDIRECT_URIS before DCR/register.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const clientId = process.env.CHATGPT_OAUTH_CLIENT_ID ?? 'memxus-chatgpt';
const redirectUri = process.env.CHATGPT_OAUTH_REDIRECT_URI;
const secret = process.env.CHATGPT_OAUTH_CLIENT_SECRET;

if (!secret || secret.length < 16) {
  console.error('CHATGPT_OAUTH_CLIENT_SECRET must be at least 16 characters');
  process.exit(1);
}
if (!redirectUri) {
  console.error('CHATGPT_OAUTH_REDIRECT_URI is required (copy from ChatGPT GPT editor Callback URL)');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const sb = createClient(url, key);

const row = {
  client_id: clientId,
  client_name: 'Memxus ChatGPT',
  redirect_uris: [redirectUri],
  token_endpoint_auth_method: 'client_secret_post',
};

const { error } = await sb.from('oauth_clients').upsert(row, { onConflict: 'client_id' });
if (error) {
  console.error('Upsert failed:', error.message);
  process.exit(1);
}

console.log(`OK oauth_clients: ${clientId}`);
console.log(`  redirect_uris: ${redirectUri}`);
console.log('Next: set same Client ID + Secret in ChatGPT GPT Actions OAuth, then test login.');
