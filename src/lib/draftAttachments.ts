/**
 * Guest order attachments (photos, voice note) kept in IndexedDB so they
 * survive the sign-in round trip (Google/Apple redirect, email confirmation).
 * localStorage cannot hold binary files; failures degrade to "re-attach".
 */
const DB = "task-draft-attachments";
const STORE = "files";
const KEY = "current";

type Stored = { photos: { name: string; type: string; blob: Blob }[]; voice: Blob | null; savedAt: number };

const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const saveDraftAttachments = async (photos: File[], voice: Blob | null) => {
  try {
    if (!photos.length && !voice) { await clearDraftAttachments(); return; }
    const value: Stored = {
      photos: photos.map((f) => ({ name: f.name, type: f.type, blob: f })),
      voice,
      savedAt: Date.now(),
    };
    await run("readwrite", (s) => s.put(value, KEY));
  } catch { /* storage unavailable: user re-attaches */ }
};

export const loadDraftAttachments = async (): Promise<{ photos: File[]; voice: Blob | null } | null> => {
  try {
    const v = (await run<Stored | undefined>("readonly", (s) => s.get(KEY) as IDBRequest<Stored | undefined>));
    if (!v || Date.now() - v.savedAt > 24 * 60 * 60 * 1000) return null;
    return {
      photos: v.photos.map((p) => new File([p.blob], p.name, { type: p.type })),
      voice: v.voice ?? null,
    };
  } catch {
    return null;
  }
};

export const clearDraftAttachments = async () => {
  try { await run("readwrite", (s) => s.delete(KEY)); } catch { /* ignore */ }
};
