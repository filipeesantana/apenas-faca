/**
 * Camada fina sobre o IndexedDB.
 * Migrações ficam em `upgrade()`, por versão. Nunca apague um bloco antigo; adicione o próximo.
 * (O nome interno do banco continua "apenas-faca" para preservar os dados da primeira versão.)
 */

const DB_NAME = 'apenas-faca';
export const DB_VERSION = 3;
export const STORES = ['tasks', 'goals', 'areas', 'inbox', 'events', 'settings', 'money', 'recurring', 'plans', 'scenarios'];

let dbPromise = null;

function eachRecord(store, fn) {
  store.openCursor().onsuccess = (e) => {
    const cursor = e.target.result;
    if (!cursor) return;
    const next = fn(cursor.value);
    if (next) cursor.update(next);
    cursor.continue();
  };
}

function upgrade(db, oldVersion, tx) {
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
  if (oldVersion < 2 && oldVersion >= 1) {
    // v2: tarefas ganham duração estimada e marcação de "próximo passo";
    // metas ganham o tipo "tempo" (nenhum campo obrigatório novo).
    eachRecord(tx.objectStore('tasks'), (t) => ({ estimateMin: null, nextStep: false, ...t, importance: t.importance || 'normal' }));
    eachRecord(tx.objectStore('goals'), (g) => ({ unit: '', ...g }));
    tx.objectStore('settings').put({ key: 'migratedFromV1At', value: Date.now() });
  }
  if (oldVersion < 3) {
    // v3: camada financeira opcional. Nada muda para quem não a usa —
    // os depósitos ficam vazios e nenhum dado existente é tocado.
    const money = db.createObjectStore('money', { keyPath: 'id' });
    money.createIndex('date', 'date');
    db.createObjectStore('recurring', { keyPath: 'id' });
    db.createObjectStore('plans', { keyPath: 'id' }).createIndex('goalId', 'goalId');
    db.createObjectStore('scenarios', { keyPath: 'id' }).createIndex('goalId', 'goalId');
  }
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('Este navegador não oferece armazenamento local (IndexedDB).'));
      return;
    }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (err) { reject(err); return; }
    req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion, req.transaction);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Não foi possível abrir o banco local.'));
    req.onblocked = () => reject(new Error('O Norte está aberto em outra aba com uma versão antiga. Feche as outras abas e recarregue.'));
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

/** Escrita atômica: tudo ou nada. ops = { clear: [store], del: { store: [keys] }, put: { store: [records] } } */
export async function write(ops) {
  const names = new Set([...(ops.clear || []), ...Object.keys(ops.del || {}), ...Object.keys(ops.put || {})]);
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
