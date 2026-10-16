import type { SupabaseClient } from '@supabase/supabase-js';
import { CloudError, type CloudTransport, type RoomSnapshot } from './cloud';

// Public (publishable) project credentials — safe to ship in the browser. All writes are
// PIN-checked inside Postgres functions; the anon key can only read rooms.
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://mhcnxroktemtcjslgoln.supabase.co';
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? 'sb_publishable_eLkwog-_az29zXWyWBmt9w_NnAKBmmw';

// The Supabase library is loaded on first use, so laptops that never use Live Sync don't download it.
let client: Promise<SupabaseClient> | null = null;
function sb(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }),
  );
  return client;
}

async function call<T>(fn: (c: SupabaseClient) => PromiseLike<T>): Promise<T> {
  let c: SupabaseClient;
  try {
    c = await sb();
  } catch (err) {
    client = null; // allow a retry once the network is back
    throw new CloudError('network', `Can't load the sync library (${(err as Error).message})`);
  }
  return fn(c);
}

function toCloudError(err: { code?: string; message?: string } | null | undefined): CloudError {
  const code = err?.code ?? '';
  const msg = err?.message ?? 'Unknown error';
  if (code === '28P01') return new CloudError('pin', 'Wrong PIN for this room');
  if (code === '40001') return new CloudError('conflict', 'Room was changed by another device');
  if (code === '22023' || code === '23514') return new CloudError('invalid', msg);
  return new CloudError('network', `Can't reach the sync server (${msg})`);
}

export const supabaseTransport: CloudTransport = {
  async openRoom(code, pin, data) {
    const { data: rows, error } = await call((c) => c.rpc('mojar_open_room', { p_code: code, p_pin: pin, p_data: data }));
    if (error) throw toCloudError(error);
    const row = (rows as { revision: number; data: unknown; created: boolean }[] | null)?.[0];
    if (!row) throw new CloudError('network', 'Empty response from sync server');
    return { revision: Number(row.revision), data: row.data, created: row.created };
  },

  async save(code, pin, data, baseRevision) {
    const { data: rev, error } = await call((c) => c.rpc('mojar_save', { p_code: code, p_pin: pin, p_data: data, p_base_revision: baseRevision }));
    if (error) throw toCloudError(error);
    return Number(rev);
  },

  async fetchRoom(code): Promise<RoomSnapshot | null> {
    const { data, error } = await call((c) => c.from('mojar_rooms').select('revision,data').eq('code', code).maybeSingle());
    if (error) throw toCloudError(error);
    return data ? { revision: Number(data.revision), data: data.data } : null;
  },

  async fetchRevision(code) {
    const { data, error } = await call((c) => c.from('mojar_rooms').select('revision').eq('code', code).maybeSingle());
    if (error) throw toCloudError(error);
    return data ? Number(data.revision) : null;
  },

  subscribe(code, onChange, onLive) {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    void sb()
      .then((c) => {
        if (cancelled) return;
        const channel = c
          .channel(`mojar-room-${code}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mojar_rooms', filter: `code=eq.${code}` }, (payload) => {
            const row = payload.new as { revision?: number; data?: unknown };
            if (typeof row.revision === 'number') onChange({ revision: row.revision, data: row.data });
          })
          .subscribe((status) => onLive(status === 'SUBSCRIBED'));
        cleanup = () => void c.removeChannel(channel);
      })
      .catch(() => onLive(false)); // polling keeps working without push
    return () => {
      cancelled = true;
      onLive(false);
      cleanup?.();
    };
  },
};
