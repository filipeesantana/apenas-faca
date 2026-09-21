/**
 * Datas de calendário são guardadas como strings locais "YYYY-MM-DD".
 * Isso evita erros de fuso horário (uma tarefa "para hoje" nunca vira "ontem" por UTC).
 * Momentos (criação, conclusão) são timestamps em milissegundos.
 */

export const DAY = 86400000;
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

/** Número do dia independente de horário de verão. */
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

export const dayKey = (ts) => toISODate(new Date(ts));
export const startOfDayTs = (s) => parseISODate(s).getTime();
/** Início do dia, `n` dias atrás. daysAgoTs(0) = início de hoje. */
export const daysAgoTs = (n) => startOfDayTs(addDays(today(), -n));
export const daysSince = (ts) => diffDays(dayKey(ts), today());

/** Domingo da semana corrente (se hoje é domingo, hoje). */
export function endOfWeek(s = today()) {
  const dow = parseISODate(s).getDay();
  return addDays(s, dow === 0 ? 0 : 7 - dow);
}

/** Segunda-feira da semana corrente. */
export function startOfWeek(s = today()) {
  const dow = (parseISODate(s).getDay() + 6) % 7;
  return addDays(s, -dow);
}

/** Próxima segunda-feira (nunca hoje). */
export function nextMonday(s = today()) {
  const dow = parseISODate(s).getDay();
  const add = (8 - dow) % 7 || 7;
  return addDays(s, add);
}

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

export function formatToday(d = new Date()) {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export const weekdayShort = (s) => WEEKDAYS_SHORT[parseISODate(s).getDay()];

/** Rótulo humano de prazo: "hoje", "amanhã", "sexta", "atrasada há 3 dias". */
export function formatDue(s, ref = today()) {
  const d = diffDays(ref, s);
  if (d < -1) return `atrasada há ${-d} dias`;
  if (d === -1) return 'era para ontem';
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d < 7) return WEEKDAYS[parseISODate(s).getDay()].replace('-feira', '');
  return formatDay(s);
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

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Boa noite';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}
