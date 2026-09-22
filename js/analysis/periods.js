/**
 * Períodos da análise: presets, rótulos legíveis, período anterior equivalente e agrupamento.
 * Tudo em datas de calendário locais (AAAA-MM-DD). Sem DOM.
 */
import { state } from '../core/store.js';
import {
  today, addDays, addMonths, diffDays, startOfWeek, startOfMonth, dayKey, parseISODate, isValidISODate, formatDay,
} from '../utils/dates.js';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const PERIODS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'semana', label: 'Esta semana' },
  { id: '7d', label: 'Últimos 7 dias' },
  { id: 'mes', label: 'Este mês' },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: 'tudo', label: 'Tudo' },
  { id: 'custom', label: 'Personalizado' },
];

export const firstDataDay = () => (state.events[0] ? dayKey(state.events[0].createdAt) : today());

/** "21 a 27 de setembro de 2026" · "30 de agosto a 5 de setembro de 2026" */
export function rangeText(from, to) {
  const a = parseISODate(from); const b = parseISODate(to);
  const full = (d) => `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
  if (from === to) return full(a);
  if (a.getFullYear() === b.getFullYear()) {
    if (a.getMonth() === b.getMonth()) return `${a.getDate()} a ${full(b)}`;
    return `${a.getDate()} de ${MONTHS[a.getMonth()]} a ${full(b)}`;
  }
  return `${full(a)} a ${full(b)}`;
}

const daysText = (n) => (n === 1 ? '1 dia' : `${n} dias`);

/** Resolve o período escolhido. custom = { de, ate } */
export function resolvePeriod(id, custom = {}) {
  const T = today();
  let from = T; let to = T; let label = 'Hoje';
  switch (id) {
    case 'semana': from = startOfWeek(T); label = 'Esta semana'; break;
    case '7d': from = addDays(T, -6); label = 'Últimos 7 dias'; break;
    case 'mes': from = startOfMonth(T); label = 'Este mês'; break;
    case '30d': from = addDays(T, -29); label = 'Últimos 30 dias'; break;
    case 'tudo': from = firstDataDay() < T ? firstDataDay() : T; label = 'Tudo'; break;
    case 'custom':
      if (isValidISODate(custom.de) && isValidISODate(custom.ate) && custom.de <= custom.ate) {
        from = custom.de; to = custom.ate > T ? T : custom.ate; label = 'Personalizado';
      } else { from = addDays(T, -13); label = 'Personalizado'; }
      break;
    default: id = 'hoje';
  }
  const days = diffDays(from, to) + 1;
  return { id, from, to, days, label, range: rangeText(from, to), daysText: daysText(days) };
}

/** Período anterior equivalente (mesmo tamanho, imediatamente antes). */
export function previousPeriod(p) {
  if (p.id === 'tudo') return null;
  if (p.id === 'hoje') { const d = addDays(p.from, -1); return { from: d, to: d, days: 1, label: 'ontem', range: rangeText(d, d) }; }
  if (p.id === 'semana') { const f = addDays(p.from, -7); const t = addDays(p.to, -7); return { from: f, to: t, days: p.days, label: 'semana anterior', range: rangeText(f, t) }; }
  if (p.id === 'mes') {
    const f = addMonths(p.from, -1);
    const lastDay = new Date(parseISODate(f).getFullYear(), parseISODate(f).getMonth() + 1, 0).getDate();
    const day = Math.min(parseISODate(p.to).getDate(), lastDay);
    const t = `${f.slice(0, 8)}${String(day).padStart(2, '0')}`;
    return { from: f, to: t, days: diffDays(f, t) + 1, label: 'mês anterior', range: rangeText(f, t) };
  }
  const t = addDays(p.from, -1); const f = addDays(t, -(p.days - 1));
  return { from: f, to: t, days: p.days, label: `${daysText(p.days)} anteriores`, range: rangeText(f, t) };
}

/** Período de comparação escolhido pelo usuário: começa em `de`, com o mesmo tamanho. */
export function customCompare(p, de) {
  if (!isValidISODate(de)) return null;
  const t = addDays(de, p.days - 1);
  return { from: de, to: t, days: p.days, label: `período de ${formatDay(de)}`, range: rangeText(de, t) };
}

/** Agrupamentos que fazem sentido para o tamanho do período. */
export function granularities(p) {
  if (p.days <= 14) return ['dia'];
  if (p.days <= 92) return ['dia', 'semana'];
  return ['semana', 'mes'];
}
export const defaultGranularity = (p) => (p.days <= 31 ? 'dia' : p.days <= 92 ? 'semana' : 'mes');
export const GRAN_LABEL = { dia: 'Por dia', semana: 'Por semana', mes: 'Por mês' };

/** Intervalos [start, end) do período no agrupamento escolhido. */
export function buckets(from, to, gran) {
  const out = [];
  const end = addDays(to, 1);
  let cur = from;
  while (cur < end) {
    let next;
    if (gran === 'semana') next = addDays(startOfWeek(cur), 7);
    else if (gran === 'mes') next = addMonths(startOfMonth(cur), 1);
    else next = addDays(cur, 1);
    if (next > end) next = end;
    const d = parseISODate(cur);
    out.push({
      start: cur, end: next,
      label: gran === 'mes' ? `${MONTHS_SHORT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` : formatDay(cur),
      long: gran === 'dia' ? formatDay(cur, { withYear: false }) : gran === 'semana' ? `Semana de ${formatDay(cur)}` : `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`,
    });
    cur = next;
  }
  return out;
}
