/**
 * Camada fina sobre o IndexedDB.
 * Cada tipo de dado tem seu próprio object store. Migrações ficam em `upgrade()`,
 * organizadas por versão — nunca apague um bloco antigo, apenas adicione o próximo.
 */

const DB_NAME = 'apenas-faca';
export const DB_VERSION = 1;
export const STORES = ['tasks', 'goals', 'areas', 'inbox', 'events', 'settings'];

let dbPromise = null;

function upgrade(db, oldVersion) {
  if (oldVersion < 1) {
    db.createObjectStore('tasks', { keyPath: 'id' }).createIndex('status', 'status');
    db.createObjectStore('goals', { keyPath: 'id' });
    db.createObjectStore('areas', { keyPath: 'id' });
    db.createObjectStore('inbox', { keyPath: 'id' });
    const events = db.createObjectStore('events', { keyPath: 'id' });
    events.createIndex('createdAt', 'createdAt');
    events.createIndex('entityId', 'entityId');
    db.createObjectStore('settings', { keyPath: 'key' });
  }
  // if (oldVersion < 2) { ...próxima migração... }
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('Este navegador não oferece armazenamento local (IndexedDB).'));
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion);
    req.onsuccess = () => {
      const db = req.result;
      // Outra aba abriu uma versão mais nova: fecha e recarrega para não corromper dados.
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Não foi possível abrir o banco local.'));
    req.onblocked = () => reject(new Error('O Apenas, Faça. está aberto em outra aba com uma versão antiga. Feche as outras abas e recarregue.'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

export async function readAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readonly');
    const out = {};
    for (const name of STORES) {
      const req = tx.objectStore(name).getAll();
      req.onsuccess = () => { out[name] = req.result; };
    }
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Leitura interrompida.'));
  });
}

/**
 * Escrita atômica: tudo ou nada.
 * ops = { clear: [store], del: { store: [keys] }, put: { store: [records] } }
 */
export async function write(ops) {
  const names = new Set([
    ...(ops.clear || []),
    ...Object.keys(ops.del || {}),
    ...Object.keys(ops.put || {}),
  ]);
  if (!names.size) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...names], 'readwrite');
    for (const name of ops.clear || []) tx.objectStore(name).clear();
    for (const [name, keys] of Object.entries(ops.del || {})) for (const k of keys) tx.objectStore(name).delete(k);
    for (const [name, recs] of Object.entries(ops.put || {})) for (const r of recs) tx.objectStore(name).put(r);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Gravação interrompida.'));
  });
}
