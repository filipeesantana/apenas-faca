/**
 * Estado em memória + gravação no IndexedDB.
 *
 * Toda mudança passa por `commit()`, que:
 *  1. grava entidades e eventos numa única transação;
 *  2. atualiza a memória só depois de gravar com sucesso;
 *  3. devolve um "token de desfazer" genérico (usado pelos botões "Desfazer").
 */
import * as db from './db.js';

const MAP_STORES = ['tasks', 'goals', 'areas', 'inbox', 'money', 'recurring', 'plans', 'scenarios'];
const listeners = new Set();

export const state = {
  tasks: new Map(),
  goals: new Map(),
  areas: new Map(),
  inbox: new Map(),
  money: new Map(),
  recurring: new Map(),
  plans: new Map(),
  scenarios: new Map(),
  events: [],
  settings: {},
};

export async function load() {
  const data = await db.readAll();
  for (const name of MAP_STORES) state[name] = new Map((data[name] || []).map((r) => [r.id, r]));
  state.events = (data.events || []).sort((a, b) => a.createdAt - b.createdAt);
  state.settings = Object.fromEntries((data.settings || []).map((r) => [r.key, r.value]));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(detail) {
  for (const fn of [...listeners]) {
    try { fn(detail); } catch (err) { console.error(err); }
  }
}

function assertStore(name) {
  if (!MAP_STORES.includes(name)) throw new Error(`Store desconhecido: ${name}`);
}

/**
 * change = {
 *   put: { tasks: [...], goals: [...] },   // cria ou substitui
 *   del: { tasks: [ids] },                 // remove
 *   events: [...],                         // novos eventos
 *   dropEvents: [ids],                     // remove eventos (usado ao desfazer)
 *   restoreEvents: [...],                  // recoloca eventos removidos
 *   settings: { chave: valor },
 * }
 */
export async function commit(change = {}) {
  const ops = { put: {}, del: {} };
  const undoToken = { put: {}, del: {}, dropEvents: [], restoreEvents: [] };

  for (const [name, recs] of Object.entries(change.put || {})) {
    assertStore(name);
    if (!recs?.length) continue;
    ops.put[name] = recs;
    for (const r of recs) {
      const prev = state[name].get(r.id);
      if (prev) (undoToken.put[name] ||= []).push(prev);
      else (undoToken.del[name] ||= []).push(r.id);
    }
  }
  for (const [name, ids] of Object.entries(change.del || {})) {
    assertStore(name);
    if (!ids?.length) continue;
    ops.del[name] = ids;
    for (const id of ids) {
      const prev = state[name].get(id);
      if (prev) (undoToken.put[name] ||= []).push(prev);
    }
  }
  const addedEvents = [...(change.events || []), ...(change.restoreEvents || [])];
  if (addedEvents.length) {
    ops.put.events = addedEvents;
    undoToken.dropEvents = (change.events || []).map((e) => e.id);
  }
  if (change.dropEvents?.length) {
    ops.del.events = change.dropEvents;
    const set = new Set(change.dropEvents);
    undoToken.restoreEvents = state.events.filter((e) => set.has(e.id));
  }
  if (change.settings) {
    ops.put.settings = Object.entries(change.settings).map(([key, value]) => ({ key, value }));
  }

  await db.write(ops);

  for (const [name, recs] of Object.entries(ops.put)) {
    if (MAP_STORES.includes(name)) for (const r of recs) state[name].set(r.id, r);
  }
  for (const [name, ids] of Object.entries(ops.del)) {
    if (MAP_STORES.includes(name)) for (const id of ids) state[name].delete(id);
  }
  if (change.dropEvents?.length) {
    const set = new Set(change.dropEvents);
    state.events = state.events.filter((e) => !set.has(e.id));
  }
  if (addedEvents.length) {
    state.events.push(...addedEvents);
    state.events.sort((a, b) => a.createdAt - b.createdAt);
  }
  if (change.settings) Object.assign(state.settings, change.settings);

  emit({ type: 'commit' });
  return undoToken;
}

/** Reverte exatamente o que um commit fez (entidades e eventos). */
export function undo(token) {
  if (!token) return Promise.resolve(null);
  return commit({
    put: token.put,
    del: token.del,
    dropEvents: token.dropEvents,
    restoreEvents: token.restoreEvents,
  });
}

export const setSettings = (settings) => commit({ settings });

/** Substitui todos os dados (importação, dados de exemplo, limpeza). */
export async function replaceAll(data) {
  await db.write({
    clear: db.STORES,
    put: {
      tasks: data.tasks || [],
      goals: data.goals || [],
      areas: data.areas || [],
      inbox: data.inbox || [],
      money: data.money || [],
      recurring: data.recurring || [],
      plans: data.plans || [],
      scenarios: data.scenarios || [],
      events: data.events || [],
      settings: Object.entries(data.settings || {}).map(([key, value]) => ({ key, value })),
    },
  });
  await load();
  emit({ type: 'reset' });
}
