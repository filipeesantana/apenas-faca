/**
 * Motor de prioridade: determinístico e explicável.
 * O score existe só internamente — o usuário vê apenas o motivo em linguagem humana.
 * Cada motivo é escrito para completar a frase "Ela ...".
 */
import { state } from '../core/store.js';
import { lastActivityByArea } from '../core/events.js';
import { today, diffDays, dayKey, DAY } from '../utils/dates.js';
import { timesText } from '../utils/numbers.js';
import { openTasks } from './tasks.js';
import { getArea } from './areas.js';

function context() {
  const last = lastActivityByArea();
  const neglected = new Set();
  const now = Date.now();
  for (const [areaId, ts] of last) if (now - ts > 14 * DAY) neglected.add(areaId);
  return { today: today(), neglected };
}

export function scoreTask(t, ctx = context()) {
  let score = 0;
  const reasons = [];
  const add = (points, weight, text) => { score += points; if (text) reasons.push({ weight, text }); };

  if (t.dueDate) {
    const d = diffDays(ctx.today, t.dueDate);
    if (d < 0) add(50 + Math.min(-d, 14) * 2, 60, d === -1 ? 'era para ontem' : `está atrasada há ${-d} dias`);
    else if (d === 0) add(40, 50, 'vence hoje');
    else if (d === 1) add(26, 35, 'vence amanhã');
    else if (d <= 3) add(16, 20, `vence em ${d} dias`);
    else if (d <= 7) add(8, 10, 'vence nesta semana');
  }
  if (t.importance === 'high') add(20, 30, 'foi marcada como importante');
  if (t.status === 'doing') add(14, 28, 'já está em andamento');
  if ((t.postponedCount || 0) >= 2) add(Math.min(t.postponedCount, 5) * 4, 25 + t.postponedCount, `já foi adiada ${timesText(t.postponedCount)}`);
  const goal = t.goalId ? state.goals.get(t.goalId) : null;
  if (goal?.status === 'active') add(6, 15, `faz parte da meta “${goal.title}”`);
  const age = diffDays(dayKey(t.createdAt), ctx.today);
  if (age >= 14) add(Math.min(age / 7, 6), 8, `está na lista há ${age} dias`);
  if (t.areaId && ctx.neglected.has(t.areaId)) add(4, 9, `é de ${getArea(t.areaId)?.name || 'uma área'}, que está parada há um tempo`);

  return { task: t, score, reasons: reasons.sort((a, b) => b.weight - a.weight).map((r) => r.text) };
}

export function rankTasks(tasks = openTasks()) {
  const ctx = context();
  return tasks
    .map((t) => scoreTask(t, ctx))
    .sort((a, b) =>
      b.score - a.score
      || (a.task.dueDate || '9999').localeCompare(b.task.dueDate || '9999')
      || a.task.createdAt - b.task.createdAt);
}

/** "Ela vence hoje e já foi adiada duas vezes." */
export function explain(ranked) {
  const [r0, r1] = ranked.reasons;
  if (!r0) return 'Nada está urgente. Esta é uma boa próxima tarefa.';
  return `Ela ${r0}${r1 ? ` e ${r1}` : ''}.`;
}

/** Quantas coisas realmente precisam de atenção hoje (atrasadas ou vencendo hoje). */
export function attentionToday() {
  const ref = today();
  return openTasks().filter((t) => t.dueDate && t.dueDate <= ref);
}
