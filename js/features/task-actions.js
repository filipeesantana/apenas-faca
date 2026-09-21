/** Ações de tarefa com feedback visual, evento e "Desfazer". */
import { state, undo } from '../core/store.js';
import { completeTask, dropTask, startTask, pauseTask, reopenTask, setDueDate, deleteTask } from '../domain/tasks.js';
import { addProgress } from '../domain/goals.js';
import { toast, toastError } from '../ui/toast.js';
import { formatDue } from '../utils/dates.js';
import { formatMinutes } from '../utils/numbers.js';
import { progressFeedback } from './progress-log.js';

const busy = new Set();

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
    if (follow) toast(`Concluída: “${t.title}”. Registrar na meta?`, { action: follow, duration: 8000 });
    else withUndo(`Concluída: “${t?.title}”.`, token);
  } catch (err) { toastError(err); } finally { busy.delete(id); }
}

export async function dropWithFeedback(id) {
  try { withUndo('Tarefa cancelada. Remover o que perdeu sentido também é organizar.', await dropTask(id)); } catch (err) { toastError(err); }
}

export async function startWithFeedback(id) {
  try { if (await startTask(id)) toast('Marcada como em andamento.'); } catch (err) { toastError(err); }
}

export async function pauseWithFeedback(id) {
  try { await pauseTask(id); } catch (err) { toastError(err); }
}

export async function reopenWithFeedback(id) {
  try { withUndo('Tarefa reaberta.', await reopenTask(id)); } catch (err) { toastError(err); }
}

export async function setDueWithFeedback(id, date) {
  try {
    const token = await setDueDate(id, date);
    if (token) withUndo(date ? `Novo prazo: ${formatDue(date)}.` : 'Prazo removido.', token);
  } catch (err) { toastError(err); }
}

export async function deleteWithFeedback(id) {
  try { withUndo('Tarefa excluída.', await deleteTask(id)); } catch (err) { toastError(err); }
}
