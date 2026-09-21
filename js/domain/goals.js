/**
 * Metas: por valor (dinheiro), por quantidade e por etapas.
 * O valor atual é um cache; a fonte da verdade do histórico são os eventos `goal.progress`.
 */
import { state, commit } from '../core/store.js';
import { makeEvent } from '../core/events.js';
import { uid, clamp, sum } from '../utils/helpers.js';
import { DAY, today, diffDays, formatMonthYear } from '../utils/dates.js';
import { formatMoney, formatMoneyApprox, formatCount, formatCount1 } from '../utils/numbers.js';

export const GOAL_TYPES = ['money', 'count', 'steps'];
export const MILESTONES = [10, 25, 50, 75, 90, 100];
export const MILESTONE_TEXT = {
  0: 'A meta foi criada.',
  10: 'Você já saiu do começo.',
  25: 'Um quarto do caminho concluído.',
  50: 'Metade do caminho.',
  75: 'Agora falta menos do que você já fez.',
  90: 'Você entrou na reta final.',
  100: 'Meta concluída.',
};

export const allGoals = () => [...state.goals.values()];
export const activeGoals = () => allGoals().filter((g) => g.status === 'active');

export function progressOf(g) {
  if (g.type === 'steps') {
    const target = g.steps.length;
    const current = g.steps.filter((s) => s.done).length;
    return { current, target, ratio: target ? current / target : 0, remaining: target - current };
  }
  const target = g.targetValue || 0;
  const current = g.currentValue || 0;
  return { current, target, ratio: target > 0 ? clamp(current / target, 0, 1) : 0, remaining: Math.max(target - current, 0) };
}

/** Mensagem do marco correspondente ao progresso atual. */
export function milestoneMessage(g) {
  const pct = progressOf(g).ratio * 100;
  let m = 0;
  for (const x of MILESTONES) if (pct >= x - 1e-9) m = x;
  return MILESTONE_TEXT[m];
}

export function formatGoalValue(g, v) {
  if (g.type === 'money') return formatMoney(v);
  if (g.type === 'count') return `${formatCount(v)}${g.unit ? ` ${g.unit}` : ''}`;
  return `${v} ${v === 1 ? 'etapa' : 'etapas'}`;
}

/** "R$ 8.500 de R$ 40.000" · "18 de 40 aulas" · "3 de 5 etapas" */
export function goalValueLine(g) {
  const { current, target } = progressOf(g);
  if (g.type === 'money') return `${formatMoney(current)} de ${formatMoney(target)}`;
  if (g.type === 'count') return `${formatCount(current)} de ${formatCount(target)}${g.unit ? ` ${g.unit}` : ''}`;
  return `${current} de ${target} ${target === 1 ? 'etapa' : 'etapas'}`;
}

export function remainingText(g) {
  const { remaining } = progressOf(g);
  if (remaining <= 0) return 'Nada falta.';
  if (g.type === 'money') return `Faltam ${formatMoney(remaining)}`;
  if (g.type === 'count') return `Faltam ${formatCount(remaining)}${g.unit ? ` ${g.unit}` : ''}`;
  return remaining === 1 ? 'Falta 1 etapa' : `Faltam ${remaining} etapas`;
}

/**
 * Aplica marcos e transições de status, e grava tudo num único commit.
 * `silent` marca marcos sem gerar eventos (usado na criação com valor inicial).
 */
async function finalize(prev, next, events, { silent = false, extra = {} } = {}) {
  const allEvents = [...events];
  const before = prev ? progressOf(prev).ratio * 100 : 0;
  const after = progressOf(next).ratio * 100;
  const reached = new Set(next.milestonesReached || []);
  const crossed = [];
  for (const m of MILESTONES) {
    if (after >= m - 1e-9 && (before < m - 1e-9 || !prev) && !reached.has(m)) {
      reached.add(m);
      crossed.push(m);
    }
  }
  next.milestonesReached = [...reached].sort((a, b) => a - b);
  if (!silent) for (const m of crossed) allEvents.push(makeEvent('goal.milestone', next, { pct: m }));

  let completed = false;
  const hasTarget = next.type === 'steps' ? next.steps.length > 0 : next.targetValue > 0;
  if (hasTarget && after >= 100 - 1e-9 && next.status === 'active') {
    next.status = 'done';
    next.completedAt = Date.now();
    completed = true;
    allEvents.push(makeEvent('goal.completed', next));
  } else if (after < 100 - 1e-9 && next.status === 'done') {
    next.status = 'active';
    next.completedAt = null;
    allEvents.push(makeEvent('goal.reopened', next, { auto: true }));
  }
  next.updatedAt = Date.now();

  const undo = await commit({
    put: { ...(extra.put || {}), goals: [next] },
    del: extra.del || {},
    events: [...allEvents, ...(extra.events || [])],
  });
  return { undo, crossed: silent ? [] : crossed, completed, goal: next };
}

export function createGoal({ title, type, targetValue = null, currentValue = 0, unit = '', steps = [], targetDate = null, areaId = null, notes = '' }, extra) {
  const now = Date.now();
  const g = {
    id: uid(),
    title: String(title).trim().slice(0, 200),
    notes,
    areaId,
    type,
    unit: type === 'count' ? String(unit || '').trim().slice(0, 30) : '',
    targetValue: type === 'steps' ? null : targetValue,
    currentValue: type === 'steps' ? 0 : Math.max(0, currentValue || 0),
    steps: type === 'steps' ? steps.map((t) => ({ id: uid(), title: t.trim(), done: false, doneAt: null })).filter((s) => s.title) : [],
    targetDate: targetDate || null,
    status: 'active',
    milestonesReached: [],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  const events = [makeEvent('goal.created', g, { type, targetValue: g.targetValue, initial: g.currentValue })];
  return finalize(null, g, events, { silent: true, extra: typeof extra === 'function' ? extra(g) : extra });
}

/** kind: 'add' (aporte/avanço), 'withdraw' (retirada), 'correction' (ajuste do valor). */
export function addProgress(id, delta, { kind = 'add', note = '' } = {}) {
  const g = state.goals.get(id);
  if (!g || g.type === 'steps' || !Number.isFinite(delta) || delta === 0) return Promise.resolve(null);
  const before = g.currentValue || 0;
  const after = Math.max(0, before + delta);
  const effective = after - before;
  if (effective === 0) return Promise.resolve(null);
  const next = { ...g, currentValue: after };
  return finalize(g, next, [makeEvent('goal.progress', next, { kind, delta: effective, before, after, note, goalType: g.type })]);
}

export function setCurrentValue(id, value, note = '') {
  const g = state.goals.get(id);
  if (!g || !Number.isFinite(value)) return Promise.resolve(null);
  return addProgress(id, Math.max(0, value) - (g.currentValue || 0), { kind: 'correction', note });
}

export function toggleStep(goalId, stepId) {
  const g = state.goals.get(goalId);
  if (!g) return Promise.resolve(null);
  const step = g.steps.find((s) => s.id === stepId);
  if (!step) return Promise.resolve(null);
  const done = !step.done;
  const next = { ...g, steps: g.steps.map((s) => (s.id === stepId ? { ...s, done, doneAt: done ? Date.now() : null } : s)) };
  return finalize(g, next, [makeEvent('goal.step', next, { stepId, title: step.title, done })]);
}

export function addStep(goalId, title) {
  const g = state.goals.get(goalId);
  const clean = title?.trim();
  if (!g || !clean) return Promise.resolve(null);
  const next = { ...g, steps: [...g.steps, { id: uid(), title: clean.slice(0, 200), done: false, doneAt: null }] };
  return finalize(g, next, [makeEvent('goal.edited', next, { fields: ['steps'], added: clean })]);
}

export function removeStep(goalId, stepId) {
  const g = state.goals.get(goalId);
  if (!g) return Promise.resolve(null);
  const step = g.steps.find((s) => s.id === stepId);
  const next = { ...g, steps: g.steps.filter((s) => s.id !== stepId) };
  return finalize(g, next, [makeEvent('goal.edited', next, { fields: ['steps'], removed: step?.title })]);
}

export function updateGoal(id, patch) {
  const g = state.goals.get(id);
  if (!g) return Promise.resolve(null);
  const fields = Object.keys(patch).filter((k) => JSON.stringify(g[k] ?? null) !== JSON.stringify(patch[k] ?? null));
  if (!fields.length) return Promise.resolve(null);
  const next = { ...g, ...Object.fromEntries(fields.map((k) => [k, patch[k]])) };
  return finalize(g, next, [makeEvent('goal.edited', next, { fields })]);
}

export function archiveGoal(id) {
  const g = state.goals.get(id);
  if (!g) return Promise.resolve(null);
  const next = { ...g, status: 'archived', archivedFrom: g.status, updatedAt: Date.now() };
  return commit({ put: { goals: [next] }, events: [makeEvent('goal.archived', next)] });
}

export function restoreGoal(id) {
  const g = state.goals.get(id);
  if (!g) return Promise.resolve(null);
  const done = progressOf(g).ratio >= 1;
  const next = { ...g, status: done ? 'done' : 'active', updatedAt: Date.now() };
  return commit({ put: { goals: [next] }, events: [makeEvent('goal.restored', next)] });
}

export function deleteGoal(id) {
  const g = state.goals.get(id);
  if (!g) return Promise.resolve(null);
  const now = Date.now();
  const tasks = [...state.tasks.values()].filter((t) => t.goalId === id).map((t) => ({ ...t, goalId: null, updatedAt: now }));
  return commit({ put: { tasks }, del: { goals: [id] }, events: [makeEvent('goal.deleted', g, { title: g.title })] });
}

/* ---------- Ritmo e previsão ---------- */

const MONTH_DAYS = 30.4375;

/**
 * Calcula ritmo necessário (se há data) e ritmo recente (se há histórico suficiente).
 * Histórico suficiente = pelo menos 21 dias de meta e 2 movimentos na janela de 90 dias.
 * Correções não entram no ritmo (são ajustes, não avanço).
 */
export function paceOf(g, now = Date.now()) {
  if (g.type === 'steps' || g.status !== 'active') return null;
  const { remaining } = progressOf(g);
  const out = { remaining, neededPerDay: null, avgPerDay: null, insufficient: false, datePassed: false, daysLeft: null, projectionDate: null, projectionDays: null, windowDays: null, offPace: false };

  const windowStart = Math.max(g.createdAt, now - 90 * DAY);
  const spanDays = (now - windowStart) / DAY;
  const moves = state.events.filter((e) => e.entityId === g.id && e.type === 'goal.progress' && e.metadata?.kind !== 'correction' && e.createdAt >= windowStart);
  if (spanDays >= 21 && moves.length >= 2) {
    out.avgPerDay = sum(moves, (e) => e.metadata.delta) / spanDays;
    out.windowDays = Math.round(spanDays);
  } else out.insufficient = true;

  if (g.targetDate) {
    const days = diffDays(today(), g.targetDate);
    out.daysLeft = days;
    if (days < 0) out.datePassed = true;
    else if (remaining > 0) out.neededPerDay = remaining / Math.max(days, 1);
  }

  if (out.avgPerDay > 0 && remaining > 0) {
    out.projectionDays = remaining / out.avgPerDay;
    out.projectionDate = new Date(now + out.projectionDays * DAY);
  }
  out.offPace = out.neededPerDay != null && out.avgPerDay != null && out.avgPerDay < out.neededPerDay * 0.9;
  return out;
}

/** Ritmo em linguagem humana: "R$ 1.200/mês", "3 aulas por semana". */
export function rateText(g, perDay) {
  if (perDay == null || !Number.isFinite(perDay)) return '—';
  if (g.type === 'money') return `${formatMoneyApprox(perDay * MONTH_DAYS)}/mês`;
  const unit = g.unit ? ` ${g.unit}` : '';
  const perWeek = perDay * 7;
  if (perWeek >= 1) return `${formatCount1(perWeek >= 10 ? Math.round(perWeek) : Math.round(perWeek * 10) / 10)}${unit} por semana`;
  const perMonth = perDay * MONTH_DAYS;
  if (perMonth >= 0.1) return `${formatCount1(Math.round(perMonth * 10) / 10)}${unit} por mês`;
  return `menos de 0,1${unit} por mês`;
}

export function projectionText(pace) {
  if (!pace?.projectionDate) return null;
  if (pace.projectionDays > 3650) return 'Nesse ritmo, levaria mais de 10 anos.';
  const now = new Date();
  const d = pace.projectionDate;
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
    return 'Mantendo esse ritmo, a meta tende a ser atingida ainda neste mês.';
  }
  return `Mantendo esse ritmo, a meta tende a ser atingida por volta de ${formatMonthYear(d)}.`;
}
