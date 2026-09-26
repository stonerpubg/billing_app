// Persistent folder handle for quotation / invoice PDF exports.
//
// Uses the File System Access API (Chromium browsers on HTTPS) so the user
// can pick a real folder once, and we save every future PDF into a
// `quotations/` subfolder inside it — no more per-download Save-As dialog.
//
// The handle is stored in IndexedDB under the key `exportFolder`. On non-
// supporting browsers (Firefox, Safari) the setup is a no-op and the app
// falls back to the browser's default download flow.

const DB_NAME = 'mrl-app';
const STORE = 'settings';

export function isSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getExportFolder() {
  try {
    const handle = await idbGet('exportFolder');
    return handle || null;
  } catch (_e) {
    return null;
  }
}

// Prompts the user to pick a folder and stores its handle.
export async function pickExportFolder() {
  if (!isSupported()) {
    throw new Error("This browser doesn't support choosing a download folder. Use Chrome, Edge, or the desktop app.");
  }
  const handle = await window.showDirectoryPicker({ id: 'mrl-quotations', mode: 'readwrite' });
  await idbSet('exportFolder', handle);
  return handle;
}

export async function clearExportFolder() {
  await idbDelete('exportFolder');
}

// Re-request permission on the stored handle. Browsers drop the permission
// grant across sessions so we ask for read/write again on first use.
async function ensurePermission(handle) {
  if (!handle) return false;
  const opts = { mode: 'readwrite' };
  const status = await handle.queryPermission(opts);
  if (status === 'granted') return true;
  const request = await handle.requestPermission(opts);
  return request === 'granted';
}

// Writes a Blob into <folder>/quotations/<filename>. Returns true on success.
export async function saveBlobToExportFolder(blob, filename, subfolder = 'quotations') {
  const handle = await getExportFolder();
  if (!handle) return false;
  const ok = await ensurePermission(handle);
  if (!ok) return false;
  const sub = await handle.getDirectoryHandle(subfolder, { create: true });
  const file = await sub.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}
