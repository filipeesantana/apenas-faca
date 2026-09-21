/** Caixa de entrada: capturar sem classificar, decidir depois. */
import { state, commit } from '../core/store.js';
import { makeEvent } from '../core/events.js';
import { uid } from '../utils/helpers.js';
import { newTask } from './tasks.js';

export const openInboxItems = () =>
  [...state.inbox.values()].filter((i) => i.status === 'open').sort((a, b) => a.createdAt - b.createdAt);

export const noteItems = () =>
  [...state.inbox.values()].filter((i) => i.status === 'note').sort((a, b) => b.updatedAt - a.updatedAt);

/** Uma coisa por linha; remove marcadores de lista colados de outros apps. */
export function splitCapture(text) {
  return String(text)
    .split(/\r?\n/)
    .map((s) => s.replace(/^\s*(?:[-*•–]|\d+[.)]|\[\s?\])\s+/, '').trim())
    .filter(Boolean)
    .map((s) => s.slice(0, 500));
}

export async function capture(text) {
  const lines = splitCapture(text);
  if (!lines.length) return [];
  const now = Date.now();
  const items = lines.map((line, i) => ({ id: uid(), text: line, status: 'open', createdAt: now + i, updatedAt: now + i }));
  await commit({ put: { inbox: items }, events: items.map((it) => makeEvent('inbox.captured', it, {}, it.createdAt)) });
  return items;
}

export async function processAsTask(itemId, { title, dueDate = null, areaId = null } = {}) {
  const item = state.inbox.get(itemId);
  if (!item) return null;
  const t = newTask({ title: title?.trim() || item.text, dueDate, areaId, source: 'inbox' });
  const undo = await commit({
    put: { tasks: [t] },
    del: { inbox: [itemId] },
    events: [
      makeEvent('task.created', t, { dueDate, source: 'inbox' }),
      makeEvent('inbox.processed', item, { as: 'task', targetId: t.id }),
    ],
  });
  return { task: t, undo };
}

/** Pedaço de commit usado quando um item vira meta (a meta é criada em goals.js). */
export function inboxToGoalChange(itemId, goalId) {
  const item = state.inbox.get(itemId);
  if (!item) return {};
  return { del: { inbox: [itemId] }, events: [makeEvent('inbox.processed', item, { as: 'goal', targetId: goalId })] };
}

export function keepAsNote(id, text) {
  const item = state.inbox.get(id);
  if (!item) return Promise.resolve(null);
  const next = { ...item, text: text?.trim() || item.text, status: 'note', updatedAt: Date.now() };
  return commit({ put: { inbox: [next] }, events: [makeEvent('inbox.processed', next, { as: 'note' })] });
}

export function discardItem(id) {
  const item = state.inbox.get(id);
  if (!item) return Promise.resolve(null);
  return commit({ del: { inbox: [id] }, events: [makeEvent('inbox.discarded', item, { wasNote: item.status === 'note' })] });
}

export function reopenNote(id) {
  const item = state.inbox.get(id);
  if (!item) return Promise.resolve(null);
  return commit({ put: { inbox: [{ ...item, status: 'open', updatedAt: Date.now() }] } });
}

export function renameInboxItem(id, text) {
  const item = state.inbox.get(id);
  const clean = text?.trim();
  if (!item || !clean || clean === item.text) return Promise.resolve(null);
  return commit({ put: { inbox: [{ ...item, text: clean.slice(0, 500), updatedAt: Date.now() }] } });
}
