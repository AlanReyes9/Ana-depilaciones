import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getDB, replaceDB, setRemoteSaver } from './store';
import type { DB } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudEnabled = Boolean(url && key);
export const supabase: SupabaseClient | null = cloudEnabled ? createClient(url!, key!) : null;

const ROW = 'main';
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
async function save(db: DB) {
  if (!supabase) return;
  setStatus('saving');
  const { error } = await supabase
    .from('erp_state')
    .upsert({ id: ROW, data: db, updated_at: new Date().toISOString() });
  setStatus(error ? 'error' : 'saved');
  if (error) console.error(error);
}

/** Loads the shared database from Supabase (or seeds it) and starts syncing changes. */
export async function startCloudSync() {
  if (!supabase) return;
  const { data, error } = await supabase.from('erp_state').select('data').eq('id', ROW).maybeSingle();
  if (error) throw error;
  if (data?.data) replaceDB(data.data as DB, false);
  else await save(getDB());
  setRemoteSaver((db) => {
    clearTimeout(timer);
    setStatus('saving');
    timer = setTimeout(() => save(db), 1200);
  });
}

export function stopCloudSync() {
  setRemoteSaver(null);
}
