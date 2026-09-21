/**
 * Datas de calendário: strings locais "AAAA-MM-DD" (imunes a fuso horário).
 * Momentos (criação, conclusão): timestamps em milissegundos.
 */

export const DAY = 86400000;
export const MONTH_DAYS = 30.4375;
const pad = (n) => String(n).padStart(2, '0');

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function toISODate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const today = () => toISODate(new Date());

export function parseISODate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return !Number.isNaN(d.getTime()) && toISODate(d) === s;
}

function dayNum(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
}

/** Dias de `from` até `to` (positivo se `to` é depois). */
export const diffDays = (from, to) => dayNum(to) - dayNum(from);

export function addDays(s, n) {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Soma meses sem "estourar" o fim do mês (31/jan + 1 mês = 28/29 fev). */
export function addMonths(s, n) {
  const d = parseISODate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

export const dayKey = (ts) => toISODate(new Date(ts));
export const startOfDayTs = (s) => parseISODate(s).getTime();
export const endOfDayTs = (s) => startOfDayTs(addDays(s, 1));
export const daysAgoTs = (n) => startOfDayTs(addDays(today(), -n));
export const daysSince = (ts) => diffDays(dayKey(ts), today());

/** Domingo da semana corrente (semana de segunda a domingo). */
export function endOfWeek(s = today()) {
  const dow = parseISODate(s).getDay();
  return addDays(s, dow === 0 ? 0 : 7 - dow);
}
export function startOfWeek(s = today()) {
  const dow = (parseISODate(s).getDay() + 6) % 7;
  return addDays(s, -dow);
}
export function nextMonday(s = today()) {
  const dow = parseISODate(s).getDay();
  return addDays(s, (8 - dow) % 7 || 7);
}
export const startOfMonth = (s = today()) => `${s.slice(0, 7)}-01`;

export function formatDay(s, { withYear = false } = {}) {
  const d = parseISODate(s);
  const showYear = withYear || d.getFullYear() !== new Date().getFullYear();
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${showYear ? ` ${d.getFullYear()}` : ''}`;
}
export function formatDayLong(s) {
  const d = parseISODate(s);
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}
export function formatMonthYear(date) {
  const d = date instanceof Date ? date : parseISODate(date);
  return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}
export function formatMonthShort(date) {
  const d = date instanceof Date ? date : parseISODate(date);
  return `${MONTHS_SHORT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}
export const formatToday = (d = new Date()) => `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
export const weekdayShort = (s) => WEEKDAYS_SHORT[parseISODate(s).getDay()];

/** Rótulo curto de prazo: "hoje", "amanhã", "sexta", "atrasada há 3 dias", "30 set". */
export function formatDue(s, ref = today()) {
  const d = diffDays(ref, s);
  if (d < -1) return `atrasada há ${-d} dias`;
  if (d === -1) return 'era para ontem';
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d < 7) return WEEKDAYS[parseISODate(s).getDay()].replace('-feira', '');
  return formatDay(s);
}

/** Distância humana até uma data: "Faltam 9 dias.", "É amanhã.", "Passou há 3 dias." */
export function distanceText(s, ref = today()) {
  const d = diffDays(ref, s);
  if (d === 0) return 'É hoje.';
  if (d === 1) return 'É amanhã.';
  if (d === -1) return 'Foi ontem.';
  if (d < 0) return `Passou há ${-d} dias.`;
  if (d < 60) return `Faltam ${d} dias.`;
  const months = Math.round(d / MONTH_DAYS);
  if (months < 24) return `Faltam cerca de ${months} meses.`;
  const years = Math.round((d / 365.25) * 2) / 2;
  return `Faltam cerca de ${String(years).replace('.', ',')} anos.`;
}

export function relativeTime(ts, now = Date.now()) {
  const min = Math.round((now - ts) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const days = diffDays(dayKey(ts), dayKey(now));
  if (days === 0) return `há ${Math.round(min / 60)} h`;
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return formatDay(dayKey(ts));
}

export function formatDateTime(ts) {
  const d = new Date(ts);
  return `${formatDay(dayKey(ts))}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Duração aproximada em dias → texto sem precisão falsa. */
export function approxDuration(days) {
  if (!Number.isFinite(days)) return '—';
  const d = Math.max(1, Math.round(days));
  if (d < 14) return `${d} ${d === 1 ? 'dia' : 'dias'}`;
  if (d < 60) return `${Math.round(d / 7)} semanas`;
  const months = Math.round(d / MONTH_DAYS);
  if (months < 24) return `${months} meses`;
  const years = Math.round((d / 365.25) * 2) / 2;
  return `${String(years).replace('.', ',')} anos`;
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Boa noite';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}
