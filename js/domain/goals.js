/**
 * Metas: valor (dinheiro), quantidade, tempo e etapas.
 * Unidades internas: dinheiro em centavos; tempo em minutos; quantidade em número.
 * O valor atual é um cache; o histórico verdadeiro são os eventos `goal.progress`.
 */
import { state, commit } from '../core/store.js';
import { makeEvent } from '../core/events.js';
import { uid, clamp, sum } from '../utils/helpers.js';
import { DAY, today, diffDays } from '../utils/dates.js';
import { formatMoney, formatCount, formatMinutes, parseMoney, parseNumber, parseDuration } from '../utils/numbers.js';

export const GOAL_TYPES = {
  money: { label: 'Valor', desc: 'Para dinheiro ou qualquer objetivo numérico.', example: 'Ex.: juntar R$ 40.000', icon: 'coins' },
  count: { label: 'Quantidade', desc: 'Para aulas, livros, treinos, unidades ou ocorrências.', example: 'Ex.: 40 aulas, 12 livros', icon: 'layers' },
  time: { label: 'Tempo', desc: 'Para acompanhar horas ou minutos acumulados.', example: 'Ex.: estudar 60 horas', icon: 'clock' },
  steps: { label: 'Etapas', desc: 'Para objetivos formados por passos.', example: 'Ex.: tirar a habilitação', icon: 'steps' },
};

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

/* ---------- Valores e formatação por tipo ---------- */

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

export function formatGoalValue(g, v) {
  if (g.type === 'money') return formatMoney(v);
  if (g.type === 'time') return formatMinutes(v);
  if (g.type === 'count') return `${formatCount(v)}${g.unit ? ` ${g.unit}` : ''}`;
  return `${v} ${v === 1 ? 'etapa' : 'etapas'}`;
}

/** Só o número (sem unidade de contagem): usado em "18 / 40 aulas". */
function bare(g, v) {
  if (g.type === 'money') return formatMoney(v);
  if (g.type === 'time') return formatMinutes(v);
  return formatCount(v);
}

/** "R$ 8.500 / R$ 40.000" · "18 / 40 aulas" · "8h20 / 60h" · "3 / 5 etapas" */
export function goalValueLine(g) {
  const { current, target } = progressOf(g);
  const unit = g.type === 'count' ? (g.unit ? ` ${g.unit}` : '') : g.type === 'steps' ? ' etapas' : '';
  return `${bare(g, current)} / ${bare(g, target)}${unit}`;
}

export function remainingText(g) {
  const { remaining } = progressOf(g);
  if (remaining <= 0) return 'Nada falta.';
  if (g.type === 'steps') return remaining === 1 ? 'Falta 1 etapa' : `Faltam ${remaining} etapas`;
  return `Faltam ${formatGoalValue(g, remaining)}`;
}

export function parseGoalValue(type, input) {
  if (type === 'money') return parseMoney(input);
  if (type === 'time') return parseDuration(input);
  return parseNumber(input);
}

export function milestoneMessage(g) {
  const pct = progressOf(g).ratio * 100;
  let m = 0;
  for (const x of MILESTONES) if (pct >= x - 1e-9) m = x;
  return MILESTONE_TEXT[m];
}

/* ---------- Gravação com marcos e mudança de status ---------- */

async function finalize(prev, next, events, { silent = false, extra = {} } = {}) {
  const allEvents = [...events];
  const before = prev ? progressOf(prev).ratio * 100 : 0;
  const after = progressOf(next).ratio * 100;
  const reached = new Set(next.milestonesReached || []);
  const crossed = [];
  for (const m of MILESTONES) {
    if (after >= m - 1e-9 && (!prev || before < m - 1e-9) && !reached.has(m)) { reached.add(m); crossed.push(m); }
  }
  next.milestonesReached = [...reached].sort((a, b) => a - b);
  if (!silent) for (const m of crossed) allEvents.push(makeEvent('goal.milestone', next, { pct: m }));

  let completed = false;
  const hasTarget = next.type === 'steps' ? next.steps.length > 0 : next.targetValue > 0;
  if (hasTarget && after >= 100 - 1e-9 && next.status === 'active') {
    next.status = 'done'; next.completedAt = Date.now(); completed = true;
    allEvents.push(makeEvent('goal.completed', next));
  } else if (after < 100 - 1e-9 && next.status === 'done') {
    next.status = 'active'; next.completedAt = null;
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

/** kind: 'add' (avanço/aporte), 'withdraw' (retirada/remoção), 'correction' (ajuste). */
export function addProgress(id, delta, { kind = 'add', note = '', taskId = null } = {}) {
  const g = state.goals.get(id);
  if (!g || g.type === 'steps' || !Number.isFinite(delta) || delta === 0) return Promise.resolve(null);
  const before = g.currentValue || 0;
  const after = Math.max(0, before + delta);
  const effective = after - before;
  if (effective === 0) return Promise.resolve(null);
  const next = { ...g, currentValue: after };
  return finalize(g, next, [makeEvent('goal.progress', next, { kind, delta: effective, before, after, note, goalType: g.type, taskId })]);
}

export function setCurrentValue(id, value, note = '') {
  const g = state.goals.get(id);
  if (!g || !Number.isFinite(value)) return Promise.resolve(null);
  return addProgress(id, Math.max(0, value) - (g.currentValue || 0), { kind: 'correction', note });
}

export function toggleStep(goalId, stepId) {
  const g = state.goals.get(goalId);
  const step = g?.steps.find((s) => s.id === stepId);
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
  const next = { ...g, status: 'archived', updatedAt: Date.now() };
  return commit({ put: { goals: [next] }, events: [makeEvent('goal.archived', next)] });
}

export function restoreGoal(id) {
  const g = state.goals.get(id);
  if (!g) return Promise.resolve(null);
  const next = { ...g, status: progressOf(g).ratio >= 1 ? 'done' : 'active', updatedAt: Date.now() };
  return commit({ put: { goals: [next] }, events: [makeEvent('goal.restored', next)] });
}

export function deleteGoal(id) {
  const g = state.goals.get(id);
  if (!g) return Promise.resolve(null);
  const now = Date.now();
  const tasks = [...state.tasks.values()].filter((t) => t.goalId === id).map((t) => ({ ...t, goalId: null, nextStep: false, updatedAt: now }));
  return commit({ put: { tasks }, del: { goals: [id] }, events: [makeEvent('goal.deleted', g, { title: g.title })] });
}

/* ---------- Ritmo recente ---------- */

/** Último movimento (progresso, etapa ou tarefa ligada concluída). */
export function lastMovementAt(g) {
  let last = 0;
  for (const e of state.events) {
    if (e.createdAt <= last) continue;
    if (e.entityId === g.id && (e.type === 'goal.progress' || e.type === 'goal.step')) last = e.createdAt;
    else if (e.type === 'task.completed' && e.metadata?.goalId === g.id) last = e.createdAt;
  }
  return last || null;
}

/**
 * Média recente por dia: movimentos (sem correções) numa janela de até 90 dias.
 * Só existe com pelo menos 21 dias de meta e 2 movimentos — antes disso não há base para estimar.
 */
export function recentPace(g, now = Date.now()) {
  if (g.type === 'steps') {
    const windowStart = Math.max(g.createdAt, now - 90 * DAY);
    const span = (now - windowStart) / DAY;
    const done = g.steps.filter((s) => s.doneAt && s.doneAt >= windowStart).length;
    if (span < 21 || done < 2) return null;
    return { perDay: done / span, windowDays: Math.round(span) };
  }
  const windowStart = Math.max(g.createdAt, now - 90 * DAY);
  const span = (now - windowStart) / DAY;
  const moves = state.events.filter((e) => e.entityId === g.id && e.type === 'goal.progress' && e.metadata?.kind !== 'correction' && e.createdAt >= windowStart);
  if (span < 21 || moves.length < 2) return null;
  return { perDay: sum(moves, (e) => e.metadata.delta) / span, windowDays: Math.round(span) };
}

/** Situação da meta frente à data escolhida. */
export function paceOf(g, now = Date.now()) {
  if (g.status !== 'active') return null;
  const { remaining } = progressOf(g);
  const recent = recentPace(g, now);
  const out = { remaining, recent, neededPerDay: null, daysLeft: null, datePassed: false, offPace: false, projectionDays: null };
  if (g.targetDate) {
    out.daysLeft = diffDays(today(), g.targetDate);
    if (out.daysLeft < 0) out.datePassed = true;
    else if (remaining > 0) out.neededPerDay = remaining / Math.max(out.daysLeft, 1);
  }
  if (recent?.perDay > 0 && remaining > 0) out.projectionDays = remaining / recent.perDay;
  out.offPace = out.neededPerDay != null && recent != null && recent.perDay < out.neededPerDay * 0.9;
  return out;
}
