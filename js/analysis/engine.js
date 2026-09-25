/**
 * Motor de análise — só cálculo, sem DOM.
 *
 * Entrada: uma seleção { scope: 'tudo'|'area'|'meta'|'tarefas', areaId, goalId, period, compare }.
 * Saída: resumo (métricas + frase), séries para gráficos, comparação, planejado × realizado.
 * Resultados são memorizados por "versão dos dados": qualquer alteração no banco invalida o cache.
 */
import { state, subscribe } from '../core/store.js';
import { openTasks, isOverdue, isOpen, tasksForGoal } from '../domain/tasks.js';
import { activeGoals, progressOf, formatGoalValue, lastMovementAt, paceOf } from '../domain/goals.js';
import { getArea, listAreas } from '../domain/areas.js';
import { plannedVsDone, recentCapacity, thisWeekLoad } from '../domain/stats.js';
import { allMoney, financeEnabled, incomeMonthly, categoryLabel, natureLabel, NATURES, flexMargin } from '../domain/money.js';
import { startOfDayTs, today, addDays, startOfWeek } from '../utils/dates.js';
import { formatMoney, formatMinutes, formatPercent, plural } from '../utils/numbers.js';
import { buckets, firstDataDay } from './periods.js';

/* ---------- Cache por versão dos dados ---------- */
let version = 0;
subscribe(() => { version++; });
const cache = new Map();
export function memo(key, fn) {
  const k = `${version}|${key}`;
  if (cache.has(k)) return cache.get(k);
  if (cache.size > 80) cache.clear();
  const v = fn();
  cache.set(k, v);
  return v;
}

/* ---------- Escopos ---------- */
export const SCOPES = {
  tudo: { label: 'Tudo', desc: 'Visão geral das suas tarefas, metas e progresso.' },
  area: { label: 'Área', desc: 'Trabalho, Estudos, Dinheiro, Saúde ou outra área.' },
  meta: { label: 'Meta', desc: 'O progresso de uma meta específica.' },
  tarefas: { label: 'Tarefas', desc: 'Execução, atrasos e adiamentos.' },
  dinheiro: { label: 'Dinheiro', desc: 'O que entrou, o que saiu e o que foi para metas.', finance: true },
};

/** Escopos disponíveis agora (Dinheiro só aparece com a camada financeira ativada). */
export const availableScopes = () => Object.entries(SCOPES).filter(([, s2]) => !s2.finance || financeEnabled());

/** Normaliza a seleção (ex.: área apagada volta para "Tudo"). */
export function normalizeSelection(sel) {
  const s = { ...sel };
  if (s.scope === 'dinheiro' && !financeEnabled()) s.scope = 'tudo';
  if (s.scope === 'area' && !getArea(s.areaId)) s.areaId = listAreas()[0]?.id || null;
  if (s.scope === 'area' && !s.areaId) s.scope = 'tudo';
  if (s.scope === 'meta' && !state.goals.has(s.goalId)) s.goalId = activeGoals()[0]?.id || [...state.goals.keys()][0] || null;
  if (s.scope === 'meta' && !s.goalId) s.scope = 'tudo';
  return s;
}

export function scopeLabel(sel) {
  if (sel.scope === 'area') return `Área: ${getArea(sel.areaId)?.name || '—'}`;
  if (sel.scope === 'meta') return `Meta: ${state.goals.get(sel.goalId)?.title || '—'}`;
  return SCOPES[sel.scope]?.label || 'Tudo';
}

/** Predicados de escopo para tarefas, eventos e metas. */
export function scopeMatchers(sel) {
  const taskOk = (t) => {
    if (sel.scope === 'dinheiro') return false;
    if (sel.scope === 'area') return t.areaId === sel.areaId;
    if (sel.scope === 'meta') return t.goalId === sel.goalId;
    return true;
  };
  const eventOk = (e) => {
    if (sel.scope === 'dinheiro') return e.entityType === 'money';
    if (sel.scope === 'tarefas') return e.entityType === 'task';
    if (sel.scope === 'area') return e.areaId === sel.areaId;
    if (sel.scope === 'meta') return e.entityId === sel.goalId || (e.entityType === 'task' && (e.metadata?.goalId === sel.goalId || state.tasks.get(e.entityId)?.goalId === sel.goalId));
    return true;
  };
  const goalOk = (g) => {
    if (sel.scope === 'dinheiro') return g.type === 'money';
    if (sel.scope === 'tarefas') return false;
    if (sel.scope === 'area') return g.areaId === sel.areaId;
    if (sel.scope === 'meta') return g.id === sel.goalId;
    return true;
  };
  const taskIdOk = (id) => {
    const t = state.tasks.get(id);
    if (t) return taskOk(t);
    const ev = state.events.find((e) => e.entityId === id && e.type === 'task.created');
    return ev ? taskOk({ areaId: ev.areaId, goalId: ev.metadata?.goalId }) : false;
  };
  return { taskOk, eventOk, goalOk, taskIdOk };
}

/* ---------- Contagem de um intervalo ---------- */
const goalTypeOf = (e) => e.metadata?.goalType || state.goals.get(e.entityId)?.type;

export function tally(sel, from, to) {
  const { eventOk } = scopeMatchers(sel);
  const fromTs = startOfDayTs(from);
  const toTs = startOfDayTs(addDays(to, 1));
  const completed = new Set(); const goalsMoved = new Set();
  const out = { created: 0, postponed: 0, dropped: 0, moneyIn: 0, moneyOut: 0, minutes: 0, units: 0, estMin: 0, progressEvents: 0, advance: 0, areaCounts: new Map() };
  for (const e of state.events) {
    if (e.createdAt < fromTs || e.createdAt >= toTs || !eventOk(e)) continue;
    switch (e.type) {
      case 'task.completed':
        if (!completed.has(e.entityId)) { completed.add(e.entityId); out.estMin += e.metadata?.estimateMin || 0; }
        break;
      case 'task.created': out.created++; break;
      case 'task.postponed': out.postponed++; break;
      case 'task.dropped': out.dropped++; break;
      case 'goal.step': goalsMoved.add(e.entityId); if (e.metadata?.done) { out.progressEvents++; out.advance++; } break;
      case 'goal.progress': {
        goalsMoved.add(e.entityId);
        if (e.metadata?.kind === 'correction') break;
        out.progressEvents++;
        const d = e.metadata.delta;
        out.advance += d;
        const type = goalTypeOf(e);
        if (type === 'money') { if (d > 0) out.moneyIn += d; else out.moneyOut -= d; }
        else if (type === 'time' && d > 0) out.minutes += d;
        else if (type === 'count' && d > 0) out.units += d;
        break;
      }
      default:
    }
    const isWork = e.type === 'task.completed' || (e.type === 'goal.progress' && e.metadata?.delta > 0 && e.metadata?.kind !== 'correction') || (e.type === 'goal.step' && e.metadata?.done);
    if (isWork) { const k = e.areaId && state.areas.has(e.areaId) ? e.areaId : null; out.areaCounts.set(k, (out.areaCounts.get(k) || 0) + 1); }
  }
  out.completed = completed.size;
  out.goalsMoved = goalsMoved.size;
  return out;
}

/** Existem dados que cubram o período? (evita comparar com o "nada"). */
export const hasDataFor = (p) => !!state.events.length && p.to >= firstDataDay();

/* ---------- Dinheiro ---------- */

/** Entradas, saídas e destinação a metas num intervalo de datas (pelas datas das movimentações). */
export function moneyRange(from, to) {
  return memo(`money|${from}|${to}`, () => {
    const byCategory = new Map(); const byNature = new Map();
    let income = 0; let spent = 0; let flexible = 0; let count = 0;
    for (const t of allMoney()) {
      if (t.date < from || t.date > to) continue;
      count++;
      if (t.kind === 'in') { income += t.amountCents; continue; }
      spent += t.amountCents;
      byCategory.set(t.categoryId, (byCategory.get(t.categoryId) || 0) + t.amountCents);
      byNature.set(t.nature || 'importante', (byNature.get(t.nature || 'importante') || 0) + t.amountCents);
      if (flexMargin(t.flex) > 0) flexible += t.amountCents;
    }
    const fromTs = startOfDayTs(from); const toTs = startOfDayTs(addDays(to, 1));
    let toGoals = 0;
    for (const e of state.events) {
      if (e.type !== 'goal.progress' || e.createdAt < fromTs || e.createdAt >= toTs) continue;
      const type = e.metadata?.goalType || state.goals.get(e.entityId)?.type;
      if (type !== 'money' || e.metadata?.kind === 'correction' || !(e.metadata.delta > 0)) continue;
      toGoals += e.metadata.delta;
    }
    return { income, spent, toGoals, flexible, count, byCategory, byNature, available: income - spent - toGoals };
  });
}

/* ---------- Resumo ---------- */

function nowState(sel) {
  const { taskOk, goalOk } = scopeMatchers(sel);
  const open = openTasks().filter(taskOk);
  return { open, overdue: open.filter((t) => isOverdue(t)), goals: activeGoals().filter(goalOk) };
}

const signed = (n, fmt = String) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');

/**
 * Métricas do resumo para o escopo. Cada métrica: { id, label, value, display, hint, href, compare? }.
 * `now: true` indica situação de hoje (não comparável entre períodos).
 */
export function summary(sel, period, prev = null) {
  return memo(`sum|${JSON.stringify(sel)}|${period.from}|${period.to}|${prev?.from || ''}`, () => {
    const cur = tally(sel, period.from, period.to);
    const old = prev ? tally(sel, prev.from, prev.to) : null;
    const now = nowState(sel);
    const m = [];
    const add = (id, label, value, display, extra = {}) => {
      const o = { id, label, value, display: display ?? String(value), ...extra };
      if (old && !extra.now && extra.prevValue !== undefined) {
        const d = value - extra.prevValue;
        o.compare = { prev: extra.prevDisplay ?? String(extra.prevValue), diff: d, diffText: d === 0 ? 'igual' : signed(d, extra.fmt || String) };
      }
      m.push(o);
    };

    if (sel.scope === 'dinheiro') {
      const c = moneyRange(period.from, period.to);
      const o = prev ? moneyRange(prev.from, prev.to) : null;
      const income = incomeMonthly();
      const money = (v) => formatMoney(v);
      add('in', 'Entrou', c.income, money(c.income), { prevValue: o?.income, prevDisplay: o ? money(o.income) : undefined, fmt: money });
      add('out', 'Saiu', c.spent, money(c.spent), { prevValue: o?.spent, prevDisplay: o ? money(o.spent) : undefined, fmt: money });
      add('goals', 'Destinado a metas', c.toGoals, money(c.toGoals), { prevValue: o?.toGoals, prevDisplay: o ? money(o.toGoals) : undefined, fmt: money, href: '#/financas' });
      add('avail', 'Disponível', c.available, money(c.available), {
        prevValue: o?.available, prevDisplay: o ? money(o.available) : undefined, fmt: money, accent: true,
        warn: c.available < 0, hint: income.has && c.income > 0 ? `${formatPercent(c.available / c.income)} do que entrou` : null,
      });
      add('flex', 'Marcados como ajustáveis', c.flexible, money(c.flexible), { prevValue: o?.flexible, prevDisplay: o ? money(o.flexible) : undefined, fmt: money, detail: true, hint: 'definido por você' });
      add('count', 'Movimentações', c.count, String(c.count), { prevValue: o?.count, detail: true });
      return { metrics: m, cur: c, old: o, now: nowState(sel) };
    }

    if (sel.scope === 'meta') {
      const g = state.goals.get(sel.goalId);
      const p = progressOf(g);
      if (g.type === 'steps') {
        add('current', 'Etapas feitas', p.current, `${p.current} de ${p.target}`, { now: true });
      } else {
        add('current', g.type === 'money' ? 'Atual' : 'Feito', p.current, formatGoalValue(g, p.current), { now: true });
        add('target', 'Objetivo', p.target, formatGoalValue(g, p.target), { now: true });
      }
      add('remaining', 'Faltam', p.remaining, p.remaining > 0 ? formatGoalValue(g, p.remaining) : 'nada', { now: true });
      add('pct', 'Progresso', p.ratio, formatPercent(p.ratio), { now: true, accent: true });
      const fmtAdv = (v) => (g.type === 'steps' ? plural(v, 'etapa', 'etapas') : formatGoalValue(g, v));
      add('advance', 'Avanço no período', cur.advance, cur.advance ? `${cur.advance > 0 ? '+' : '−'} ${fmtAdv(Math.abs(cur.advance))}` : 'nenhum',
        { prevValue: old?.advance, prevDisplay: old ? (old.advance ? fmtAdv(Math.abs(old.advance)) : 'nenhum') : undefined, fmt: fmtAdv, detail: true });
      add('records', 'Registros no período', cur.progressEvents, String(cur.progressEvents), { prevValue: old?.progressEvents, detail: true });
      return { metrics: m, cur, old, now };
    }

    const lateHint = now.overdue.length ? `${now.overdue.length} com prazo vencido` : 'nenhuma vencida';
    if (sel.scope === 'tarefas') {
      add('completed', 'Concluídas', cur.completed, null, { prevValue: old?.completed, href: '#/tarefas?ver=concluidas' });
      add('created', 'Criadas', cur.created, null, { prevValue: old?.created });
      add('open', 'Pendentes hoje', now.open.length, null, { now: true, hint: lateHint, href: now.overdue.length ? '#/tarefas?f=atrasadas' : '#/tarefas', warn: now.overdue.length > 0 });
      add('postponed', 'Adiamentos', cur.postponed, null, { prevValue: old?.postponed, href: '#/tarefas?f=travadas', warn: cur.postponed >= 5 });
      add('dropped', 'Canceladas', cur.dropped, null, { prevValue: old?.dropped, detail: true, href: '#/tarefas?ver=canceladas' });
      add('estMin', 'Tempo concluído', cur.estMin, cur.estMin ? formatMinutes(cur.estMin) : '—', { prevValue: old?.estMin, prevDisplay: old ? (old.estMin ? formatMinutes(old.estMin) : '—') : undefined, fmt: formatMinutes, detail: true, hint: 'soma das durações estimadas' });
      return { metrics: m, cur, old, now };
    }

    add('completed', 'Tarefas concluídas', cur.completed, null, { prevValue: old?.completed, href: '#/tarefas?ver=concluidas' });
    add('open', 'Pendentes hoje', now.open.length, null, { now: true, hint: lateHint, href: sel.scope === 'area' ? `#/area/${sel.areaId}` : (now.overdue.length ? '#/tarefas?f=atrasadas' : '#/tarefas'), warn: now.overdue.length > 0 });
    add('postponed', 'Adiamentos', cur.postponed, null, { prevValue: old?.postponed, href: '#/tarefas?f=travadas', warn: cur.postponed >= 5 });
    if (sel.scope === 'area') {
      add('goals', 'Metas ativas', now.goals.length, null, { now: true, href: '#/metas' });
      const reg = cur.minutes ? formatMinutes(cur.minutes) : cur.moneyIn ? formatMoney(cur.moneyIn) : String(cur.progressEvents);
      const regOld = old ? (old.minutes ? formatMinutes(old.minutes) : old.moneyIn ? formatMoney(old.moneyIn) : String(old.progressEvents)) : undefined;
      add('logged', cur.minutes ? 'Tempo registrado' : cur.moneyIn ? 'Guardado em metas' : 'Registros em metas', cur.minutes || cur.moneyIn || cur.progressEvents, reg,
        { prevValue: old ? (cur.minutes ? old.minutes : cur.moneyIn ? old.moneyIn : old.progressEvents) : undefined, prevDisplay: regOld, fmt: cur.minutes ? formatMinutes : cur.moneyIn ? formatMoney : String });
    } else {
      add('goalsMoved', 'Metas movimentadas', cur.goalsMoved, null, { prevValue: old?.goalsMoved, href: '#/metas', hint: `de ${plural(now.goals.length, 'meta ativa', 'metas ativas')}` });
      add('created', 'Tarefas criadas', cur.created, null, { prevValue: old?.created, detail: true });
      add('moneyIn', 'Guardado em metas', cur.moneyIn, cur.moneyIn ? formatMoney(cur.moneyIn) : '—', { prevValue: old?.moneyIn, prevDisplay: old ? (old.moneyIn ? formatMoney(old.moneyIn) : '—') : undefined, fmt: formatMoney, detail: true });
      add('minutes', 'Tempo registrado', cur.minutes, cur.minutes ? formatMinutes(cur.minutes) : '—', { prevValue: old?.minutes, prevDisplay: old ? (old.minutes ? formatMinutes(old.minutes) : '—') : undefined, fmt: formatMinutes, detail: true });
    }
    return { metrics: m, cur, old, now };
  });
}

/* ---------- Frase de resumo (fatos, sem julgamento) ---------- */

const listJoin = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} e ${arr[arr.length - 1]}`);

export function sentence(sel, sum) {
  const { cur, now } = sum;
  if (sel.scope === 'dinheiro') {
    if (!cur.count && !cur.toGoals) return 'Nenhuma movimentação foi registrada neste período.';
    const parts = [];
    if (cur.income) parts.push(`entraram ${formatMoney(cur.income)}`);
    if (cur.spent) parts.push(`saíram ${formatMoney(cur.spent)}`);
    if (cur.toGoals) parts.push(`${formatMoney(cur.toGoals)} foram para metas`);
    const share = cur.income > 0 && cur.toGoals > 0 ? ` As metas receberam ${formatPercent(cur.toGoals / cur.income)} do que entrou.` : '';
    return `Neste período, ${listJoin(parts)}.${share}`;
  }
  if (sel.scope === 'meta') {
    const g = state.goals.get(sel.goalId);
    const p = progressOf(g);
    const base = g.type === 'steps' ? `“${g.title}” tem ${p.current} de ${p.target} etapas concluídas.` : `“${g.title}” está em ${formatPercent(p.ratio)}: ${formatGoalValue(g, p.current)} de ${formatGoalValue(g, p.target)}.`;
    if (!cur.progressEvents) return `${base} Neste período, não houve registro de progresso.`;
    const adv = g.type === 'steps' ? plural(cur.advance, 'etapa concluída', 'etapas concluídas') : `${cur.advance >= 0 ? 'avanço de' : 'redução de'} ${formatGoalValue(g, Math.abs(cur.advance))}`;
    return `${base} Neste período: ${adv}, em ${plural(cur.progressEvents, 'registro', 'registros')}.`;
  }
  if (sel.scope === 'tarefas') {
    if (!cur.created && !cur.completed && !cur.postponed) return `Não houve movimento nas tarefas neste período. Hoje há ${plural(now.open.length, 'tarefa pendente', 'tarefas pendentes')}.`;
    const saldo = cur.created - cur.completed;
    return `Foram criadas ${cur.created} e concluídas ${cur.completed} tarefas. ${saldo > 0 ? `A lista aumentou em ${saldo}` : saldo < 0 ? `A lista diminuiu em ${-saldo}` : 'A lista ficou do mesmo tamanho'}${cur.postponed ? `, e houve ${plural(cur.postponed, 'adiamento', 'adiamentos')}` : ''}.`;
  }
  const idle = !cur.completed && !cur.goalsMoved && !cur.created && !cur.progressEvents;
  if (idle) {
    return `Houve pouco movimento neste período. Nenhuma tarefa foi concluída${now.goals.length ? ` e ${now.goals.length === 1 ? 'a meta ativa permaneceu' : `${now.goals.length} metas permaneceram`} sem progresso` : ''}.`;
  }
  const parts = [];
  parts.push(cur.completed ? `concluiu ${plural(cur.completed, 'tarefa', 'tarefas')}` : 'não concluiu tarefas');
  if (cur.postponed) parts.push(`adiou ${cur.postponed === 1 ? '1 vez' : `${cur.postponed} vezes`}`);
  if (cur.goalsMoved) parts.push(`registrou progresso em ${plural(cur.goalsMoved, 'meta', 'metas')}`);
  const extra = sel.scope === 'area' && cur.minutes ? ` Foram ${formatMinutes(cur.minutes)} registradas.` : cur.moneyIn ? ` Foram ${formatMoney(cur.moneyIn)} guardados em metas.` : '';
  return `Neste período, você ${listJoin(parts)}.${extra}`;
}

/** Frase da comparação (fato + diferença absoluta; sem "x% mais produtivo"). */
export function compareSentence(sel, sum, prevLabel) {
  const { cur, old } = sum;
  if (!old) return null;
  if (sel.scope === 'dinheiro') {
    const d = cur.spent - old.spent;
    const g = cur.toGoals - old.toGoals;
    if (!cur.count && !old.count) return `Não houve movimentações registradas neste período nem no ${prevLabel}.`;
    return `Saíram ${formatMoney(cur.spent)} neste período e ${formatMoney(old.spent)} no ${prevLabel} (${d >= 0 ? '+' : '−'} ${formatMoney(Math.abs(d))}). Para metas: ${formatMoney(cur.toGoals)} contra ${formatMoney(old.toGoals)} (${g >= 0 ? '+' : '−'} ${formatMoney(Math.abs(g))}).`;
  }
  if (sel.scope === 'meta') {
    const g = state.goals.get(sel.goalId);
    const f = (v) => (g.type === 'steps' ? plural(v, 'etapa', 'etapas') : formatGoalValue(g, Math.abs(v)));
    if (!cur.advance && !old.advance) return `Não houve avanço registrado nem neste período nem no ${prevLabel}.`;
    return `Neste período, o avanço foi de ${cur.advance ? f(cur.advance) : 'nada'}; no ${prevLabel}, ${old.advance ? f(old.advance) : 'nada'}.`;
  }
  const a = cur.completed; const b = old.completed;
  if (!a && !b) return `Nenhuma tarefa foi concluída neste período nem no ${prevLabel}.`;
  if (!a) return `Nenhuma tarefa foi concluída neste período. No ${prevLabel}, ${b === 1 ? 'foi concluída 1' : `foram concluídas ${b}`}.`;
  const d = a - b;
  return `Neste período, ${a === 1 ? 'foi concluída 1 tarefa' : `foram concluídas ${a} tarefas`}; no ${prevLabel}, ${b}. ${d === 0 ? 'O mesmo número.' : `Diferença: ${d > 0 ? '+' : '−'}${Math.abs(d)}.`}`;
}

/* ---------- Séries para gráficos ---------- */

export function series(sel, period, gran) {
  return memo(`ser|${JSON.stringify(sel)}|${period.from}|${period.to}|${gran}`, () => {
    const { eventOk } = scopeMatchers(sel);
    const bs = buckets(period.from, period.to, gran).map((b) => ({ ...b, fromTs: startOfDayTs(b.start), toTs: startOfDayTs(b.end), completed: new Set(), created: 0, postponed: 0, advance: 0, records: 0 }));
    if (!bs.length) return [];
    const minTs = bs[0].fromTs; const maxTs = bs[bs.length - 1].toTs;
    let bi = 0;
    for (const e of state.events) {
      if (e.createdAt < minTs) continue;
      if (e.createdAt >= maxTs) break;
      if (!eventOk(e)) continue;
      while (bi < bs.length - 1 && e.createdAt >= bs[bi].toTs) bi++;
      let b = bs[bi];
      if (e.createdAt < b.fromTs) b = bs.find((x) => e.createdAt >= x.fromTs && e.createdAt < x.toTs);
      if (!b) continue;
      if (e.type === 'task.completed') b.completed.add(e.entityId);
      else if (e.type === 'task.created') b.created++;
      else if (e.type === 'task.postponed') b.postponed++;
      else if (e.type === 'goal.progress' && e.metadata?.kind !== 'correction') { b.advance += e.metadata.delta; b.records++; }
      else if (e.type === 'goal.step' && e.metadata?.done) { b.advance++; b.records++; }
    }
    return bs.map((b) => ({ ...b, completed: b.completed.size }));
  });
}

/** Série de dinheiro por intervalo: entradas, saídas e destinação a metas. */
export function moneySeries(sel, period, gran) {
  return memo(`mser|${period.from}|${period.to}|${gran}`, () => buckets(period.from, period.to, gran).map((b) => {
    const to = addDays(b.end, -1);
    const r = moneyRange(b.start, to);
    return { ...b, income: r.income, spent: r.spent, toGoals: r.toGoals };
  }));
}

/** Distribuição de saídas por categoria e por natureza no período. */
export function moneyBreakdown(period) {
  const r = moneyRange(period.from, period.to);
  return {
    total: r.spent,
    categories: [...r.byCategory.entries()].map(([id, value]) => ({ id, label: categoryLabel(id), value })).sort((a, b) => b.value - a.value),
    natures: NATURES.map((n) => ({ id: n.id, label: natureLabel(n.id), value: r.byNature.get(n.id) || 0 })).filter((x) => x.value > 0),
    flexible: r.flexible,
  };
}

/** Valor acumulado de uma meta ao fim de cada intervalo. */
export function goalCumulative(goal, period, gran) {
  const evs = state.events.filter((e) => e.entityId === goal.id && (e.type === 'goal.progress' || e.type === 'goal.created' || e.type === 'goal.step'));
  return buckets(period.from, period.to, gran).map((b) => {
    const end = startOfDayTs(b.end);
    let v = 0;
    if (goal.type === 'steps') v = goal.steps.filter((s) => s.doneAt && s.doneAt < end).length;
    else {
      for (const e of evs) {
        if (e.createdAt >= end) break;
        if (e.type === 'goal.created') v = e.metadata?.initial || 0;
        else if (e.type === 'goal.progress') v = e.metadata.after;
      }
    }
    return { ...b, value: v };
  });
}

/* ---------- Planejado × realizado ---------- */

export function planWeeks(sel, period) {
  return memo(`plan|${JSON.stringify(sel)}|${period.to}|${period.days}`, () => {
    const { taskIdOk } = scopeMatchers(sel);
    const weeks = Math.max(1, Math.min(8, Math.ceil(period.days / 7) + (period.days <= 7 ? 3 : 0)));
    return plannedVsDone(weeks, sel.scope === 'tudo' || sel.scope === 'tarefas' ? null : taskIdOk, period.to);
  });
}
export const capacity = () => memo('cap', () => recentCapacity());
export const weekLoad = () => memo('load', () => thisWeekLoad());

/* ---------- Metas e áreas no período ---------- */

export function goalsMovement(sel, period) {
  const { goalOk } = scopeMatchers(sel);
  const from = startOfDayTs(period.from); const to = startOfDayTs(addDays(period.to, 1));
  return activeGoals().filter(goalOk).map((g) => {
    let adv = 0; let records = 0;
    for (const e of state.events) {
      if (e.entityId !== g.id || e.createdAt < from || e.createdAt >= to) continue;
      if (e.type === 'goal.progress' && e.metadata?.kind !== 'correction') { adv += e.metadata.delta; records++; }
      if (e.type === 'goal.step' && e.metadata?.done) { adv++; records++; }
    }
    const last = lastMovementAt(g);
    return { goal: g, ratio: progressOf(g).ratio, advance: adv, records, last, pace: paceOf(g), openTasks: tasksForGoal(g.id).filter(isOpen).length };
  }).sort((a, b) => b.records - a.records || b.ratio - a.ratio);
}

export function areaDistribution(sel, period) {
  const t = tally(sel, period.from, period.to);
  const total = [...t.areaCounts.values()].reduce((a, b) => a + b, 0);
  const rows = listAreas().map((a) => ({ area: a, count: t.areaCounts.get(a.id) || 0 }));
  if (t.areaCounts.get(null)) rows.push({ area: null, count: t.areaCounts.get(null) });
  return { total, rows: rows.filter((r) => r.count || r.area).sort((a, b) => b.count - a.count) };
}

/** Prazos das tarefas abertas hoje (para a visão "Tarefas"). */
export function dueBreakdown(sel) {
  const { taskOk } = scopeMatchers(sel);
  const T = today(); const end = addDays(startOfWeek(T), 6);
  const open = openTasks().filter(taskOk);
  const rows = [
    { id: 'late', label: 'Atrasadas', value: open.filter((t) => t.dueDate && t.dueDate < T).length, href: '#/tarefas?f=atrasadas' },
    { id: 'today', label: 'Para hoje', value: open.filter((t) => t.dueDate === T).length, href: '#/tarefas?f=hoje' },
    { id: 'week', label: 'Resto da semana', value: open.filter((t) => t.dueDate && t.dueDate > T && t.dueDate <= end).length, href: '#/tarefas?f=semana' },
    { id: 'later', label: 'Mais adiante', value: open.filter((t) => t.dueDate && t.dueDate > end).length, href: '#/tarefas' },
    { id: 'none', label: 'Sem prazo', value: open.filter((t) => !t.dueDate).length, href: '#/tarefas?f=sem-prazo' },
  ];
  return { total: open.length, rows };
}

export const isEmptyScope = (sel) => {
  const { taskOk, goalOk, eventOk } = scopeMatchers(sel);
  return ![...state.tasks.values()].some(taskOk) && ![...state.goals.values()].some(goalOk) && !state.events.some(eventOk);
};

