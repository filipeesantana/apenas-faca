/**
 * Camada financeira do Norte — entidades e consultas.
 *
 * Princípio: o Norte pergunta, o usuário define, o Norte calcula, o usuário decide.
 * Nada aqui classifica um gasto como bom, ruim, supérfluo ou cortável: essa leitura
 * é do usuário (natureza + flexibilidade). O módulo só soma, agrupa e compara.
 *
 * Dinheiro sempre em centavos inteiros. Datas em AAAA-MM-DD (calendário local).
 */
import { state, commit } from '../core/store.js';
import { makeEvent } from '../core/events.js';
import { uid } from '../utils/helpers.js';
import { today, addMonths, parseISODate, isValidISODate, MONTH_DAYS } from '../utils/dates.js';

/* ---------- Vocabulário (definido pelo usuário, nunca julgado pelo sistema) ---------- */

export const OUT_CATEGORIES = [
  { id: 'alimentacao', label: 'Alimentação' },
  { id: 'transporte', label: 'Transporte' },
  { id: 'moradia', label: 'Moradia' },
  { id: 'saude', label: 'Saúde' },
  { id: 'estudos', label: 'Estudos' },
  { id: 'lazer', label: 'Lazer' },
  { id: 'compras', label: 'Compras' },
  { id: 'dividas', label: 'Dívidas' },
  { id: 'assinaturas', label: 'Assinaturas' },
  { id: 'outro', label: 'Outro' },
];

export const IN_CATEGORIES = [
  { id: 'salario', label: 'Salário' },
  { id: 'freelance', label: 'Freelance' },
  { id: 'beneficio', label: 'Benefício' },
  { id: 'comissao', label: 'Comissão' },
  { id: 'outro', label: 'Outro' },
];

/** Como o usuário considera o gasto. Não é julgamento do Norte. */
export const NATURES = [
  { id: 'necessario', label: 'Necessário', desc: 'Não dá para deixar de pagar.' },
  { id: 'importante', label: 'Importante', desc: 'Faz diferença na sua vida.' },
  { id: 'flexivel', label: 'Flexível', desc: 'Dá para variar conforme o mês.' },
  { id: 'pontual', label: 'Pontual', desc: 'Aconteceu desta vez, não é de todo mês.' },
];

/** Quanto o usuário aceitaria ajustar este gasto numa simulação. */
export const FLEX_LEVELS = [
  { id: 'none', label: 'Não mexer', desc: 'Nunca aparece em simulações de ajuste.', margin: 0 },
  { id: 'small', label: 'Pequena margem', desc: 'Daria para reduzir um pouco.', margin: 0.1 },
  { id: 'moderate', label: 'Moderada', desc: 'Daria para reduzir bastante.', margin: 0.2 },
  { id: 'high', label: 'Alta', desc: 'Daria para reduzir muito.', margin: 0.35 },
  { id: 'unknown', label: 'Não sei', desc: 'Fica de fora das simulações por enquanto.', margin: 0 },
];

export const FREQS = [
  { id: 'month', label: 'Mensal', perMonth: 1 },
  { id: 'biweek', label: 'Quinzenal', perMonth: 2 },
  { id: 'week', label: 'Semanal', perMonth: MONTH_DAYS / 7 },
];

export const categoryLabel = (id, kind = 'out') =>
  (kind === 'in' ? IN_CATEGORIES : OUT_CATEGORIES).find((c) => c.id === id)?.label || 'Outro';
export const natureLabel = (id) => NATURES.find((n) => n.id === id)?.label || '—';
export const flexLabel = (id) => FLEX_LEVELS.find((f) => f.id === id)?.label || '—';
export const flexMargin = (id) => FLEX_LEVELS.find((f) => f.id === id)?.margin || 0;

/* ---------- Ativação ---------- */

export const finance = () => state.settings.finance || {};
export const financeEnabled = () => !!finance().enabled;

/** Liga a camada financeira. Não apaga nem altera nada do que já existe. */
export async function enableFinance(reason = 'manual') {
  if (financeEnabled()) return null;
  return commit({
    settings: { finance: { ...finance(), enabled: true, activatedAt: Date.now(), reason } },
    events: [makeEvent('finance.enabled', null, { reason })],
  });
}

export const disableFinance = () => commit({ settings: { finance: { ...finance(), enabled: false } } });

/** Estado de dicas contextuais dispensadas ("agora não"). */
export function dismissHint(key, days = 21) {
  const hints = { ...(finance().hints || {}), [key]: Date.now() + days * 86400000 };
  return commit({ settings: { finance: { ...finance(), hints } } });
}
export const hintDismissed = (key) => (finance().hints?.[key] || 0) > Date.now();

/* ---------- Meses ---------- */

export const monthOf = (date) => String(date).slice(0, 7);
export const thisMonth = () => monthOf(today());
export const monthStart = (ym) => `${ym}-01`;
export const nextMonth = (ym) => monthOf(addMonths(monthStart(ym), 1));
export const prevMonth = (ym) => monthOf(addMonths(monthStart(ym), -1));

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function monthLabel(ym, { year = 'auto' } = {}) {
  const d = parseISODate(monthStart(ym));
  const showYear = year === true || (year === 'auto' && ym.slice(0, 4) !== thisMonth().slice(0, 4));
  return `${MONTHS[d.getMonth()]}${showYear ? ` de ${d.getFullYear()}` : ''}`;
}
export const monthShort = (ym) => `${MONTHS[parseISODate(monthStart(ym)).getMonth()].slice(0, 3)}/${ym.slice(2, 4)}`;

/* ---------- Consultas ---------- */

export const allMoney = () => [...state.money.values()];
export const allRecurring = () => [...state.recurring.values()].filter((r) => r.active !== false);
export const hasMoneyData = () => state.money.size > 0 || state.recurring.size > 0;

export const transactionsIn = (ym) => allMoney().filter((t) => monthOf(t.date) === ym).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

export const monthsWithData = () => [...new Set(allMoney().map((t) => monthOf(t.date)))].sort();

/** Quanto foi guardado em metas de dinheiro no mês (avanços positivos registrados). */
export function goalContributions(ym) {
  const from = parseISODate(monthStart(ym)).getTime();
  const to = parseISODate(monthStart(nextMonth(ym))).getTime();
  const byGoal = new Map();
  let total = 0;
  for (const e of state.events) {
    if (e.type !== 'goal.progress' || e.createdAt < from || e.createdAt >= to) continue;
    const type = e.metadata?.goalType || state.goals.get(e.entityId)?.type;
    if (type !== 'money' || e.metadata?.kind === 'correction') continue;
    const d = e.metadata.delta;
    if (!(d > 0)) continue;
    total += d;
    byGoal.set(e.entityId, (byGoal.get(e.entityId) || 0) + d);
  }
  return { total, byGoal };
}

/** Resumo de um mês: entrou, saiu, metas, disponível, distribuição. */
export function monthSummary(ym = thisMonth()) {
  const list = transactionsIn(ym);
  const byCategory = new Map();
  const byNature = new Map();
  let income = 0; let spent = 0; let flexible = 0;
  for (const t of list) {
    if (t.kind === 'in') { income += t.amountCents; continue; }
    spent += t.amountCents;
    byCategory.set(t.categoryId, (byCategory.get(t.categoryId) || 0) + t.amountCents);
    byNature.set(t.nature || 'importante', (byNature.get(t.nature || 'importante') || 0) + t.amountCents);
    if (flexMargin(t.flex) > 0) flexible += t.amountCents;
  }
  const goals = goalContributions(ym);
  return {
    ym, list, income, spent, toGoals: goals.total, byGoal: goals.byGoal,
    available: income - spent - goals.total,
    byCategory, byNature, flexible, count: list.length,
  };
}

/** Renda mensal de referência: recorrente, média dos meses fechados ou o mês atual. */
export function incomeMonthly() {
  const manual = finance().incomeOverrideCents;
  const recur = allRecurring().filter((r) => r.kind === 'in');
  const fixed = recur.filter((r) => !r.variable);
  const variable = recur.some((r) => r.variable);
  if (fixed.length) {
    const cents = fixed.reduce((a, r) => a + r.amountCents * (FREQS.find((f) => f.id === r.freq)?.perMonth || 1), 0);
    return { cents: Math.round(cents), kind: 'recorrente', variable, has: true };
  }
  const months = monthsWithData().filter((m) => m < thisMonth());
  const closed = months.slice(-3).map((m) => allMoney().filter((t) => t.kind === 'in' && monthOf(t.date) === m).reduce((a, t) => a + t.amountCents, 0)).filter((v) => v > 0);
  if (closed.length >= 2) return { cents: Math.round(closed.reduce((a, b) => a + b, 0) / closed.length), kind: 'media', months: closed.length, variable: true, has: true };
  const now = allMoney().filter((t) => t.kind === 'in' && monthOf(t.date) === thisMonth()).reduce((a, t) => a + t.amountCents, 0);
  if (now > 0) return { cents: now, kind: 'mes', variable, has: true };
  if (manual > 0) return { cents: manual, kind: 'manual', variable: true, has: true };
  return { cents: 0, kind: 'nenhuma', variable: false, has: false };
}

/** Compromissos previstos do mês (recorrentes), somados por tipo. */
export function recurringMonthly() {
  const items = allRecurring();
  const perMonth = (r) => Math.round(r.amountCents * (FREQS.find((f) => f.id === r.freq)?.perMonth || 1));
  const out = items.filter((r) => r.kind === 'out');
  return {
    items,
    plannedIn: items.filter((r) => r.kind === 'in').reduce((a, r) => a + perMonth(r), 0),
    plannedOut: out.reduce((a, r) => a + perMonth(r), 0),
    outItems: out.map((r) => ({ ...r, perMonth: perMonth(r) })),
  };
}

/** Média mensal de uma categoria nos últimos meses com registro. */
export function categoryAverage(categoryId, months = 3) {
  const list = allMoney().filter((t) => t.kind === 'out' && t.categoryId === categoryId);
  if (!list.length) return { cents: 0, months: 0 };
  const keys = [...new Set(list.map((t) => monthOf(t.date)))].sort().slice(-months);
  const total = list.filter((t) => keys.includes(monthOf(t.date))).reduce((a, t) => a + t.amountCents, 0);
  return { cents: Math.round(total / keys.length), months: keys.length };
}

/**
 * Categorias que o usuário marcou como ajustáveis (margem > 0).
 * Gastos "Não mexer" e "Não sei" nunca entram aqui — nem em nenhuma simulação de ajuste.
 */
export function adjustableCategories() {
  const map = new Map();
  for (const t of allMoney()) {
    if (t.kind !== 'out' || flexMargin(t.flex) <= 0) continue;
    const cur = map.get(t.categoryId) || { categoryId: t.categoryId, total: 0, months: new Set(), maxMargin: 0, flex: t.flex };
    cur.total += t.amountCents;
    cur.months.add(monthOf(t.date));
    if (flexMargin(t.flex) > cur.maxMargin) { cur.maxMargin = flexMargin(t.flex); cur.flex = t.flex; }
    map.set(t.categoryId, cur);
  }
  return [...map.values()]
    .map((c) => ({ ...c, monthCount: c.months.size, avgMonth: Math.round(c.total / c.months.size) }))
    .filter((c) => c.avgMonth > 0)
    .sort((a, b) => b.avgMonth - a.avgMonth);
}

export const hasIncomeInfo = () => incomeMonthly().has;
export const hasExpenses = () => allMoney().some((t) => t.kind === 'out');

/* ---------- Escrita ---------- */

const clean = (s, max = 80) => String(s || '').trim().slice(0, max);

export async function addTransaction({ kind, amountCents, date = today(), categoryId = 'outro', label = '', nature = null, flex = 'unknown', recurringId = null, note = '' }) {
  if (!['in', 'out'].includes(kind)) throw new Error('Tipo de movimentação inválido.');
  if (!(amountCents > 0)) { const err = new Error('Informe um valor maior que zero.'); err.userMessage = 'Informe um valor maior que zero.'; throw err; }
  if (!isValidISODate(date)) date = today();
  const now = Date.now();
  const t = {
    id: uid(), kind, amountCents: Math.round(amountCents), date, categoryId,
    label: clean(label), nature: kind === 'out' ? (nature || 'importante') : null,
    flex: kind === 'out' ? (flex || 'unknown') : null,
    recurringId, note: clean(note, 300), createdAt: now, updatedAt: now,
  };
  const ev = makeEvent(kind === 'in' ? 'money.in' : 'money.out', { id: t.id, title: t.label || categoryLabel(categoryId, kind) },
    { amountCents: t.amountCents, categoryId, nature: t.nature, flex: t.flex, date }, now);
  await commit({ put: { money: [t] }, events: [ev] });
  return t;
}

export async function updateTransaction(id, patch) {
  const t = state.money.get(id);
  if (!t) throw new Error('Movimentação não encontrada.');
  const next = { ...t, ...patch, updatedAt: Date.now() };
  await commit({ put: { money: [next] } });
  return next;
}

export function deleteTransaction(id) {
  const t = state.money.get(id);
  if (!t) return Promise.resolve(null);
  const evs = state.events.filter((e) => e.entityId === id).map((e) => e.id);
  return commit({ del: { money: [id] }, dropEvents: evs });
}

export async function addRecurring({ kind, amountCents, label = '', categoryId = 'outro', nature = 'necessario', flex = 'unknown', freq = 'month', dayOfMonth = null, variable = false }) {
  if (!(amountCents > 0) && !variable) { const err = new Error('Informe um valor maior que zero.'); err.userMessage = 'Informe um valor maior que zero.'; throw err; }
  const now = Date.now();
  const r = {
    id: uid(), kind, amountCents: Math.round(amountCents || 0), label: clean(label), categoryId,
    nature: kind === 'out' ? nature : null, flex: kind === 'out' ? flex : null,
    freq, dayOfMonth, variable: !!variable, active: true, createdAt: now, updatedAt: now,
  };
  await commit({ put: { recurring: [r] } });
  return r;
}

export const updateRecurring = (id, patch) => {
  const r = state.recurring.get(id);
  if (!r) throw new Error('Registro não encontrado.');
  return commit({ put: { recurring: [{ ...r, ...patch, updatedAt: Date.now() }] } });
};

export const removeRecurring = (id) => commit({ del: { recurring: [id] } });

/** Renda para planejamento quando a pessoa prefere informar um valor de referência. */
export const setIncomeOverride = (cents) => commit({ settings: { finance: { ...finance(), incomeOverrideCents: cents || null } } });
