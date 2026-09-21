/** Ações de tarefa com feedback visual, evento e "Desfazer". */
import { undo } from '../core/store.js';
import { completeTask, dropTask, startTask, pauseTask, reopenTask, setDueDate, deleteTask } from '../domain/tasks.js';
import { state } from '../core/store.js';
import { toast, toastError } from '../ui/toast.js';
import { formatDue } from '../utils/dates.js';

const busy = new Set();

function withUndo(message, token) {
  if (!token) return;
  toast(message, { action: { label: 'Desfazer', fn: () => undo(token) } });
}

/** Conclui com uma pequena animação no elemento (se houver). */
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
    withUndo(`Concluída: “${t?.title}”.`, token);
  } catch (err) { toastError(err); } finally { busy.delete(id); }
}

export async function dropWithFeedback(id) {
  try {
    const token = await dropTask(id);
    withUndo('Remover uma tarefa que perdeu sentido também é organizar sua vida.', token);
  } catch (err) { toastError(err); }
}

export async function startWithFeedback(id) {
  try {
    const token = await startTask(id);
    if (token) toast('Em andamento. Um passo de cada vez.');
  } catch (err) { toastError(err); }
}

export async function pauseWithFeedback(id) {
  try { await pauseTask(id); } catch (err) { toastError(err); }
}

export async function reopenWithFeedback(id) {
  try {
    const token = await reopenTask(id);
    withUndo('Tarefa reaberta.', token);
  } catch (err) { toastError(err); }
}

export async function setDueWithFeedback(id, date) {
  try {
    const token = await setDueDate(id, date);
    if (!token) return;
    withUndo(date ? `Prazo: ${formatDue(date)}.` : 'Prazo removido.', token);
  } catch (err) { toastError(err); }
}

export async function deleteWithFeedback(id) {
  try {
    const token = await deleteTask(id);
    withUndo('Tarefa excluída.', token);
  } catch (err) { toastError(err); }
}
