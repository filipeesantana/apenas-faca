/** Tarefas: regras e ações. Toda ação registra um evento. */
import { state, commit } from '../core/store.js';
import { makeEvent } from '../core/events.js';
import { uid } from '../utils/helpers.js';
import { today, addDays, diffDays, endOfWeek, nextMonday } from '../utils/dates.js';

export const TASK_STATUS = ['pending', 'doing', 'done', 'dropped'];

export const isOpen = (t) => t.status === 'pending' || t.status === 'doing';
export const allTasks = () => [...state.tasks.values()];
export const openTasks = () => allTasks().filter(isOpen);
export const isOverdue = (t, ref = today()) => isOpen(t) && !!t.dueDate && t.dueDate < ref;
export const overdueTasks = () => {
  const ref = today();
  return openTasks().filter((t) => isOverdue(t, ref)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
};
export const stuckTasks = (min = 3) =>
  openTasks().filter((t) => (t.postponedCount || 0) >= min).sort((a, b) => b.postponedCount - a.postponedCount);
export const tasksForGoal = (goalId) => allTasks().filter((t) => t.goalId === goalId);

export const DUE_PRESETS = [
  { id: 'today', label: 'Hoje', date: () => today() },
  { id: 'tomorrow', label: 'Amanhã', date: () => addDays(today(), 1) },
  { id: 'week', label: 'Esta semana', date: () => endOfWeek() },
  { id: 'nextweek', label: 'Próxima semana', date: () => nextMonday() },
];

export function newTask({ title, notes = '', areaId = null, goalId = null, importance = 'normal', dueDate = null, source = 'direct' }) {
  const now = Date.now();
  return {
    id: uid(),
    title: String(title).trim().slice(0, 300),
    notes,
    areaId,
    goalId,
    importance,
    status: 'pending',
    dueDate,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    droppedAt: null,
    postponedCount: 0,
    source,
  };
}

export async function createTask(fields) {
  const t = newTask(fields);
  if (!t.title) return null;
  await commit({ put: { tasks: [t] }, events: [makeEvent('task.created', t, { dueDate: t.dueDate, source: t.source })] });
  return t;
}

function patchTask(id, patch, events) {
  const t = state.tasks.get(id);
  if (!t) return Promise.resolve(null);
  const next = { ...t, ...patch, updatedAt: Date.now() };
  return commit({ put: { tasks: [next] }, events: events.map(([type, meta]) => makeEvent(type, next, meta)) });
}

export function completeTask(id) {
  const t = state.tasks.get(id);
  if (!t || t.status === 'done') return Promise.resolve(null);
  return patchTask(id, { status: 'done', completedAt: Date.now() }, [[
    'task.completed',
    { wasOverdue: isOverdue(t), postponedCount: t.postponedCount || 0, dueDate: t.dueDate, importance: t.importance },
  ]]);
}

export const startTask = (id) => patchTask(id, { status: 'doing', startedAt: Date.now() }, [['task.started', {}]]);
export const pauseTask = (id) => patchTask(id, { status: 'pending' }, [['task.paused', {}]]);
export const reopenTask = (id) => patchTask(id, { status: 'pending', completedAt: null, droppedAt: null }, [['task.reopened', {}]]);
export const dropTask = (id) => patchTask(id, { status: 'dropped', droppedAt: Date.now() }, [['task.dropped', {}]]);

export function deleteTask(id) {
  const t = state.tasks.get(id);
  if (!t) return Promise.resolve(null);
  return commit({ del: { tasks: [id] }, events: [makeEvent('task.deleted', t, { title: t.title, status: t.status })] });
}

/**
 * Mudar o prazo. Só conta como "adiamento" quando o prazo já tinha chegado
 * (atrasada, hoje ou amanhã) e foi empurrado para frente ou removido.
 * Ajustar um plano distante não é adiar.
 */
export function setDueDate(id, due) {
  const t = state.tasks.get(id);
  if (!t) return Promise.resolve(null);
  const from = t.dueDate || null;
  const to = due || null;
  if (from === to) return Promise.resolve(null);
  const arrived = !!from && diffDays(today(), from) <= 1;
  const pushed = to === null || (from && to > from);
  const isPostpone = isOpen(t) && arrived && pushed;
  return patchTask(
    id,
    { dueDate: to, postponedCount: (t.postponedCount || 0) + (isPostpone ? 1 : 0) },
    [[isPostpone ? 'task.postponed' : 'task.rescheduled', { from, to }]],
  );
}

export function updateTask(id, patch) {
  const t = state.tasks.get(id);
  if (!t) return Promise.resolve(null);
  if ('title' in patch) {
    patch.title = String(patch.title).trim().slice(0, 300);
    if (!patch.title) delete patch.title;
  }
  const fields = Object.keys(patch).filter((k) => JSON.stringify(t[k] ?? null) !== JSON.stringify(patch[k] ?? null));
  if (!fields.length) return Promise.resolve(null);
  const clean = Object.fromEntries(fields.map((k) => [k, patch[k]]));
  return patchTask(id, clean, [['task.edited', { fields }]]);
}

/** Agrupa tarefas abertas por proximidade do prazo. */
export function groupOpenTasks(tasks) {
  const ref = today();
  const groups = { doing: [], overdue: [], today: [], soon: [], later: [], none: [] };
  for (const t of tasks) {
    if (t.status === 'doing') groups.doing.push(t);
    else if (!t.dueDate) groups.none.push(t);
    else if (t.dueDate < ref) groups.overdue.push(t);
    else if (t.dueDate === ref) groups.today.push(t);
    else if (diffDays(ref, t.dueDate) <= 7) groups.soon.push(t);
    else groups.later.push(t);
  }
  return groups;
}
