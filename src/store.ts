import { useMemo } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CompetitionData, LedgerResult } from './types';
import { emptyCompetition } from './lib/defaults';
import { computeLedger } from './lib/engine';
import { OpError, finalize, parseBackup } from './lib/operations';

export const STORAGE_KEY = 'womens-auction-challenge:v1';
const CHANNEL_NAME = 'womens-auction-challenge-sync';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface UiState {
  toasts: Toast[];
  pushToast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;
export const useToasts = create<UiState>((set) => ({
  toasts: [],
  pushToast: (kind, message) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (m: string) => useToasts.getState().pushToast('success', m),
  error: (m: string) => useToasts.getState().pushToast('error', m),
  info: (m: string) => useToasts.getState().pushToast('info', m),
};

const nextRevision = (prev: number) => Math.max(prev + 1, Date.now());

interface CompetitionStore {
  data: CompetitionData;
  /**
   * Monotonic, timestamp-based revision of `data`. Windows only accept remote
   * updates with a higher revision, so stale echoes can never overwrite newer edits.
   */
  revision: number;
  /**
   * Applies a pure operation to the competition data. Rule violations are shown as
   * toasts and return false; on success the new state is persisted and broadcast.
   */
  run: (op: (d: CompetitionData) => CompetitionData, successMessage?: string) => boolean;
  replaceData: (d: CompetitionData) => void;
}

export const useCompetition = create<CompetitionStore>()(
  persist(
    (set, get) => ({
      data: finalize(emptyCompetition()),
      revision: 0,
      run: (op, successMessage) => {
        try {
          const next = finalize(op(get().data));
          set((s) => ({ data: next, revision: nextRevision(s.revision) }));
          if (successMessage) toast.success(successMessage);
          return true;
        } catch (err) {
          if (err instanceof OpError) toast.error(err.message);
          else {
            console.error(err);
            toast.error(`Unexpected error: ${(err as Error).message}`);
          }
          return false;
        }
      },
      replaceData: (d) => set((s) => ({ data: finalize(d), revision: nextRevision(s.revision) })),
    }),
    {
      name: STORAGE_KEY,
      version: 5,
      storage: createJSONStorage(() => localStorage),
      // v2 renamed the game; v3 moved the name into `branding` and added the DJ/soundboard config;
      // v4 is the Kori theme (token-named fields renamed, Kori clink / festival BGM settings);
      // v5 replaces fixed 1st/2nd/3rd placements with 6x…1x multiplier awards.
      // parseBackup normalises any older shape (and fills new fields with defaults).
      migrate: (persisted) => {
        const state = persisted as { data?: CompetitionData; revision?: number };
        if (state.data) {
          try {
            state.data = parseBackup(state.data);
          } catch (err) {
            console.error('Could not migrate saved competition data', err);
          }
        }
        return state as CompetitionStore;
      },
      partialize: (s) => ({ data: s.data, revision: s.revision }),
    },
  ),
);

/** Memoised ledger for the current data. */
export function useLedger(): LedgerResult {
  const data = useCompetition((s) => s.data);
  return useMemo(() => computeLedger(data), [data]);
}

// ---------------------------------------------------------------- cross-window sync

let applyingRemote = false;
let syncStarted = false;

/**
 * Keeps every open window (admin + projector) in sync. BroadcastChannel delivers
 * updates instantly; the `storage` event is a fallback for browsers without it.
 */
export function startCrossWindowSync() {
  if (syncStarted || typeof window === 'undefined') return;
  syncStarted = true;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;

  const applyRemote = (data: CompetitionData, revision: number) => {
    if (!(revision > useCompetition.getState().revision)) return;
    applyingRemote = true;
    try {
      useCompetition.setState({ data, revision });
    } finally {
      applyingRemote = false;
    }
  };

  channel?.addEventListener('message', (ev: MessageEvent) => {
    const msg = ev.data as { type?: string; data?: CompetitionData; revision?: number };
    if (msg?.type === 'state' && msg.data && typeof msg.revision === 'number') applyRemote(msg.data, msg.revision);
  });

  window.addEventListener('storage', (ev) => {
    if (ev.key !== STORAGE_KEY || !ev.newValue) return;
    try {
      const parsed = JSON.parse(ev.newValue) as { state?: { data?: CompetitionData; revision?: number } };
      if (parsed.state?.data && typeof parsed.state.revision === 'number') applyRemote(parsed.state.data, parsed.state.revision);
    } catch {
      /* ignore malformed storage writes */
    }
  });

  useCompetition.subscribe((state, prev) => {
    if (applyingRemote || state.revision === prev.revision) return;
    channel?.postMessage({ type: 'state', data: state.data, revision: state.revision });
  });
}
