/**
 * Dinheiro é sempre guardado em centavos (inteiros) para evitar erros de ponto flutuante.
 * A formatação evita precisão falsa: estimativas são arredondadas para valores "redondos".
 */

const moneyWhole = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const moneyCents = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const count2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function formatMoney(cents) {
  if (!Number.isFinite(cents)) return '—';
  return (cents % 100 === 0 ? moneyWhole : moneyCents).format(cents / 100);
}

/** Arredonda para um valor "humano" — usado em estimativas. */
export function roundFriendly(v) {
  const a = Math.abs(v);
  const step = a < 100 ? 1 : a < 1000 ? 10 : a < 10000 ? 50 : 100;
  return Math.round(v / step) * step;
}

/** Valor aproximado em reais (sem centavos, arredondado). */
export function formatMoneyApprox(cents) {
  if (!Number.isFinite(cents)) return '—';
  return moneyWhole.format(roundFriendly(cents / 100));
}

/**
 * Aceita "8.500", "8500", "8.500,50", "R$ 1.234,5", "8500.5".
 * Retorna centavos (inteiro) ou null quando não dá para entender.
 */
export function parseMoney(input) {
  if (input == null) return null;
  let s = String(input).replace(/R\$/gi, '').replace(/[\s ]/g, '');
  if (!s) return null;
  let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s)) return null;
  let normalized;
  if (s.includes(',')) {
    if ((s.match(/,/g) || []).length > 1) return null;
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes('.')) {
    const parts = s.split('.');
    const last = parts[parts.length - 1];
    if (parts.length === 2 && last.length <= 2) normalized = s;
    else if (parts.slice(1).every((p) => p.length === 3)) normalized = parts.join('');
    else return null;
  } else normalized = s;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * (neg ? -1 : 1);
}

/** Número simples (quantidades): aceita vírgula decimal. */
export function parseNumber(input) {
  if (input == null) return null;
  const s = String(input).trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export const formatCount = (n) => (Number.isFinite(n) ? count2.format(n) : '—');
export const formatCount1 = (n) => (Number.isFinite(n) ? count1.format(n) : '—');

/**
 * Porcentagem sem precisão falsa: 1 casa decimal, 2 apenas quando o valor é exato (21,25%).
 * Nunca mostra 100% antes de a meta estar realmente completa.
 */
export function formatPercent(ratio) {
  if (!Number.isFinite(ratio)) return '—';
  let p = ratio * 100;
  if (p > 0 && p < 0.1) return '<0,1%';
  if (ratio < 1 && p >= 99.95) p = 99.9;
  const two = Math.round(p * 100) / 100;
  const oneDigitExact = Math.abs(Math.round(two * 10) - two * 10) < 1e-6;
  const twoDigitExact = Math.abs(two - p) < 1e-9;
  const digits = !oneDigitExact && twoDigitExact ? 2 : 1;
  const value = digits === 1 ? Math.round(p * 10) / 10 : two;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(value)}%`;
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const TIMES = ['nenhuma vez', 'uma vez', 'duas vezes', 'três vezes', 'quatro vezes', 'cinco vezes', 'seis vezes'];
export const timesText = (n) => TIMES[n] || `${n} vezes`;
