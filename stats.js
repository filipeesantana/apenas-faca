/** Estatísticas derivadas do histórico de eventos (página Progresso e Análises). */
import { state } from '../core/store.js';
import { lastActivityByArea } from '../core/events.js';
import { DAY, today, addDays, dayKey, daysAgoTs, startOfDayTs, startOfWeek } from '../utils/dates.js';
import { openTasks, isOverdue } from './tasks.js';
import { listAreas } from './areas.js';

function inRange(e, from, to) { return e.createdAt >= from && e.createdAt < to; }

/** Tarefas distintas concluídas no intervalo (reabrir e concluir de novo conta uma vez). */
export function completedIds(from, to = Infinity) {
  const ids = new Set();
  for (const e of state.events) if (e.type === 'task.completed' && inRange(e, from, to)) ids.add(e.entityId);
  return ids;
}

export function countType(type, from, to = Infinity) {
  let n = 0;
  for (const e of state.events) if (e.type === type && inRange(e, from, to)) n++;
  return n;
}

export function periodSummary(days) {
  const from = daysAgoTs(days - 1);
  const prevFrom = daysAgoTs(days * 2 - 1);
  const goalsMoved = new Set();
  let moneyIn = 0;
  let moneyOut = 0;
  for (const e of state.events) {
    if (!inRange(e, from, Infinity)) continue;
    if (e.type === 'goal.progress' || e.type === 'goal.step') goalsMoved.add(e.entityId);
    if (e.type === 'goal.progress' && e.metadata?.kind !== 'correction') {
      const isMoney = (e.metadata.goalType || state.goals.get(e.entityId)?.type) === 'money';
      if (isMoney) {
        if (e.metadata.delta > 0) moneyIn += e.metadata.delta;
        else moneyOut += -e.metadata.delta;
      }
    }
  }
  return {
    completed: completedIds(from).size,
    completedPrev: completedIds(prevFrom, from).size,
    created: countType('task.created', from),
    dropped: countType('task.dropped', from),
    openNow: openTasks().length,
    overdueNow: openTasks().filter((t) => isOverdue(t)).length,
    goalsMoved: goalsMoved.size,
    moneyIn,
    moneyOut,
  };
}

/** Série diária de conclusões e criações. */
export function dailySeries(days) {
  const start = addDays(today(), -(days - 1));
  const buckets = new Map();
  for (let i = 0; i < days; i++) buckets.set(addDays(start, i), { date: addDays(start, i), completed: new Set(), created: 0, moves: 0 });
  const from = startOfDayTs(start);
  for (const e of state.events) {
    if (e.createdAt < from) continue;
    const b = buckets.get(dayKey(e.createdAt));
    if (!b) continue;
    if (e.type === 'task.completed') b.completed.add(e.entityId);
    else if (e.type === 'task.created') b.created++;
    else if (e.type === 'goal.progress' || e.type === 'goal.step') b.moves++;
  }
  return [...buckets.values()].map((b) => ({ ...b, completed: b.completed.size }));
}

/** Soma a série diária em semanas (para períodos longos). */
export function weeklyFromDaily(series) {
  const weeks = new Map();
  for (const d of series) {
    const k = startOfWeek(d.date);
    const w = weeks.get(k) || { date: k, completed: 0, created: 0, moves: 0 };
    w.completed += d.completed; w.created += d.created; w.moves += d.moves;
    weeks.set(k, w);
  }
  return [...weeks.values()];
}

/** Entradas × saídas por semana (segunda a domingo). */
export function weeklyFlow(weeks = 8) {
  const thisWeek = startOfWeek(today());
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i);
    const from = startOfDayTs(start);
    const to = startOfDayTs(addDays(start, 7));
    out.push({ start, created: countType('task.created', from, to), completed: completedIds(from, to).size, current: i === 0 });
  }
  return out;
}

/** Onde a energia foi colocada: conclusões e avanços em metas, por área. */
export function energyByArea(days) {
  const from = daysAgoTs(days - 1);
  const counts = new Map();
  for (const e of state.events) {
    if (e.createdAt < from) continue;
    const counts1 = e.type === 'task.completed'
      || (e.type === 'goal.progress' && e.metadata?.delta > 0 && e.metadata?.kind !== 'correction')
      || (e.type === 'goal.step' && e.metadata?.done);
    if (!counts1) continue;
    const key = e.areaId && state.areas.has(e.areaId) ? e.areaId : null;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const rows = listAreas().map((a) => ({ area: a, count: counts.get(a.id) || 0 }));
  if (counts.get(null)) rows.push({ area: null, count: counts.get(null) });
  return { total, rows: rows.sort((a, b) => b.count - a.count) };
}

/** Acontecimentos relevantes do período, em ordem cronológica reversa. */
export function notableEvents(days, limit = 10) {
  const from = daysAgoTs(days - 1);
  const out = [];
  for (const e of state.events) {
    if (e.createdAt < from) continue;
    const label = e.label || '';
    switch (e.type) {
      case 'goal.milestone':
        if (e.metadata.pct < 100) out.push({ ts: e.createdAt, tone: 'good', text: `“${label}” chegou a ${e.metadata.pct}%.`, href: `#/metas/${e.entityId}` });
        break;
      case 'goal.completed':
        out.push({ ts: e.createdAt, tone: 'good', text: `Meta concluída: “${label}”.`, href: `#/metas/${e.entityId}` });
        break;
      case 'goal.created':
        out.push({ ts: e.createdAt, tone: 'info', text: `Nova meta: “${label}”.`, href: `#/metas/${e.entityId}` });
        break;
      case 'task.completed':
        if (e.metadata.postponedCount >= 3) out.push({ ts: e.createdAt, tone: 'good', text: `“${label}” foi concluída depois de ser adiada ${e.metadata.postponedCount} vezes.` });
        else if (e.metadata.importance === 'high') out.push({ ts: e.createdAt, tone: 'good', text: `Tarefa importante concluída: “${label}”.` });
        break;
      case 'task.dropped':
        out.push({ ts: e.createdAt, tone: 'neutral', text: `Você decidiu não fazer “${label}”.` });
        break;
      default:
    }
  }
  return out.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

/** Visão geral de cada área. */
export function areaOverview() {
  const last = lastActivityByArea();
  const from30 = daysAgoTs(29);
  const done30 = new Map();
  for (const e of state.events) {
    if (e.type === 'task.completed' && e.createdAt >= from30 && e.areaId) done30.set(e.areaId, (done30.get(e.areaId) || 0) + 1);
  }
  const open = openTasks();
  return listAreas().map((a) => ({
    area: a,
    lastActivity: last.get(a.id) || null,
    open: open.filter((t) => t.areaId === a.id).length,
    overdue: open.filter((t) => t.areaId === a.id && isOverdue(t)).length,
    goals: [...state.goals.values()].filter((g) => g.areaId === a.id && g.status === 'active').length,
    done30: done30.get(a.id) || 0,
  }));
}

export const hasHistory = (minDays = 3) => {
  const first = state.events[0]?.createdAt;
  return !!first && Date.now() - first >= minDays * DAY;
};
