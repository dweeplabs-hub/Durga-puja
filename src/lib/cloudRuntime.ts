import { CloudSync } from './cloud';
import { supabaseTransport } from './cloudSupabase';
import { applyCloudData, toast, useCompetition } from '../store';

let instance: CloudSync | null = null;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The app's single sync controller (lazy, so nothing connects until Live Sync is used). */
export function cloudSync(): CloudSync {
  instance ??= new CloudSync({
    transport: supabaseTransport,
    getData: () => useCompetition.getState().data,
    // Only edits made in this window are uploaded (not data that arrived from the cloud or another tab).
    onLocalEdit: (cb) =>
      useCompetition.subscribe((s, prev) => {
        if (s.origin === 'local' && s.revision !== prev.revision) cb();
      }),
    applyRemote: (raw) => applyCloudData(raw),
    notify: (kind, message) => toast[kind](message),
    storage: safeStorage(),
  });
  return instance;
}
