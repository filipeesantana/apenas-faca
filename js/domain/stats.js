/** Estatísticas derivadas do histórico de eventos (Progresso, Análises e Início). */
import { state } from '../core/store.js';
import { lastActivityByArea } from '../core/events.js';
import { DAY, today, addDays, dayKey, daysAgoTs, startOfDayTs, startOfWeek, diffDays } from '../utils/dates.js';
import { openTasks, isOverdue } from './tasks.js';
import { listAreas } from './areas.js';

const inRange = (e, from, to) => e.createdAt >= from && e.createdAt < to;
const goalTypeOf = (e) => e.metadata?.goalType || state.goals.get(e.entityId)?.type;

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

/** Resumo de um intervalo [from, to). */
export function rangeSummary(from, to = Infinity) {
  const goalsMoved = new Set();
  let moneyIn = 0; let moneyOut = 0; let minutes = 0; let countUnits = 0;
  const areaCounts = new Map();
  for (const e of state.events) {
    if (!inRange(e, from, to)) continue;
    if (e.type === 'goal.progress' || e.type === 'goal.step') goalsMoved.add(e.entityId);
    if (e.type === 'goal.progress' && e.metadata?.kind !== 'correction') {
      const type = goalTypeOf(e);
      const d = e.metadata.delta;
      if (type === 'money') { if (d > 0) moneyIn += d; else moneyOut -= d; }
      else if (type === 'time' && d > 0) minutes += d;
      else if (type === 'count' && d > 0) countUnits += d;
    }
    const isWork = e.type === 'task.completed' || (e.type === 'goal.progress' && e.metadata?.delta > 0 && e.metadata?.kind !== 'correction') || (e.type === 'goal.step' && e.metadata?.done);
    if (isWork) {
      const key = e.areaId && state.areas.has(e.areaId) ? e.areaId : null;
      areaCounts.set(key, (areaCounts.get(key) || 0) + 1);
    }
  }
  return {
    completed: completedIds(from, to).size,
    created: countType('task.created', from, to),
    postponed: countType('task.postponed', from, to),
    dropped: countType('task.dropped', from, to),
    goalsMoved: goalsMoved.size,
    moneyIn, moneyOut, minutes, countUnits,
    areaCounts,
  };
}

export function periodSummary(days) {
  const from = daysAgoTs(days - 1);
  const s = rangeSummary(from);
  return { ...s, completedPrev: completedIds(daysAgoTs(days * 2 - 1), from).size, openNow: openTasks().length, overdueNow: openTasks().filter((t) => isOverdue(t)).length };
}

/** Série diária de conclusões e criações entre duas datas (inclusive). */
export function dailySeries(fromDate, toDate = today()) {
  const days = diffDays(fromDate, toDate) + 1;
  const buckets = new Map();
  for (let i = 0; i < days; i++) {
    const d = addDays(fromDate, i);
    buckets.set(d, { date: d, completed: new Set(), created: 0, moves: 0 });
  }
  const from = startOfDayTs(fromDate);
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

/**
 * Planejado × realizado de uma semana.
 * "Planejada" = qualquer tarefa que teve prazo dentro da semana (na criação, ao ser
 * reagendada ou atualmente). O desfecho é visto no fim da semana:
 * concluída · adiada para fora da semana · cancelada · ainda pendente.
 */
export function weekPlan(start, match = null) {
  const end = addDays(start, 7);
  const toTs = startOfDayTs(end);
  const within = (d) => d && d >= start && d < end;
  const planned = new Set();
  for (const e of state.events) {
    if (e.type === 'task.created' && within(e.metadata?.dueDate)) planned.add(e.entityId);
    else if ((e.type === 'task.postponed' || e.type === 'task.rescheduled') && within(e.metadata?.to)) planned.add(e.entityId);
  }
  for (const t of state.tasks.values()) if (within(t.dueDate)) planned.add(t.id);
  if (match) for (const id of [...planned]) if (!match(id)) planned.delete(id);

  const out = { start, planned: 0, done: 0, postponed: 0, dropped: 0, pending: 0 };
  for (const id of planned) {
    const evs = state.events.filter((e) => e.entityId === id && e.createdAt < toTs);
    if (!evs.length && !state.tasks.has(id)) continue;
    if (evs.some((e) => e.type === 'task.deleted')) continue;
    out.planned++;
    const lastDone = evs.filter((e) => e.type === 'task.completed').pop();
    const lastReopen = evs.filter((e) => e.type === 'task.reopened').pop();
    if (lastDone && (!lastReopen || lastReopen.createdAt < lastDone.createdAt)) out.done++;
    else if (evs.some((e) => e.type === 'task.dropped')) out.dropped++;
    else if (evs.some((e) => e.type === 'task.postponed' && within(e.metadata?.from) && !within(e.metadata?.to))) out.postponed++;
    else out.pending++;
  }
  return out;
}

export function plannedVsDone(weeks = 6, match = null, until = today()) {
  const lastWeek = startOfWeek(until);
  const thisWeek = startOfWeek(today());
  const list = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(lastWeek, -7 * i);
    list.push({ ...weekPlan(start, match), current: start === thisWeek });
  }
  return list;
}

/** Semanas completas de histórico disponíveis (desde o primeiro evento). */
export function fullWeeksOfHistory() {
  const first = state.events[0]?.createdAt;
  if (!first) return 0;
  return Math.max(0, Math.floor(diffDays(startOfWeek(dayKey(first)), startOfWeek(today())) / 7));
}

/**
 * Capacidade recente: média de tarefas concluídas por semana nas últimas semanas completas.
 * Só existe com pelo menos 3 semanas completas de histórico.
 */
export function recentCapacity(maxWeeks = 6) {
  const weeks = Math.min(maxWeeks, fullWeeksOfHistory());
  if (weeks < 3) return null;
  const thisWeek = startOfWeek(today());
  let total = 0;
  for (let i = 1; i <= weeks; i++) {
    const start = addDays(thisWeek, -7 * i);
    total += completedIds(startOfDayTs(start), startOfDayTs(addDays(start, 7))).size;
  }
  const plans = [];
  for (let i = 1; i <= Math.min(4, weeks); i++) plans.push(weekPlan(addDays(thisWeek, -7 * i)));
  return {
    weeks,
    avgDone: total / weeks,
    avgPlanned: plans.reduce((a, p) => a + p.planned, 0) / plans.length,
    avgPlannedDone: plans.reduce((a, p) => a + p.done, 0) / plans.length,
    planWeeks: plans.length,
  };
}

/** Carga da semana atual: tarefas com prazo nesta semana (abertas ou já concluídas). */
export function thisWeekLoad() {
  return weekPlan(startOfWeek(today()));
}

/** Onde a energia foi colocada no intervalo. */
export function energyByArea(from, to = Infinity) {
  const { areaCounts } = rangeSummary(from, to);
  const total = [...areaCounts.values()].reduce((a, b) => a + b, 0);
  const rows = listAreas().map((a) => ({ area: a, count: areaCounts.get(a.id) || 0 }));
  if (areaCounts.get(null)) rows.push({ area: null, count: areaCounts.get(null) });
  return { total, rows: rows.sort((a, b) => b.count - a.count) };
}

/** Acontecimentos relevantes do intervalo, do mais recente ao mais antigo. */
export function notableEvents(from, to = Infinity, limit = 10) {
  const out = [];
  for (const e of state.events) {
    if (!inRange(e, from, to)) continue;
    const label = e.label || '';
    switch (e.type) {
      case 'goal.milestone':
        if (e.metadata.pct < 100) out.push({ ts: e.createdAt, tone: 'good', text: `“${label}” chegou a ${e.metadata.pct}%.`, href: `#/metas/${e.entityId}` });
        break;
      case 'goal.completed': out.push({ ts: e.createdAt, tone: 'good', text: `Meta concluída: “${label}”.`, href: `#/metas/${e.entityId}` }); break;
      case 'goal.created': out.push({ ts: e.createdAt, tone: 'info', text: `Nova meta: “${label}”.`, href: `#/metas/${e.entityId}` }); break;
      case 'task.completed':
        if (e.metadata.postponedCount >= 3) out.push({ ts: e.createdAt, tone: 'good', text: `“${label}” foi concluída depois de ser adiada ${e.metadata.postponedCount} vezes.` });
        else if (e.metadata.importance === 'high') out.push({ ts: e.createdAt, tone: 'good', text: `Tarefa importante concluída: “${label}”.` });
        break;
      case 'task.dropped': out.push({ ts: e.createdAt, tone: 'neutral', text: `Você cancelou “${label}”.` }); break;
      default:
    }
  }
  return out.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

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
