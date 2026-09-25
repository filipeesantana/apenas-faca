/**
 * Plano financeiro de uma meta: quanto a pessoa decidiu destinar por mês,
 * em valor fixo ou em percentual da renda registrada.
 *
 * O plano é uma decisão do usuário. O Norte só compara o planejado com o realizado.
 */
import { state, commit } from '../core/store.js';
import { makeEvent } from '../core/events.js';
import { uid } from '../utils/helpers.js';
import { incomeMonthly, monthOf, thisMonth, nextMonth } from './money.js';
import { parseISODate, today } from '../utils/dates.js';

export const allPlans = () => [...state.plans.values()].filter((p) => p.status !== 'archived');
export const planFor = (goalId) => allPlans().find((p) => p.goalId === goalId) || null;
export const hasPlans = () => allPlans().length > 0;

/** Valor mensal do plano hoje (percentual usa a renda registrada). */
export function planAmount(plan, income = incomeMonthly()) {
  if (!plan) return 0;
  if (plan.mode === 'percent') return income.has ? Math.round((income.cents * plan.percent) / 100) : 0;
  return plan.amountCents || 0;
}

export async function savePlan({ goalId, mode = 'fixed', amountCents = 0, percent = 0, months = null, note = '', source = 'simulator' }) {
  const existing = planFor(goalId);
  const now = Date.now();
  const plan = {
    id: existing?.id || uid(), goalId, mode,
    amountCents: mode === 'fixed' ? Math.round(amountCents) : 0,
    percent: mode === 'percent' ? Math.round(percent * 10) / 10 : 0,
    months: months || null, note, source, status: 'active',
    startMonth: existing?.startMonth || thisMonth(),
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
  const goal = state.goals.get(goalId);
  await commit({
    put: { plans: [plan] },
    events: [makeEvent(existing ? 'plan.updated' : 'plan.created', goal, { mode, amountCents: plan.amountCents, percent: plan.percent, months: plan.months }, now)],
  });
  return plan;
}

export const removePlan = (id) => commit({ del: { plans: [id] } });

/** Quanto já foi registrado nesta meta no mês (avanços positivos). */
export function realizedFor(goalId, ym = thisMonth()) {
  const from = parseISODate(`${ym}-01`).getTime();
  const to = parseISODate(`${nextMonth(ym)}-01`).getTime();
  let total = 0;
  for (const e of state.events) {
    if (e.type !== 'goal.progress' || e.entityId !== goalId) continue;
    if (e.createdAt < from || e.createdAt >= to) continue;
    if (e.metadata?.kind === 'correction') continue;
    if (e.metadata.delta > 0) total += e.metadata.delta;
  }
  return total;
}

/** Planejado × realizado das metas com plano, no mês. */
export function plansStatus(ym = thisMonth()) {
  const income = incomeMonthly();
  return allPlans().map((plan) => {
    const goal = state.goals.get(plan.goalId);
    const planned = planAmount(plan, income);
    const done = realizedFor(plan.goalId, ym);
    return { plan, goal, planned, done, missing: Math.max(0, planned - done), ym };
  }).filter((p) => p.goal && p.goal.status === 'active');
}

export const plannedTotal = (ym = thisMonth()) => plansStatus(ym).reduce((a, p) => a + p.planned, 0);

/** Data de início usada em textos ("desde setembro"). */
export const planSince = (plan) => plan?.startMonth || monthOf(today());
