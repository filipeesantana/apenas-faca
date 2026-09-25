/**
 * Simulador de caminhos — matemática pura, sem DOM e sem efeitos.
 *
 * Fluxo nominal simples: nada de juros, rendimento ou inflação (evita precisão falsa).
 * Tudo em centavos inteiros; os meses são meses de calendário a partir de hoje.
 */
import { today, addMonths, parseISODate, MONTH_DAYS } from '../utils/dates.js';

export const MAX_MONTHS = 600; // 50 anos: teto de segurança dos laços

const int = (v) => Math.round(Number(v) || 0);

/** Aportes extras e retiradas pontuais agrupados por mês (índice 1 = primeiro mês). */
function eventsByMonth(extras = [], withdrawals = []) {
  const map = new Map();
  for (const e of extras) if (e?.amountCents > 0) map.set(e.month, (map.get(e.month) || 0) + int(e.amountCents));
  for (const w of withdrawals) if (w?.amountCents > 0) map.set(w.month, (map.get(w.month) || 0) - int(w.amountCents));
  return map;
}

/**
 * Trajetória mês a mês.
 * Cada ponto: { i (meses a partir de hoje), ym, cents, ratio, extra }.
 */
export function buildSeries({ startCents = 0, targetCents, perMonthCents, months = null, extras = [], withdrawals = [] }) {
  const evs = eventsByMonth(extras, withdrawals);
  const limit = months != null ? Math.min(months, MAX_MONTHS) : MAX_MONTHS;
  const points = [{ i: 0, ym: today().slice(0, 7), cents: int(startCents), ratio: targetCents > 0 ? startCents / targetCents : 0, extra: 0 }];
  let cents = int(startCents);
  let reachedAt = cents >= targetCents ? 0 : null;
  for (let i = 1; i <= limit; i++) {
    const extra = evs.get(i) || 0;
    cents = Math.max(0, cents + int(perMonthCents) + extra);
    points.push({ i, ym: addMonths(`${today().slice(0, 7)}-01`, i).slice(0, 7), cents, ratio: targetCents > 0 ? cents / targetCents : 0, extra });
    if (reachedAt == null && cents >= targetCents) { reachedAt = i; if (months == null) break; }
    if (months == null && i >= MAX_MONTHS) break;
  }
  return { points, reachedAt };
}

/** Em quanto tempo chego lá guardando `perMonthCents` por mês? */
export function monthsFor({ startCents = 0, targetCents, perMonthCents, extras = [], withdrawals = [] }) {
  const remaining = targetCents - startCents;
  if (remaining <= 0) return { months: 0, done: true };
  const hasEvents = extras.length > 0 || withdrawals.length > 0;
  if (!(perMonthCents > 0) && !hasEvents) return { months: null, never: true };
  const { points, reachedAt } = buildSeries({ startCents, targetCents, perMonthCents, extras, withdrawals });
  if (reachedAt == null) return { months: null, never: true, points };
  return { months: reachedAt, points, endDate: addMonths(today(), reachedAt) };
}

/** Quanto por mês para chegar lá em `months` meses? (aportes e retiradas entram na conta.) */
export function perMonthFor({ startCents = 0, targetCents, months, extras = [], withdrawals = [] }) {
  const m = Math.max(1, Math.round(months));
  const evs = eventsByMonth(extras, withdrawals);
  let net = 0;
  for (const [monthIdx, cents] of evs) if (monthIdx <= m) net += cents;
  const remaining = targetCents - startCents - net;
  return { perMonthCents: Math.max(0, Math.ceil(remaining / m)), months: m, endDate: addMonths(today(), m) };
}

/** Equivalências aproximadas (não são uma sugestão de guardar todo dia). */
export function equivalents(perMonthCents) {
  return {
    perWeek: Math.round((perMonthCents * 12) / 52.1775),
    perDay: Math.round(perMonthCents / MONTH_DAYS),
  };
}

/** Quando cada marco (25%, 50%…) seria atingido numa trajetória. */
export function milestonesOf(points, targetCents, marks = [25, 50, 75, 90, 100]) {
  const out = [];
  for (const pct of marks) {
    const need = (targetCents * pct) / 100;
    const p = points.find((x) => x.cents >= need);
    if (p) out.push({ pct, month: p.i, ym: p.ym, cents: p.cents });
  }
  return out;
}

/**
 * Resultado completo de um cenário.
 * params: { mode: 'contrib'|'deadline', perMonthCents, months, extras, withdrawals, startCents }
 * ctx: { targetCents, currentCents, incomeCents }
 */
export function runScenario(params, ctx) {
  const startCents = params.startCents != null ? params.startCents : ctx.currentCents;
  const targetCents = ctx.targetCents;
  const extras = params.extras || [];
  const withdrawals = params.withdrawals || [];
  let perMonthCents = int(params.perMonthCents);
  let months = params.months != null ? Math.round(params.months) : null;

  if (params.mode === 'deadline' && months) {
    perMonthCents = perMonthFor({ startCents, targetCents, months, extras, withdrawals }).perMonthCents;
  }
  const res = monthsFor({ startCents, targetCents, perMonthCents, extras, withdrawals });
  months = res.months;
  const series = buildSeries({ startCents, targetCents, perMonthCents, months: months || 120, extras, withdrawals });
  const remaining = Math.max(0, targetCents - startCents);
  return {
    ...params, startCents, perMonthCents, months, never: !!res.never,
    endDate: months ? addMonths(today(), months) : null,
    endLabel: months ? monthYear(addMonths(today(), months)) : null,
    points: series.points,
    remaining,
    monthlyRatio: targetCents > 0 ? perMonthCents / targetCents : 0,
    shareOfIncome: ctx.incomeCents > 0 ? perMonthCents / ctx.incomeCents : null,
    equivalents: equivalents(perMonthCents),
    milestones: milestonesOf(series.points, targetCents),
  };
}

const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function monthYear(dateISO) {
  const d = parseISODate(dateISO);
  return `${MONTHS_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * Atalhos de contribuição em torno de um valor de referência, em degraus "redondos".
 * Só entram os que resultam em prazos razoáveis (até ~15 anos).
 */
export function quickContributions(remainingCents, baseCents, ctx) {
  const base = baseCents > 0 ? baseCents : Math.max(10000, Math.round(remainingCents / 24));
  const step = base >= 200000 ? 50000 : base >= 100000 ? 25000 : base >= 50000 ? 10000 : 5000;
  const round = (v) => Math.max(step, Math.round(v / step) * step);
  const raw = [round(base * 0.5), round(base * 0.75), round(base), round(base * 1.5), round(base * 2)];
  const seen = new Set();
  return raw.filter((v) => (seen.has(v) ? false : seen.add(v)))
    .map((perMonthCents) => ({ perMonthCents, ...monthsFor({ startCents: ctx.currentCents, targetCents: ctx.targetCents, perMonthCents }) }))
    .filter((c) => c.months && c.months <= 180);
}

/** Descrições factuais para comparar cenários — nunca "o melhor". */
export function compareLabels(scenarios) {
  const valid = scenarios.filter((s) => s.months);
  const labels = new Map();
  if (valid.length < 2) return labels;
  const fastest = valid.reduce((a, b) => (b.months < a.months ? b : a));
  const cheapest = valid.reduce((a, b) => (b.perMonthCents < a.perMonthCents ? b : a));
  labels.set(fastest.id, 'Menor prazo');
  if (cheapest.id !== fastest.id) labels.set(cheapest.id, 'Menor valor por mês');
  return labels;
}
