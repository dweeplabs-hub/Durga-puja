import { describe, expect, it } from 'vitest';
import { CloudError, CloudSync, createCloudStore, type CloudTransport, type RoomSnapshot } from './cloud';
import { addParticipant, openBidding, setBid } from './operations';
import { defaultSettings, emptyCompetition } from './defaults';
import type { CompetitionData } from '../types';

/** In-memory stand-in for the Supabase room table + realtime. */
class FakeServer {
  rooms = new Map<string, { pin: string; revision: number; data: unknown }>();
  listeners = new Map<string, Set<(s: RoomSnapshot) => void>>();
  online = true;
  transport(): CloudTransport {
    const check = () => {
      if (!this.online) throw new CloudError('network', 'offline');
    };
    return {
      openRoom: async (code, pin, data) => {
        check();
        const r = this.rooms.get(code);
        if (!r) {
          this.rooms.set(code, { pin, revision: 1, data: structuredClone(data) });
          return { revision: 1, data, created: true };
        }
        if (r.pin !== pin) throw new CloudError('pin', 'Wrong PIN');
        return { revision: r.revision, data: structuredClone(r.data), created: false };
      },
      save: async (code, pin, data, base) => {
        check();
        const r = this.rooms.get(code)!;
        if (r.pin !== pin) throw new CloudError('pin', 'Wrong PIN');
        if (r.revision !== base) throw new CloudError('conflict', 'stale');
        r.revision += 1;
        r.data = structuredClone(data);
        for (const l of this.listeners.get(code) ?? []) l({ revision: r.revision, data: structuredClone(r.data) });
        return r.revision;
      },
      fetchRoom: async (code) => {
        check();
        const r = this.rooms.get(code);
        return r ? { revision: r.revision, data: structuredClone(r.data) } : null;
      },
      subscribe: (code, onChange, onLive) => {
        const set = this.listeners.get(code) ?? new Set();
        set.add(onChange);
        this.listeners.set(code, set);
        onLive(true);
        return () => set.delete(onChange);
      },
    };
  }
}

/** One "laptop": its own local data and sync controller. */
function laptop(server: FakeServer, initial: CompetitionData) {
  let data = initial;
  const edits = new Set<() => void>();
  const notes: string[] = [];
  const store = createCloudStore();
  const sync = new CloudSync({
    store,
    transport: server.transport(),
    getData: () => data,
    onLocalEdit: (cb) => (edits.add(cb), () => edits.delete(cb)),
    applyRemote: (raw) => (data = structuredClone(raw) as CompetitionData),
    notify: (_k, m) => notes.push(m),
    storage: null,
    debounceMs: 5,
    pollMs: 60_000,
  });
  return {
    sync,
    store,
    notes,
    get data() {
      return data;
    },
    edit(op: (d: CompetitionData) => CompetitionData) {
      data = op(data);
      edits.forEach((cb) => cb());
    },
  };
}

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const names = (d: CompetitionData) => d.participants.map((p) => p.name);
const withPeople = (...n: string[]) => n.reduce((d, x) => addParticipant(d, x), emptyCompetition(defaultSettings()));


describe('live multi-laptop sync', () => {
  it('entry laptop creates a room and every edit reaches the projector laptop', async () => {
    const server = new FakeServer();
    const entry = laptop(server, withPeople('Ananya', 'Priya'));
    await entry.sync.host('mojar-2026', '4321');
    expect(server.rooms.get('MOJAR-2026')?.revision).toBe(1);

    entry.edit((d) => addParticipant(d, 'Riya'));
    entry.edit((d) => openBidding(d, 1));
    entry.edit((d) => setBid(d, 1, d.participants[0].id, 25));
    await tick();
    const saved = server.rooms.get('MOJAR-2026')!.data as CompetitionData;
    expect(names(saved)).toEqual(['Ananya', 'Priya', 'Riya']);
    expect(saved.events[0].bids[saved.participants[0].id]).toBe(25);
    // Bursts are coalesced into few saves, not one per click.
    expect(server.rooms.get('MOJAR-2026')!.revision).toBeLessThanOrEqual(3);

    entry.sync.stop(false);
    const projector = laptop(server, emptyCompetition());
    await projector.sync.view('MOJAR-2026');
    expect(names(projector.data)).toEqual(['Ananya', 'Priya', 'Riya']);
  });

  it('a viewer receives pushed updates live', async () => {
    const server = new FakeServer();
    const entry = laptop(server, withPeople('A'));
    const viewerData: CompetitionData[] = [];
    await entry.sync.host('ROOM-1', '1111');
    // Viewer on a separate controller sharing the same server (separate laptop).
    const viewer = new CloudSync({
      store: createCloudStore(),
      transport: server.transport(),
      getData: () => emptyCompetition(),
      onLocalEdit: () => () => undefined,
      applyRemote: (raw) => viewerData.push(raw as CompetitionData),
      storage: null,
      pollMs: 60_000,
    });
    await viewer.view('ROOM-1');
    entry.edit((d) => addParticipant(d, 'B'));
    await tick();
    expect(names(viewerData.at(-1)!)).toEqual(['A', 'B']);
  });

  it('rejects a wrong PIN and never writes', async () => {
    const server = new FakeServer();
    const a = laptop(server, withPeople('A'));
    await a.sync.host('ROOM-2', '1234');
    a.sync.stop(false);
    const b = laptop(server, withPeople('Intruder'));
    await expect(b.sync.host('ROOM-2', '0000')).rejects.toMatchObject({ kind: 'pin' });
    expect(names(server.rooms.get('ROOM-2')!.data as CompetitionData)).toEqual(['A']);
  });

  it('keeps edits while offline and uploads them when the connection returns', async () => {
    const server = new FakeServer();
    const entry = laptop(server, withPeople('A'));
    await entry.sync.host('ROOM-3', '1234');
    server.online = false;
    entry.edit((d) => addParticipant(d, 'B'));
    await tick();
    expect(entry.store.getState().status).toBe('offline');
    expect(names(entry.data)).toEqual(['A', 'B']); // nothing lost locally
    server.online = true;
    await entry.sync.flush();
    expect(names(server.rooms.get('ROOM-3')!.data as CompetitionData)).toEqual(['A', 'B']);
    expect(entry.store.getState().status).toBe('live');
  });

  it('a second entry laptop joining a room with data is asked which version to keep', async () => {
    const server = new FakeServer();
    const a = laptop(server, withPeople('A', 'B'));
    await a.sync.host('ROOM-4', '1234');
    a.sync.stop(false);
    const b = laptop(server, withPeople('Other'));
    await b.sync.host('ROOM-4', '1234');
    expect(b.store.getState().pendingChoice).not.toBeNull();
    await b.sync.resolveChoice(true);
    expect(names(b.data)).toEqual(['A', 'B']);
  });

  it('an empty laptop joining as entry simply loads the online event', async () => {
    const server = new FakeServer();
    const a = laptop(server, withPeople('A', 'B'));
    await a.sync.host('ROOM-5', '1234');
    a.sync.stop(false);
    const b = laptop(server, emptyCompetition());
    await b.sync.host('ROOM-5', '1234');
    expect(b.store.getState().pendingChoice).toBeNull();
    expect(names(b.data)).toEqual(['A', 'B']);
  });

  it('on a simultaneous edit from another laptop, adopts the online version and warns', async () => {
    const server = new FakeServer();
    const a = laptop(server, withPeople('A'));
    await a.sync.host('ROOM-6', '1234');
    // Someone else writes directly (another entry laptop) without A having seen it.
    const r = server.rooms.get('ROOM-6')!;
    r.revision = 5;
    r.data = withPeople('A', 'FromOtherLaptop');
    server.listeners.clear(); // A missed the push
    a.edit((d) => addParticipant(d, 'MyEdit'));
    await tick();
    expect(names(a.data)).toEqual(['A', 'FromOtherLaptop']);
    expect(a.notes.some((n) => n.includes('Another laptop'))).toBe(true);
  });
});


describe('entry laptop reload', () => {
  const memoryStorage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };

  it('reconnects silently after a reload and uploads edits that had not been sent', async () => {
    const server = new FakeServer();
    const storage = memoryStorage();
    let data = withPeople('A');
    const make = () =>
      new CloudSync({
        store: createCloudStore(),
        transport: server.transport(),
        getData: () => data,
        onLocalEdit: () => () => undefined,
        applyRemote: (raw) => (data = raw as CompetitionData),
        storage,
        debounceMs: 5,
        pollMs: 60_000,
      });
    const first = make();
    await first.host('ROOM-R', '1234');
    // Edit while the connection is down, then the page reloads before it uploads.
    server.online = false;
    data = addParticipant(data, 'B');
    (first as unknown as { scheduleSave: (d: number) => void }).scheduleSave(0);
    await tick();
    first.stop(false);
    server.online = true;

    const second = make();
    expect(await second.resumeHost()).toBe(true);
    expect(second.state.pendingChoice).toBeNull();
    await tick();
    expect(names(server.rooms.get('ROOM-R')!.data as CompetitionData)).toEqual(['A', 'B']);
  });
});
