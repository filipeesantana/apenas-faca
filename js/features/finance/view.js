/**
 * Finanças — "meu mês" em poucos números, distribuição definida pelo usuário
 * e as metas que dependem de dinheiro. Sem estética de banco: continua Norte.
 */
import { h, add, swap } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { pageHead, sectionHead, button, emptyState, segmented, progressBar } from '../../ui/components.js';
import { hbarList } from '../../ui/charts.js';
import { labelWithHelp, helpTip, HELP } from '../../ui/help.js';
import { state } from '../../core/store.js';
import { formatMoney, formatPercent } from '../../utils/numbers.js';
import { formatDay } from '../../utils/dates.js';
import { progressOf } from '../../domain/goals.js';
import {
  monthSummary, incomeMonthly, recurringMonthly, thisMonth, prevMonth, nextMonth, monthLabel,
  monthsWithData, categoryLabel, natureLabel, NATURES, hasMoneyData, flexMargin,
} from '../../domain/money.js';
import { plansStatus, planFor } from '../../domain/finance-plan.js';
import { openMoneyEntry, openIncomeForm, openRecurringSheet } from './money-form.js';
import { openSimulator } from './simulator.js';
import { openProgressLog } from '../progress-log.js';
import { financeHints, hintCard } from './hints.js';

let ym = null;
let distView = 'natureza';

export function financeView() {
  const months = monthsWithData();
  if (!ym || (!months.includes(ym) && ym !== thisMonth())) ym = thisMonth();
  const income = incomeMonthly();
  const view = h('div', { class: 'view view--wide view--finance' },
    pageHead('Finanças', 'Quanto entra, quanto sai e quanto sobra para o que você quer.',
      button('Registrar movimentação', { variant: 'primary', icon: 'plus', onClick: () => openMoneyEntry() })));

  if (!hasMoneyData()) {
    add(view, emptyState({
      icon: 'coins', title: 'Ainda não há nada registrado aqui.',
      text: 'Comece pelo que for mais útil agora: informar a renda ajuda a saber se um plano cabe no mês; registrar gastos mostra para onde o dinheiro está indo.',
      actions: [
        button('Informar renda', { variant: 'primary', icon: 'plus', onClick: () => openIncomeForm() }),
        button('Registrar movimentação', { icon: 'coins', onClick: () => openMoneyEntry() }),
      ],
    }));
    add(view, goalsSection(income));
    return view;
  }

  const hint = financeHints()[0];
  if (hint) add(view, hintCard(hint));
  add(view, monthSection(income), distributionSection(), goalsSection(income), recurringSection(), historySection());
  return view;
}

/* ---------- Meu mês ---------- */

function monthSection(income) {
  const box = h('section', { class: 'an-section' });
  const body = h('div', { class: 'card section fin-month' });
  const render = () => {
    const s = monthSummary(ym);
    const rec = recurringMonthly();
    const pct = (v) => (income.has && income.cents > 0 ? formatPercent(v / income.cents) : null);
    // Sem entrada registrada ainda, o disponível usa a renda prevista — e diz isso.
    const usesForecast = !s.income && rec.plannedIn > 0;
    const base = s.income || rec.plannedIn;
    const available = base - s.spent - s.toGoals;
    const tiles = [
      { label: 'Entrou', value: formatMoney(s.income), hint: rec.plannedIn ? `previsto: ${formatMoney(rec.plannedIn)}` : null, tone: 'in' },
      { label: 'Saiu', value: formatMoney(s.spent), hint: rec.plannedOut ? `compromissos previstos: ${formatMoney(rec.plannedOut)}` : pct(s.spent) && `${pct(s.spent)} da renda`, tone: 'out' },
      { label: 'Destinado a metas', value: formatMoney(s.toGoals), hint: pct(s.toGoals) && `${pct(s.toGoals)} da renda`, tone: 'goal' },
      { label: 'Disponível', value: formatMoney(available), hint: usesForecast ? 'considerando a renda prevista' : pct(available) && `${pct(available)} da renda`, tone: available < 0 ? 'warn' : null, help: HELP.disponivel },
    ];
    swap(body,
      h('div', { class: 'fin-tiles', 'data-help-slot': '' }, tiles.map((t) => h('div', { class: ['fin-tile', t.tone && `fin-tile--${t.tone}`] },
        h('span', { class: 'fin-tile__label' }, t.label, t.help && helpTip(t.help)),
        h('span', { class: 'fin-tile__value' }, t.value),
        t.hint && h('span', { class: 'fin-tile__hint' }, t.hint)))),
      h('p', { class: 'fin-month__line' }, sentence(s, income)),
      !income.has && h('div', { class: 'fin-cta' },
        h('p', null, 'Quer saber quanto disso representa do seu mês? Informe sua renda.'),
        button('Informar renda', { size: 'sm', onClick: () => openIncomeForm() })));
  };
  const nav = h('div', { class: 'fin-nav' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Mês anterior', onClick: () => { ym = prevMonth(ym); render(); paintNav(); } }, icon('chevronLeft', { size: 18 })),
    h('span', { class: 'fin-nav__label' }, monthLabel(ym)),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Próximo mês', onClick: () => { if (ym < thisMonth()) { ym = nextMonth(ym); render(); paintNav(); } } }, icon('chevronRight', { size: 18 })));
  const paintNav = () => {
    nav.querySelector('.fin-nav__label').textContent = monthLabel(ym);
    nav.lastChild.disabled = ym >= thisMonth();
  };
  add(box, h('div', { class: 'section-head' }, h('h2', { class: 'label' }, 'Meu mês'), nav), body);
  render(); paintNav();
  return box;
}

function sentence(s, income) {
  if (!s.count && !s.toGoals) return 'Nada foi registrado neste mês ainda.';
  const parts = [];
  if (s.income) parts.push(`entraram ${formatMoney(s.income)}`);
  if (s.spent) parts.push(`saíram ${formatMoney(s.spent)}`);
  if (s.toGoals) parts.push(`${formatMoney(s.toGoals)} foram para metas`);
  const base = `Neste mês, ${parts.join(', ')}.`;
  if (!income.has) return base;
  const share = s.toGoals > 0 ? ` Isso representa ${formatPercent(s.toGoals / income.cents)} da renda registrada.` : '';
  return base + share;
}

/* ---------- Distribuição ---------- */

function distributionSection() {
  const s = monthSummary(ym);
  const box = h('section', { class: 'an-section' });
  const body = h('div', { class: 'card section' });
  const render = () => {
    if (!s.spent) {
      swap(body, h('p', { class: 'muted' }, 'Você ainda não registrou gastos suficientes neste mês para ver a distribuição.'),
        h('div', { class: 'row-actions' }, button('Registrar movimentação', { size: 'sm', icon: 'plus', onClick: () => openMoneyEntry({ kind: 'out' }) })));
      return;
    }
    const rows = distView === 'natureza'
      ? NATURES.map((n) => ({ label: n.label, value: s.byNature.get(n.id) || 0 })).filter((r) => r.value > 0)
      : [...s.byCategory.entries()].map(([id, value]) => ({ label: categoryLabel(id), value })).sort((a, b) => b.value - a.value);
    const top = rows[0];
    swap(body,
      hbarList(rows, { label: `Distribuição por ${distView}`, valueText: (r) => `${formatMoney(r.value)} · ${formatPercent(r.value / s.spent)}` }),
      h('p', { class: 'chart-note' }, `${top.label} concentrou ${formatPercent(top.value / s.spent)} do que saiu neste mês${s.flexible ? `. Você marcou ${formatMoney(s.flexible)} como ajustáveis` : ''}.`));
  };
  add(box, h('div', { class: 'section-head' },
    h('h2', { class: 'label' }, 'Para onde foi'),
    segmented([{ value: 'natureza', label: 'Por natureza' }, { value: 'categoria', label: 'Por categoria' }], distView, (v) => { distView = v; render(); }, { label: 'Ver distribuição' })), body);
  render();
  return box;
}

/* ---------- Metas de dinheiro ---------- */

function goalsSection(income) {
  const goals = [...state.goals.values()].filter((g) => g.type === 'money' && g.status === 'active');
  if (!goals.length) return null;
  const status = new Map(plansStatus(ym).map((p) => [p.plan.goalId, p]));
  return h('section', { class: 'an-section' },
    sectionHead(labelWithHelp('Metas de dinheiro', HELP.planoMeta, { className: 'label' })),
    h('ul', { class: 'fin-goals' }, goals.map((g) => {
      const p = progressOf(g);
      const st = status.get(g.id);
      return h('li', { class: 'card section fin-goal' },
        h('div', { class: 'fin-goal__head' },
          h('a', { class: 'fin-goal__title', href: `#/metas/${g.id}` }, g.title),
          h('span', { class: 'fin-goal__pct' }, formatPercent(p.ratio))),
        h('p', { class: 'fin-goal__nums' }, `${formatMoney(p.current)} de ${formatMoney(p.target)} · faltam ${formatMoney(Math.max(0, p.remaining))}`),
        progressBar(p.ratio, { key: `fin-${g.id}`, size: 'sm', label: `Progresso de ${g.title}` }),
        st
          ? h('p', { class: 'fin-goal__plan' },
            `Plano: ${formatMoney(st.planned)} por mês${st.plan.mode === 'percent' ? ` (${st.plan.percent}% da renda)` : ''}. `,
            h('strong', null, `Neste mês: ${formatMoney(st.done)}`),
            st.missing > 0 ? ` · faltam ${formatMoney(st.missing)} para o planejado.` : ' · planejado alcançado.',
            income.has && st.planned > 0 ? ` (${formatPercent(st.planned / income.cents)} da renda)` : '')
          : h('p', { class: 'fin-goal__plan muted' }, 'Sem plano definido. Simular caminhos ajuda a ver quanto por mês e em quanto tempo.'),
        h('div', { class: 'row-actions' },
          button('Registrar aporte', { size: 'sm', icon: 'plus', onClick: () => openProgressLog(g.id) }),
          button(planFor(g.id) ? 'Rever caminhos' : 'Simular caminho', { size: 'sm', icon: 'lens', onClick: () => openSimulator(g.id) })));
    })));
}

/* ---------- Recorrentes e histórico ---------- */

function recurringSection() {
  const rec = recurringMonthly();
  return h('section', { class: 'an-section' },
    sectionHead('Previsto todo mês', { action: button('Gerenciar', { size: 'sm', variant: 'ghost', onClick: () => openRecurringSheet() }) }),
    h('div', { class: 'card section' },
      rec.items.length
        ? [h('p', null, `Entradas previstas: ${formatMoney(rec.plannedIn)} · compromissos previstos: ${formatMoney(rec.plannedOut)}.`),
          h('p', { class: 'muted small' }, labelWithHelp('Previsto não é o mesmo que realizado.', HELP.planejadoReal, { className: 'small' }))]
        : [h('p', { class: 'muted' }, 'Nada marcado como recorrente ainda. Ao registrar uma movimentação, marque “isso se repete” para ela virar previsão do mês.'),
          h('div', { class: 'row-actions' }, button('Informar renda', { size: 'sm', onClick: () => openIncomeForm() }))]));
}

function historySection() {
  const list = monthSummary(ym).list.slice(0, 8);
  if (!list.length) return null;
  return h('section', { class: 'an-section' },
    sectionHead('Movimentações do mês', { count: monthSummary(ym).count }),
    h('ul', { class: 'fin-list card section' }, list.map((t) => h('li', { class: 'fin-row' },
      h('span', { class: ['fin-row__dot', t.kind === 'in' ? 'is-in' : 'is-out'], 'aria-hidden': 'true' }),
      h('div', { class: 'fin-row__text' },
        h('p', { class: 'fin-row__name' }, t.label || categoryLabel(t.categoryId, t.kind)),
        h('p', { class: 'meta-muted' }, `${formatDay(t.date)} · ${categoryLabel(t.categoryId, t.kind)}${t.kind === 'out' ? ` · ${natureLabel(t.nature)}` : ''}${t.kind === 'out' && flexMargin(t.flex) > 0 ? ' · ajustável' : ''}`)),
      h('span', { class: ['fin-row__value', t.kind === 'in' ? 'is-in' : 'is-out'] }, `${t.kind === 'in' ? '+' : '−'} ${formatMoney(t.amountCents)}`)))),
    monthSummary(ym).count > 8 && h('p', { class: 'muted small' }, `E mais ${monthSummary(ym).count - 8} neste mês.`));
}
