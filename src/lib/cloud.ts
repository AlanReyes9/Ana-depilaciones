import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { getDB, replaceDB, setRemoteSaver } from './store';
import type { DB } from './types';
import { uid } from './utils';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudEnabled = Boolean(url && key);
export const supabase: SupabaseClient | null = cloudEnabled ? createClient(url!, key!) : null;

const ROW = 'main';
/** Identifies this browser tab so it can ignore realtime echoes of its own saves. */
const CLIENT_ID = uid();

type Status = 'idle' | 'saving' | 'saved' | 'error';
let status: Status = 'idle';
const statusListeners = new Set<(s: Status) => void>();
const setStatus = (s: Status) => {
  status = s;
  statusListeners.forEach((l) => l(s));
};
export const onCloudStatus = (l: (s: Status) => void) => {
  statusListeners.add(l);
  l(status);
  return () => void statusListeners.delete(l);
};

let timer: ReturnType<typeof setTimeout> | undefined;
let pending = false;
let lastRemoteAt = '';
let channel: RealtimeChannel | null = null;

async function save(db: DB) {
  if (!supabase) return;
  const updated_at = new Date().toISOString();
  const { error } = await supabase
    .from('erp_state')
    .upsert({ id: ROW, data: db, updated_at, updated_by: CLIENT_ID });
  pending = false;
  if (error) {
    console.error(error);
    setStatus('error');
    return;
  }
  lastRemoteAt = updated_at;
  setStatus('saved');
}

async function pull() {
  if (!supabase || pending) return;
  const { data, error } = await supabase.from('erp_state').select('data, updated_at').eq('id', ROW).maybeSingle();
  if (error || !data || pending) return;
  if (data.updated_at !== lastRemoteAt) {
    lastRemoteAt = data.updated_at;
    replaceDB(data.data as DB, false);
  }
}

const onVisible = () => document.visibilityState === 'visible' && pull();

/** Loads the shared database from Supabase (or seeds it) and starts syncing changes. */
export async function startCloudSync() {
  if (!supabase) return;
  const allowed = await supabase.rpc('is_erp_user');
  if (allowed.error) throw allowed.error;
  if (!allowed.data) throw new Error('not-authorized');
  const { data, error } = await supabase.from('erp_state').select('data, updated_at').eq('id', ROW).maybeSingle();
  if (error) throw error;
  if (data?.data) {
    lastRemoteAt = data.updated_at;
    replaceDB(data.data as DB, false);
  } else {
    // First login ever: upload what this device already has.
    await save(getDB());
  }
  setRemoteSaver((db) => {
    pending = true;
    clearTimeout(timer);
    setStatus('saving');
    timer = setTimeout(() => save(db), 800);
  });
  channel = supabase
    .channel('erp_state')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'erp_state', filter: `id=eq.${ROW}` }, (payload) => {
      const row = payload.new as { data?: DB; updated_by?: string; updated_at?: string };
      if (!row?.data || row.updated_by === CLIENT_ID || pending) return;
      lastRemoteAt = row.updated_at || lastRemoteAt;
      replaceDB(row.data, false);
    })
    .subscribe();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('beforeunload', flushWarning);
}

function flushWarning(e: BeforeUnloadEvent) {
  if (pending) e.preventDefault();
}

export function stopCloudSync() {
  setRemoteSaver(null);
  clearTimeout(timer);
  if (channel) supabase?.removeChannel(channel);
  channel = null;
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('beforeunload', flushWarning);
}

// ---------- Cuenta y usuarios autorizados ----------

export async function currentEmail() {
  const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  return data.user?.email ?? '';
}

export async function listAllowed(): Promise<string[]> {
  const { data, error } = await supabase!.from('erp_users').select('email').order('created_at');
  if (error) throw error;
  return data.map((r) => r.email as string);
}

export async function allowEmail(email: string) {
  const { error } = await supabase!.from('erp_users').insert({ email: email.trim().toLowerCase() });
  if (error) throw error;
}

export async function revokeEmail(email: string) {
  const { error } = await supabase!.from('erp_users').delete().eq('email', email);
  if (error) throw error;
}
