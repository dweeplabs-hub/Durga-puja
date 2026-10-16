import { create } from 'zustand';
import type { CompetitionData } from '../types';

/**
 * Live multi-laptop sync.
 *
 * The entry laptop ("host") uploads every change to a Supabase row identified by
 * a room code; saves are PIN-checked server-side and use optimistic concurrency
 * (a save only succeeds if it is based on the latest server revision). Projector
 * laptops ("viewers") open `#/projector?room=CODE`, get pushed updates over
 * Supabase Realtime, and poll as a fallback. Every laptop keeps its own local copy,
 * so a dropped connection never loses data – the host simply re-uploads on reconnect.
 */

export interface RoomSnapshot {
  revision: number;
  data: unknown;
}

export class CloudError extends Error {
  constructor(
    public kind: 'pin' | 'conflict' | 'network' | 'invalid' | 'not-found',
    message: string,
  ) {
    super(message);
  }
}

/** Network operations the sync controller needs. Swappable for tests. */
export interface CloudTransport {
  openRoom(code: string, pin: string, data: unknown): Promise<RoomSnapshot & { created: boolean }>;
  save(code: string, pin: string, data: unknown, baseRevision: number): Promise<number>;
  fetchRoom(code: string): Promise<RoomSnapshot | null>;
  /** Cheap check of the latest revision (null if the room doesn't exist). */
  fetchRevision?(code: string): Promise<number | null>;
  /** Calls `onChange` when the room changes (payload may include the new snapshot). Returns an unsubscribe fn. */
  subscribe(code: string, onChange: (snap: Partial<RoomSnapshot> & { revision: number }) => void, onLive: (live: boolean) => void): () => void;
}

export type CloudRole = 'off' | 'host' | 'viewer';
export type CloudStatus = 'idle' | 'connecting' | 'live' | 'saving' | 'offline' | 'error';

interface CloudState {
  role: CloudRole;
  code: string | null;
  status: CloudStatus;
  /** Realtime push connected (polling still covers gaps when false). */
  pushConnected: boolean;
  serverRevision: number;
  lastSyncedAt: number | null;
  error: string | null;
  /** Host joined a room that already has data different from this device; awaits a choice. */
  pendingChoice: { remote: RoomSnapshot } | null;
}

const initialCloudState = (): CloudState => ({
  role: 'off',
  code: null,
  status: 'idle',
  pushConnected: false,
  serverRevision: 0,
  lastSyncedAt: null,
  error: null,
  pendingChoice: null,
});

/** Creates a sync-status store (one per laptop/window; tests create several). */
export function createCloudStore() {
  return create<CloudState>(initialCloudState);
}

export type CloudStore = ReturnType<typeof createCloudStore>;

/** The app's sync status (read by the header badge, dialog and projector). */
export const useCloud = createCloudStore();

const HOST_KEY = 'mojar:cloud-host';

export function normaliseRoomCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '-');
}

export function validRoomCode(code: string): boolean {
  return /^[A-Z0-9-]{4,32}$/.test(code);
}

export function suggestRoomCode(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `MOJAR-${n}`;
}

export function projectorLink(code: string): string {
  if (typeof window === 'undefined') return `#/projector?room=${code}`;
  return `${window.location.origin}${window.location.pathname}#/projector?room=${encodeURIComponent(code)}`;
}

/** Strip derived fields before upload (the engine recomputes them), keeping payloads small. */
export function toWire(data: CompetitionData): unknown {
  return { ...data, events: data.events.map((e) => ({ ...e, roundResults: [] })) };
}

function hasEventData(raw: unknown): boolean {
  const d = raw as Partial<CompetitionData> | null;
  return Boolean(d && Array.isArray(d.participants) && d.participants.length > 0);
}

export interface SyncDeps {
  transport: CloudTransport;
  /** Current local data. */
  getData: () => CompetitionData;
  /** Subscribe to local edits that should be uploaded. Returns unsubscribe. */
  onLocalEdit: (cb: () => void) => () => void;
  /** Apply data received from the server. */
  applyRemote: (raw: unknown) => void;
  notify?: (kind: 'info' | 'error' | 'success', message: string) => void;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** Status store to write to (defaults to the app-wide `useCloud`). */
  store?: CloudStore;
  /** Timing knobs (overridable in tests). */
  debounceMs?: number;
  pollMs?: number;
}

/** Orchestrates host uploads and viewer downloads for one window. */
export class CloudSync {
  private deps: Required<Omit<SyncDeps, 'notify' | 'storage' | 'store'>> & Pick<SyncDeps, 'notify' | 'storage'>;
  private store: CloudStore;
  private pin = '';
  private unsubs: (() => void)[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private saving = false;
  private dirty = false;
  private retryDelay = 2000;
  private fetching = false;

  constructor(deps: SyncDeps) {
    this.deps = { debounceMs: 300, pollMs: 3000, ...deps };
    this.store = deps.store ?? useCloud;
  }

  private set(patch: Partial<CloudState>) {
    this.store.setState(patch);
  }

  get state(): CloudState {
    return this.store.getState();
  }

  // ------------------------------------------------------------ host

  /** Joins (or creates) a room as an entry laptop. Resolves when connected or a choice is needed. */
  async host(rawCode: string, pin: string): Promise<void> {
    const code = normaliseRoomCode(rawCode);
    if (!validRoomCode(code)) throw new CloudError('invalid', 'Room code: 4–32 letters, numbers or dashes');
    if (pin.length < 4) throw new CloudError('invalid', 'PIN must be at least 4 characters');
    this.stop(false);
    this.pin = pin;
    this.set({ role: 'host', code, status: 'connecting', error: null, pendingChoice: null });
    let snap: RoomSnapshot & { created: boolean };
    try {
      snap = await this.deps.transport.openRoom(code, pin, toWire(this.deps.getData()));
    } catch (err) {
      const e = err as CloudError;
      this.set({ role: 'off', code: null, status: e.kind === 'network' ? 'offline' : 'error', error: e.message });
      throw err;
    }
    const saved = this.readSaved();
    const same = saved?.code === code ? saved : null;
    this.remember({ code, pin, rev: same?.rev ?? 0, dirty: same?.dirty ?? false });
    this.set({ serverRevision: snap.revision });
    let resumeUpload = false;
    if (snap.created) {
      this.markSynced(snap.revision);
    } else if (!hasEventData(this.deps.getData())) {
      // Fresh laptop: just load the online event.
      this.deps.applyRemote(snap.data);
      this.markSynced(snap.revision);
    } else if (same && snap.revision === same.rev) {
      // Reconnect after a reload: nobody else changed it; upload anything we hadn't sent yet.
      this.markSynced(snap.revision);
      resumeUpload = same.dirty;
    } else if (same && snap.revision > same.rev && !same.dirty) {
      // Another laptop moved on while we were away and we have nothing unsent: follow it.
      this.deps.applyRemote(snap.data);
      this.markSynced(snap.revision);
    } else {
      this.set({ pendingChoice: { remote: { revision: snap.revision, data: snap.data } }, status: 'live' });
    }
    this.startWatching(code, true);
    this.unsubs.push(
      this.deps.onLocalEdit(() => {
        if (this.state.pendingChoice) return;
        this.scheduleSave();
      }),
    );
    if (resumeUpload) this.scheduleSave(0);
    if (typeof window !== 'undefined') {
      const online = () => this.state.role === 'host' && this.dirtyOrFailed() && this.scheduleSave(0);
      window.addEventListener('online', online);
      this.unsubs.push(() => window.removeEventListener('online', online));
    }
  }

  /** Resolve the "room already has data" choice. */
  async resolveChoice(useRemote: boolean) {
    const pending = this.state.pendingChoice;
    if (!pending) return;
    this.set({ pendingChoice: null });
    if (useRemote) {
      this.deps.applyRemote(pending.remote.data);
      this.markSynced(pending.remote.revision);
    } else {
      this.dirty = true;
      this.scheduleSave(0);
    }
  }

  /** Reconnects a host after a page reload, using the code/PIN saved on this device. */
  async resumeHost(): Promise<boolean> {
    const raw = this.deps.storage?.getItem(HOST_KEY);
    if (!raw) return false;
    try {
      const { code, pin } = JSON.parse(raw) as { code: string; pin: string };
      await this.host(code, pin);
      return true;
    } catch (err) {
      if ((err as CloudError).kind === 'pin') this.deps.storage?.removeItem(HOST_KEY);
      return false;
    }
  }

  private dirtyOrFailed() {
    return this.dirty || this.state.status === 'offline' || this.state.status === 'error';
  }

  private readSaved(): { code: string; pin: string; rev: number; dirty: boolean } | null {
    try {
      const raw = this.deps.storage?.getItem(HOST_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** Persists host connection info + sync position on this laptop so a reload can resume safely. */
  private remember(patch: Partial<{ code: string; pin: string; rev: number; dirty: boolean }>) {
    if (!this.deps.storage) return;
    const next = { ...(this.readSaved() ?? {}), ...patch };
    try {
      this.deps.storage.setItem(HOST_KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked: sync still works for this session */
    }
  }

  private scheduleSave(delay = this.deps.debounceMs) {
    this.dirty = true;
    if (this.state.role === 'host') this.remember({ dirty: true });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), delay);
    return true;
  }

  /** Uploads the latest local data. Coalesces bursts; retries with backoff when offline. */
  async flush(): Promise<void> {
    const { code, role } = this.state;
    if (role !== 'host' || !code) return;
    if (this.saving) {
      this.dirty = true;
      return;
    }
    this.saving = true;
    this.dirty = false;
    this.set({ status: 'saving' });
    try {
      const rev = await this.deps.transport.save(code, this.pin, toWire(this.deps.getData()), this.state.serverRevision);
      this.retryDelay = 2000;
      this.markSynced(rev);
    } catch (err) {
      const e = err as CloudError;
      if (e.kind === 'conflict') {
        // Another entry laptop saved first: take the online version so both laptops agree.
        await this.pull(true, true);
        this.deps.notify?.('error', 'Another laptop changed the event at the same moment — showing the online version. Please re-check your last entry.');
      } else if (e.kind === 'pin') {
        this.set({ status: 'error', error: e.message });
      } else {
        this.dirty = true;
        this.set({ status: 'offline', error: 'No internet — changes are kept on this laptop and will upload when back online.' });
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => void this.flush(), this.retryDelay);
        this.retryDelay = Math.min(this.retryDelay * 2, 15000);
      }
    } finally {
      this.saving = false;
    }
    if (this.dirty && this.state.status !== 'offline' && this.state.status !== 'error') this.scheduleSave(0);
  }

  // ------------------------------------------------------------ viewer

  /** Follows a room read-only (projector laptop). */
  async view(rawCode: string): Promise<void> {
    const code = normaliseRoomCode(rawCode);
    if (!validRoomCode(code)) throw new CloudError('invalid', 'Invalid room code');
    this.stop(false);
    this.set({ role: 'viewer', code, status: 'connecting', error: null, serverRevision: 0 });
    this.startWatching(code, false);
    await this.pull(false);
  }

  // ------------------------------------------------------------ shared

  private startWatching(code: string, isHost: boolean) {
    this.unsubs.push(
      this.deps.transport.subscribe(
        code,
        (snap) => {
          if (snap.revision <= this.state.serverRevision) return; // our own save echoing back, or old news
          if (isHost && this.saving) return; // the in-flight save will resolve via conflict handling
          if (snap.data !== undefined) {
            this.deps.applyRemote(snap.data);
            this.markSynced(snap.revision);
          } else void this.pull(isHost);
        },
        (live) => this.set({ pushConnected: live }),
      ),
    );
    // Polling fallback in case the realtime socket is blocked or drops.
    this.pollTimer = setInterval(() => {
      if (isHost && (this.saving || this.dirty)) return;
      void this.pull(isHost);
    }, this.deps.pollMs);
  }

  /** Downloads the room. `force` applies it even while a host save is in flight (conflict recovery). */
  private async pull(isHost: boolean, force = false) {
    const code = this.state.code;
    if (!code || this.fetching) return;
    this.fetching = true;
    try {
      // Polls first ask only for the revision number; the full event is downloaded only when it changed.
      if (!force && this.state.serverRevision > 0 && this.deps.transport.fetchRevision) {
        const rev = await this.deps.transport.fetchRevision(code);
        if (rev !== null && rev <= this.state.serverRevision) {
          this.markSynced(rev);
          return;
        }
      }
      const snap = await this.deps.transport.fetchRoom(code);
      if (!snap) {
        if (!isHost) this.set({ status: 'error', error: `Room ${code} was not found. Check the code on the entry laptop.` });
        return;
      }
      if (snap.revision > this.state.serverRevision) {
        if (isHost && !force && (this.saving || this.dirty)) return;
        this.deps.applyRemote(snap.data);
      }
      this.markSynced(snap.revision);
    } catch {
      this.set({ status: 'offline', error: 'Connection lost — retrying…' });
    } finally {
      this.fetching = false;
    }
  }

  private markSynced(revision: number) {
    if (this.state.role === 'host' && !this.dirty && !this.saving) this.remember({ rev: Math.max(revision, this.state.serverRevision), dirty: false });
    else if (this.state.role === 'host') this.remember({ rev: Math.max(revision, this.state.serverRevision) });
    this.set({
      serverRevision: Math.max(revision, this.state.serverRevision),
      status: 'live',
      error: null,
      lastSyncedAt: Date.now(),
    });
  }

  /** Disconnects this window. `forget` also removes the saved host code/PIN. */
  stop(forget = true) {
    for (const u of this.unsubs.splice(0)) u();
    for (const t of [this.saveTimer, this.retryTimer]) if (t) clearTimeout(t);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.saveTimer = this.retryTimer = this.pollTimer = null;
    this.saving = this.dirty = false;
    if (forget) {
      this.deps.storage?.removeItem(HOST_KEY);
      this.set({ role: 'off', code: null, status: 'idle', error: null, pendingChoice: null, serverRevision: 0, pushConnected: false });
    }
  }
}
