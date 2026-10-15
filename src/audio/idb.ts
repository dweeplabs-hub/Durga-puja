/**
 * Minimal IndexedDB store for uploaded audio files. localStorage (~5MB, strings
 * only) cannot hold MP3s, so blobs live here and survive refreshes and reloads.
 */

const DB_NAME = 'mojar-mohajuddho-audio';
const STORE = 'clips';
const VERSION = 1;

export interface StoredClip {
  /** Slot id ("MAIN_INTRO", "BGM", "CUSTOM-…"). */
  id: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  updatedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available in this browser'));
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the audio database'));
    req.onblocked = () => reject(new Error('The audio database is blocked by another tab'));
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error ?? new Error('Audio database error'));
        tx.onabort = () => reject(tx.error ?? new Error('Audio database transaction aborted (storage full?)'));
      }),
  );
}

export function putClip(id: string, file: Blob, name: string): Promise<StoredClip> {
  const clip: StoredClip = { id, blob: file, name, type: file.type || 'audio/mpeg', size: file.size, updatedAt: new Date().toISOString() };
  return run('readwrite', (s) => s.put(clip)).then(() => clip);
}

export function deleteClip(id: string): Promise<void> {
  return run('readwrite', (s) => s.delete(id)).then(() => undefined);
}

export function getAllClips(): Promise<StoredClip[]> {
  return run('readonly', (s) => s.getAll() as IDBRequest<StoredClip[]>);
}
