/** Ações de tarefa com feedback visual, evento e "Desfazer". */
import { state, undo } from '../core/store.js';
import { completeTask, dropTask, startTask, pauseTask, reopenTask, setDueDate, deleteTask } from '../domain/tasks.js';
import { addProgress } from '../domain/goals.js';
import { toast, toastError } from '../ui/toast.js';
import { formatDue } from '../utils/dates.js';
import { formatMinutes } from '../utils/numbers.js';
import { progressFeedback } from './progress-log.js';

const busy = new Set();

/** Impede que cliques repetidos disparem a mesma ação duas vezes (eventos duplicados). */
async function guard(key, fn) {
  if (busy.has(key)) return;
  busy.add(key);
  try { await fn(); } catch (err) { toastError(err, { retry: () => guard(key, fn) }); } finally { busy.delete(key); }
}

function withUndo(message, token) {
  if (token) toast(message, { action: { label: 'Desfazer', fn: () => undo(token) } });
}

/**
 * Ao concluir uma tarefa ligada a uma meta de tempo ou quantidade,
 * oferece registrar o avanço na meta com um toque (tarefa → progresso).
 */
function goalFollowUp(t) {
  const g = t.goalId ? state.goals.get(t.goalId) : null;
  if (!g || g.status !== 'active') return null;
  if (g.type === 'time' && t.estimateMin) {
    return { label: `Registrar ${formatMinutes(t.estimateMin)}`, fn: async () => progressFeedback(g, await addProgress(g.id, t.estimateMin, { taskId: t.id })) };
  }
  if (g.type === 'count') {
    return { label: `+1 em “${g.title}”`, fn: async () => progressFeedback(g, await addProgress(g.id, 1, { taskId: t.id })) };
  }
  return null;
}

export async function completeWithFeedback(id, el) {
  if (busy.has(id)) return;
  busy.add(id);
  const t = state.tasks.get(id);
  try {
    if (el && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-completing');
      await new Promise((r) => setTimeout(r, 320));
    }
    const token = await completeTask(id);
    if (!token) return;
    const follow = goalFollowUp(t);
    if (follow) toast(`Tarefa concluída. Registrar na meta “${state.goals.get(t.goalId).title}”?`, { actions: [follow, { label: 'Desfazer', fn: () => undo(token) }], duration: 8000 });
    else withUndo('Tarefa concluída.', token);
  } catch (err) {
    el?.classList.remove('is-completing');
    toastError(err, { retry: () => completeWithFeedback(id) });
  } finally { busy.delete(id); }
}

export const dropWithFeedback = (id) => guard(`drop:${id}`, async () => {
  withUndo('Tarefa cancelada. Fica registrada no histórico.', await dropTask(id));
});

/** Começar não gera aviso: a própria linha passa a mostrar "em andamento". */
export const startWithFeedback = (id) => guard(`start:${id}`, () => startTask(id));
export const pauseWithFeedback = (id) => guard(`pause:${id}`, () => pauseTask(id));

export const reopenWithFeedback = (id) => guard(`reopen:${id}`, async () => {
  withUndo('Tarefa reaberta.', await reopenTask(id));
});

export const setDueWithFeedback = (id, date) => guard(`due:${id}`, async () => {
  const token = await setDueDate(id, date);
  if (token) withUndo(date ? `Prazo: ${formatDue(date)}.` : 'Prazo removido.', token);
});

export const deleteWithFeedback = (id) => guard(`del:${id}`, async () => {
  withUndo('Tarefa excluída.', await deleteTask(id));
});
