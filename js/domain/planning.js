/**
 * Motor genérico de planejamento.
 *
 *   objetivo restante ÷ tempo disponível = ritmo necessário
 *
 * O cálculo é sempre feito "por dia" na unidade interna da meta (centavos, minutos,
 * unidades, etapas). Cada tipo tem apenas um ADAPTADOR que diz:
 *  - quais prazos oferecer (horizontes),
 *  - como apresentar um ritmo (R$/mês, minutos/dia, aulas/semana…),
 *  - quais ritmos sugerir nos cenários.
 */
import { MONTH_DAYS, today, addDays, addMonths, diffDays, approxDuration, formatMonthYear, parseISODate } from '../utils/dates.js';
import { formatMoney, formatMoneyApprox, formatMinutesLong, formatCount1, roundFriendly } from '../utils/numbers.js';
import { progressOf } from './goals.js';

const one = (n, sing, plur) => (Math.abs(n - 1) < 1e-9 ? sing : plur);

/* ---------- Adaptadores por tipo ---------- */

const ADAPTERS = {
  money: {
    horizons: [3, 6, 12, 18, 24, 36, 48].map((m) => ({ id: `m${m}`, label: `${m} meses`, months: m })),
    /** Ritmo principal e secundário para um prazo. Mensal exato (como uma parcela), semanal aproximado. */
    rate(remaining, days, months) {
      const perMonth = months ? remaining / months : (remaining / days) * MONTH_DAYS;
      const perWeek = (remaining / days) * 7;
      const perDay = remaining / days;
      return {
        primary: `${formatMoney(Math.round(perMonth))} por mês`,
        secondary: `equivale a cerca de ${formatMoneyApprox(perWeek)} por semana ou ${formatMoneyApprox(perDay)} por dia (equivalências aproximadas, não uma sugestão de guardar todo dia)`,
        short: `${formatMoney(Math.round(perMonth))}/mês`,
      };
    },
    rateText: (perDay) => `${formatMoneyApprox(perDay * MONTH_DAYS)}/mês`,
    paceCandidates: [100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 8000, 10000, 20000].map((r) => ({ perDay: (r * 100) / MONTH_DAYS, label: `${formatMoney(r * 100)} por mês` })),
    minDays: 90,
    paceInput: { label: 'Quanto por mês?', placeholder: 'Ex.: 800', toPerDay: (v) => v / MONTH_DAYS, kind: 'money' },
  },
  time: {
    horizons: [
      { id: 'd30', label: '30 dias', days: 30 }, { id: 'd60', label: '60 dias', days: 60 },
      { id: 'd90', label: '90 dias', days: 90 }, { id: 'm6', label: '6 meses', months: 6 },
    ],
    rate(remaining, days) {
      const perDay = remaining / days;
      const perWeek = perDay * 7;
      return {
        primary: `aproximadamente ${formatMinutesLong(Math.max(1, Math.round(perDay)))} por dia`,
        secondary: `ou cerca de ${formatMinutesLong(roundTime(perWeek))} por semana`,
        short: `${Math.max(1, Math.round(perDay))} min/dia`,
      };
    },
    rateText: (perDay) => (perDay * 7 >= 60 ? `${formatMinutesLong(roundTime(perDay * 7))} por semana` : `${Math.round(perDay)} min por dia`),
    paceCandidates: [10, 15, 20, 30, 40, 60, 90, 120].map((m) => ({ perDay: m, label: m < 60 ? `${m} minutos por dia` : `${formatMinutesLong(m)} por dia` }))
      .concat([120, 240, 360, 600].map((m) => ({ perDay: m / 7, label: `${formatMinutesLong(m)} por semana`, weekly: true }))),
    preferred: ['20 minutos por dia', '40 minutos por dia', '1 hora por dia', '4 horas por semana'],
    paceInput: { label: 'Quantos minutos por dia?', placeholder: 'Ex.: 30', toPerDay: (v) => v, kind: 'minutes' },
  },
  count: {
    horizons: [1, 3, 6, 12].map((m) => ({ id: `m${m}`, label: m === 1 ? '1 mês' : `${m} meses`, months: m })),
    rate(remaining, days, months, g) {
      const perWeek = (remaining / days) * 7;
      const perMonth = months ? remaining / months : (remaining / days) * MONTH_DAYS;
      const u = (n) => (g.unit ? ` ${g.unit}` : one(n, ' vez', ' vezes'));
      return perWeek >= 1
        ? { primary: `aproximadamente ${countStr(perWeek)}${u(perWeek)} por semana`, secondary: `cerca de ${countStr(perMonth)} por mês`, short: `${countStr(perWeek)}/sem.` }
        : { primary: `aproximadamente ${countStr(perMonth)}${u(perMonth)} por mês`, secondary: `cerca de 1 a cada ${Math.round(7 / perWeek)} dias`, short: `${countStr(perMonth)}/mês` };
    },
    rateText(perDay, g) {
      const perWeek = perDay * 7;
      const unit = g?.unit ? ` ${g.unit}` : '';
      return perWeek >= 1 ? `${countStr(perWeek)}${unit} por semana` : `${countStr(perDay * MONTH_DAYS)}${unit} por mês`;
    },
    paceCandidates: [0.5, 1, 2, 3, 5, 7, 10, 20, 50].map((n) => ({ perDay: n / 7, label: `${formatCount1(n)} por semana` })),
    paceInput: { label: 'Quantos por semana?', placeholder: 'Ex.: 3', toPerDay: (v) => v / 7, kind: 'number' },
  },
  steps: {
    horizons: [1, 3, 6].map((m) => ({ id: `m${m}`, label: m === 1 ? '1 mês' : `${m} meses`, months: m })),
    rate(remaining, days, months) {
      const perMonth = months ? remaining / months : (remaining / days) * MONTH_DAYS;
      const perWeek = (remaining / days) * 7;
      return perWeek >= 1
        ? { primary: `aproximadamente ${countStr(perWeek)} ${one(Math.round(perWeek), 'etapa', 'etapas')} por semana`, secondary: null, short: `${countStr(perWeek)}/sem.` }
        : { primary: `aproximadamente ${countStr(perMonth)} ${one(Math.round(perMonth * 10) / 10, 'etapa', 'etapas')} por mês`, secondary: `uma a cada ${Math.round(days / remaining)} dias`, short: `${countStr(perMonth)}/mês` };
    },
    rateText: (perDay) => (perDay * 7 >= 1 ? `${countStr(perDay * 7)} etapas por semana` : `${countStr(perDay * MONTH_DAYS)} etapas por mês`),
    paceCandidates: [1, 2, 3, 4, 6, 8].map((n) => ({ perDay: n / MONTH_DAYS, label: `${n} ${n === 1 ? 'etapa' : 'etapas'} por mês` })),
    paceInput: { label: 'Quantas etapas por mês?', placeholder: 'Ex.: 2', toPerDay: (v) => v / MONTH_DAYS, kind: 'number' },
  },
};

function countStr(n) {
  return formatCount1(n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
}
/** Arredonda minutos semanais para múltiplos de 15 (evita "4 horas e 1 minuto"). */
function roundTime(min) {
  return min < 60 ? Math.round(min) : Math.round(min / 15) * 15;
}

export const adapterFor = (g) => ADAPTERS[g.type];

/** Texto de um ritmo por dia na linguagem do tipo da meta. */
export const rateText = (g, perDay) => (perDay == null || !Number.isFinite(perDay) ? '—' : ADAPTERS[g.type].rateText(perDay, g));

/* ---------- Ritmo necessário ---------- */

export function horizonEnd(h, from = today()) {
  if (h.months) return addMonths(from, h.months);
  return addDays(from, h.days);
}

/**
 * Meses de calendário entre hoje e uma data: meses inteiros + fração em dias.
 * Hoje → mesmo dia daqui a 24 meses = exatamente 24 (parcela mensal exata).
 */
export function calendarMonths(endDate, from = today()) {
  let whole = 0;
  while (addMonths(from, whole + 1) <= endDate) whole++;
  const rest = diffDays(addMonths(from, whole), endDate);
  return whole + rest / MONTH_DAYS;
}

/**
 * Ritmo necessário para concluir até `endDate`.
 * O valor mensal usa meses de calendário: R$ 31.500 em 24 meses = R$ 1.312,50.
 */
export function requiredRate(g, endDate, months = null) {
  const { remaining } = progressOf(g);
  const days = diffDays(today(), endDate);
  if (remaining <= 0) return { done: true };
  if (days <= 0) return { invalid: true, days };
  if (!months) months = calendarMonths(endDate);
  const perDay = remaining / days;
  return { perDay, days, remaining, endDate, ...ADAPTERS[g.type].rate(remaining, days, months, g) };
}

/** Cenários por prazo: 6, 12, 18… meses (ou 30, 60, 90 dias no caso de tempo). */
export function horizonScenarios(g) {
  return ADAPTERS[g.type].horizons.map((h) => {
    const endDate = horizonEnd(h);
    return { ...h, endDate, ...requiredRate(g, endDate, h.months || null) };
  });
}

/* ---------- Cenários por ritmo: "se eu fizer X por dia, quando termino?" ---------- */

export function timeToFinish(g, perDay) {
  const { remaining } = progressOf(g);
  if (!(perDay > 0) || remaining <= 0) return null;
  const days = remaining / perDay;
  const end = addDays(today(), Math.ceil(days));
  return { days, text: `aproximadamente ${approxDuration(days)}`, endDate: end, endLabel: formatMonthYear(parseISODate(end)) };
}

/**
 * Escolhe até 4 ritmos "redondos" que resultem em prazos razoáveis (2 semanas a 4 anos).
 * Se o tipo tem ritmos preferidos (ex.: 20/40/60 min por dia), usa esses primeiro.
 */
export function paceScenarios(g) {
  const { remaining } = progressOf(g);
  if (remaining <= 0) return [];
  const ad = ADAPTERS[g.type];
  const all = ad.paceCandidates
    .map((c) => ({ ...c, ...timeToFinish(g, c.perDay) }))
    .filter((c) => c.days >= (ad.minDays || 14) && c.days <= 1460);
  if (ad.preferred) {
    const pref = ad.preferred.map((label) => all.find((c) => c.label === label)).filter(Boolean);
    if (pref.length >= 2) return pref;
  }
  if (all.length <= 4) return all;
  const picks = [0, Math.floor(all.length / 3), Math.floor((2 * all.length) / 3), all.length - 1];
  return [...new Set(picks)].map((i) => all[i]);
}

export const paceInputFor = (g) => ADAPTERS[g.type].paceInput;

/* ---------- Séries para o gráfico de projeção ---------- */

/**
 * Pontos do histórico (degraus), linha planejada (hoje → alvo na data escolhida)
 * e linha do ritmo recente (se houver base).
 */
export function projectionModel(g, { endDate = null, history = [], recentPerDay = null } = {}) {
  const now = Date.now();
  const { current, target } = progressOf(g);
  const end = endDate || g.targetDate;
  const endTs = end ? parseISODate(end).getTime() : null;
  let recentEndTs = null;
  if (recentPerDay > 0 && current < target) {
    recentEndTs = now + ((target - current) / recentPerDay) * 86400000;
  }
  const startTs = history.length ? history[0].t : g.createdAt;
  const horizon = Math.max(endTs || 0, Math.min(recentEndTs || 0, (endTs || now) + (endTs ? endTs - startTs : 365 * 86400000)), now + 30 * 86400000);
  return { startTs, now, endTs, horizon, current, target, recentEndTs, recentPerDay };
}

/** Valor "redondo" para mostrar em estimativas (usado pela interface). */
export const friendly = roundFriendly;
