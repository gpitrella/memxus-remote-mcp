import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import ws from 'ws';
import { config } from '../config.js';

type ClientOptions = SupabaseClientOptions<'public'>;
type RealtimeTransport = NonNullable<ClientOptions['realtime']>['transport'];

const supabaseRealtimeOptions: Pick<ClientOptions, 'realtime'> = {
  realtime: { transport: ws as RealtimeTransport },
};

function normalizeUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/, '')
    .replace(/\/auth\/v1$/, '')
    .replace(/\/storage\/v1$/, '')
    .replace(/\/realtime\/v1$/, '');
}

export const supabase = createClient(
  normalizeUrl(config.SUPABASE_URL),
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    ...supabaseRealtimeOptions,
  }
);
