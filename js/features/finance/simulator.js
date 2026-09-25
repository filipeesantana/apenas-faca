/**
 * Simular caminho — laboratório de cenários de uma meta de dinheiro.
 *
 * Tudo acontece em memória: mexer aqui nunca altera saldo, histórico ou meta.
 * Só duas ações gravam algo: "Salvar cenário" e "Usar como plano" (com confirmação).
 */
import { h, add, swap } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { button, segmented, chipGroup, progressBar } from '../../ui/components.js';
import { futureChart } from '../../ui/charts.js';
import { helpTip, HELP } from '../../ui/help.js';
import { toast, toastError } from '../../ui/toast.js';
import { state, commit } from '../../core/store.js';
import { uid } from '../../utils/helpers.js';
import { formatMoney, formatMoneyApprox, formatPercent, parseMoney, parseNumber } from '../../utils/numbers.js';
import { progressOf } from '../../domain/goals.js';
import { nextStepOf } from '../../domain/tasks.js';
import { incomeMonthly, adjustableCategories, categoryLabel, flexLabel, financeEnabled, enableFinance } from '../../domain/money.js';
import { runScenario, quickContributions, compareLabels, monthYear, equivalents } from '../../domain/simulator.js';
import { planFor, planAmount, savePlan } from '../../domain/finance-plan.js';
import { openTaskForm } from '../task-form.js';
import { openProgressLog } from '../progress-log.js';

const TONES = ['plan', 'a', 'b', 'c'];
const NAMES = ['Atual', 'Cenário A', 'Cenário B', 'Cenário C'];
const EXTRA_MONTHS = [1, 2, 3, 6, 12];

const round1000 = (c) => Math.max(1000, Math.round(c / 1000) * 1000);
/** Valor para campos de texto: "3.130,00" (sem o R$, que fica ao lado). */
const moneyField = (cents) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function openSimulator(goalId) {
  const goal = state.goals.get(goalId);
  if (!goal || goal.type !== 'money') { toast('A simulação de caminhos é para metas de dinheiro.'); return null; }
  const p = progressOf(goal);
  const income = incomeMonthly();
  const ctx = { targetCents: p.target, currentCents: p.current, incomeCents: income.has ? income.cents : 0, goal };
  const plan = planFor(goalId);

  // Ponto de partida: o plano atual, o prazo da meta ou uma referência de 24 meses.
  const base = plan ? planAmount(plan, income)
    : goal.targetDate ? Math.max(1000, Math.ceil(p.remaining / Math.max(1, monthsUntil(goal.targetDate))))
      : round1000(p.remaining / 24);

  let scenarios = [{ id: 'atual', name: 'Atual', params: { mode: 'contrib', perMonthCents: base, months: null, extras: [], withdrawals: [], startCents: null, percentOfIncome: null } }];
  let activeId = 'atual';
  let incomeOverride = null;
  let whatIf = false;
  let root = null;
  const api = { update: () => {} };

  const incomeCents = () => (incomeOverride != null ? incomeOverride : ctx.incomeCents);
  const active = () => scenarios.find((sc) => sc.id === activeId) || scenarios[0];
  const results = () => scenarios.map((sc, i) => ({ ...runScenario(sc.params, { ...ctx, incomeCents: incomeCents() }), id: sc.id, name: sc.name, tone: TONES[i] || 'c' }));

  const sheet = openSheet({
    title: 'Simular caminho',
    key: `sim:${goalId}`,
    className: 'sheet--sim',
    render: () => {
      if (root) return undefined; // cenários vivem em memória: não reconstruir a cada mudança de dados
      root = build();
      return root;
    },
  });

  /* ---------- Construção ---------- */

  function build() {
    const el = h('div', { class: 'sim' });
    const resultBox = h('div', { class: 'sim__result', 'aria-live': 'polite' });
    const chartBox = h('div', { class: 'sim__chart' });
    const compareBox = h('div', { class: 'sim__compare' });
    const quickBox = h('div', { class: 'sim__quick' });
    const controlBox = h('div', { class: 'sim__controls' });
    const tabsBox = h('div', { class: 'sim__tabs' });
    const whatIfBox = h('div', { class: 'sim__whatif', hidden: true });
    const milestoneBox = h('div', { class: 'sim__milestones', hidden: true });

    const update = ({ controls = false } = {}) => {
      const list = results();
      const cur = list.find((r) => r.id === activeId) || list[0];
      if (controls) swap(controlBox, ...controlNodes(cur));
      swap(resultBox, ...resultNodes(cur));
      swap(quickBox, ...quickNodes(cur));
      swap(chartBox, chartNode(list));
      swap(compareBox, ...compareNodes(list));
      swap(tabsBox, ...tabNodes(list));
      if (!milestoneBox.hidden) swap(milestoneBox, ...milestoneNodes(list));
      if (!whatIfBox.hidden) swap(whatIfBox, ...whatIfNodes());
    };
    api.update = update;

    add(el,
      header(),
      tabsBox,
      controlBox,
      resultBox,
      quickBox,
      chartBox,
      compareBox,
      h('div', { class: 'sim__more' },
        h('button', {
          type: 'button', class: 'disclosure', 'aria-expanded': 'false',
          onClick: (e) => {
            whatIf = !whatIf;
            whatIfBox.hidden = !whatIf;
            e.currentTarget.setAttribute('aria-expanded', String(whatIf));
            if (whatIf) swap(whatIfBox, ...whatIfNodes());
          },
        }, icon('plus', { size: 16 }), 'E se eu mudar alguma coisa?', h('span', { class: 'muted' }, ' — aporte extra, renda, gastos ajustáveis')),
        whatIfBox,
        h('button', {
          type: 'button', class: 'disclosure', 'aria-expanded': 'false',
          onClick: (e) => {
            const open = milestoneBox.hidden;
            milestoneBox.hidden = !open;
            e.currentTarget.setAttribute('aria-expanded', String(open));
            if (open) swap(milestoneBox, ...milestoneNodes(results()));
          },
        }, icon('flag', { size: 16 }), 'Ver marcos de cada caminho'),
        milestoneBox),
      actions(),
      h('p', { class: 'sim__note' }, icon('info', { size: 15 }),
        h('span', null, 'Isto é uma simulação. Nada aqui altera seus dados — só se você escolher usar um cenário como plano. '), helpTip(HELP.cenario)));
    update({ controls: true });
    return el;
  }

  function header() {
    const pr = progressOf(goal);
    return h('div', { class: 'sim__head' },
      h('p', { class: 'sim__goal' }, goal.title),
      h('dl', { class: 'sim__nums' },
        num('Já tenho', formatMoney(pr.current)),
        num('Objetivo', formatMoney(pr.target)),
        num('Faltam', formatMoney(Math.max(0, pr.remaining)))),
      progressBar(pr.ratio, { key: `sim-${goal.id}`, label: `Progresso de ${goal.title}` }));
  }
  function num(k, v) { return h('div', null, h('dt', null, k), h('dd', null, v)); }

  /* ---------- Controles principais ---------- */

  function controlNodes(cur) {
    const sc = active();
    const mode = sc.params.mode;
    const remaining = Math.max(0, ctx.targetCents - (sc.params.startCents ?? ctx.currentCents));
    const maxPerMonth = Math.max(round1000(remaining / 3), round1000(cur.perMonthCents * 2.5), 50000);
    const stepMoney = maxPerMonth > 2000000 ? 50000 : maxPerMonth > 500000 ? 10000 : 5000;

    const moneyInput = h('input', {
      class: 'input input--money', inputmode: 'decimal', 'data-key': 'sim-money', value: moneyField(cur.perMonthCents),
      'aria-label': 'Quanto guardar por mês, em reais',
      onInput: (e) => {
        const cents = parseMoney(e.target.value);
        if (cents == null || cents < 0) return;
        sc.params.perMonthCents = cents; sc.params.mode = 'contrib'; sc.params.percentOfIncome = null;
        range.value = String(Math.min(cents, maxPerMonth));
        api.update();
      },
    });
    const range = h('input', {
      type: 'range', class: 'range', min: String(stepMoney), max: String(maxPerMonth), step: String(stepMoney),
      value: String(Math.min(Math.max(cur.perMonthCents, stepMoney), maxPerMonth)),
      'aria-label': 'Valor por mês', 'data-key': 'sim-range',
      onInput: (e) => {
        sc.params.perMonthCents = Number(e.target.value); sc.params.mode = 'contrib'; sc.params.percentOfIncome = null;
        moneyInput.value = moneyField(sc.params.perMonthCents);
        api.update();
      },
    });

    const monthsInput = h('input', {
      class: 'input input--short', inputmode: 'numeric', 'data-key': 'sim-months', value: String(cur.months || 24),
      'aria-label': 'Em quantos meses',
      onInput: (e) => {
        const v = parseNumber(e.target.value);
        if (!(v > 0)) return;
        sc.params.months = Math.min(600, Math.round(v)); sc.params.mode = 'deadline';
        monthRange.value = String(Math.min(sc.params.months, 120));
        api.update();
      },
    });
    const monthRange = h('input', {
      type: 'range', class: 'range', min: '1', max: '120', step: '1', value: String(Math.min(cur.months || 24, 120)),
      'aria-label': 'Prazo em meses', 'data-key': 'sim-mrange',
      onInput: (e) => { sc.params.months = Number(e.target.value); sc.params.mode = 'deadline'; monthsInput.value = String(sc.params.months); api.update(); },
    });

    return [
      segmented([{ value: 'contrib', label: 'Quanto guardar por mês?' }, { value: 'deadline', label: 'Em quanto tempo?' }], mode, (v) => {
        sc.params.mode = v;
        if (v === 'deadline' && !sc.params.months) sc.params.months = cur.months || 24;
        api.update({ controls: true });
      }, { label: 'Como quer simular' }),
      mode === 'contrib'
        ? h('div', { class: 'sim__field' },
          h('label', { class: 'field__label', for: idFor(moneyInput, 'sim-money-input') }, 'Quanto guardar por mês'),
          h('div', { class: 'sim__row' }, h('span', { class: 'sim__prefix' }, 'R$'), moneyInput),
          range,
          h('p', { class: 'muted small' }, 'Arraste para explorar ou digite um valor exato.'))
        : h('div', { class: 'sim__field' },
          h('label', { class: 'field__label', for: idFor(monthsInput, 'sim-months-input') }, 'Em quantos meses quer chegar'),
          h('div', { class: 'sim__row' }, monthsInput, h('span', { class: 'sim__suffix' }, cur.months === 1 ? 'mês' : 'meses')),
          monthRange,
          h('p', { class: 'muted small' }, 'O valor por mês é calculado automaticamente.')),
    ];
  }

  function idFor(el, id) { el.id = el.id || id; return el.id; }

  /* ---------- Resultado ---------- */

  function resultNodes(cur) {
    if (cur.remaining <= 0) return [h('p', { class: 'sim__done' }, icon('check', { size: 16 }), 'Esta meta já foi alcançada.')];
    if (cur.never || !cur.months) {
      return [h('p', { class: 'sim__warn' }, icon('info', { size: 16 }),
        h('span', null, 'Com esse valor por mês a meta não é alcançada. Experimente aumentar o valor ou incluir um aporte extra.'))];
    }
    const eq = cur.equivalents;
    const rows = [
      ['Guardando por mês', formatMoney(cur.perMonthCents)],
      ['Prazo aproximado', cur.months === 1 ? '1 mês' : `${cur.months} meses`],
      ['Estimativa', monthYear(cur.endDate)],
      ['Equivale por mês a', formatPercent(cur.monthlyRatio) + ' do objetivo'],
    ];
    if (cur.shareOfIncome != null) rows.push(['Parcela da renda', formatPercent(cur.shareOfIncome)]);
    return [
      h('dl', { class: 'sim__result-grid' }, rows.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
      h('p', { class: 'sim__equiv' }, `Equivale a cerca de ${formatMoneyApprox(eq.perWeek)} por semana ou ${formatMoneyApprox(eq.perDay)} por dia — são equivalências aproximadas, não uma sugestão de guardar dinheiro todo dia.`),
    ];
  }

  /* ---------- Atalhos ---------- */

  function quickNodes(cur) {
    const list = quickContributions(cur.remaining, cur.perMonthCents, { ...ctx, currentCents: cur.startCents });
    if (!list.length) return [];
    return [
      h('p', { class: 'sub-label' }, 'Cenários rápidos'),
      h('div', { class: 'chips' }, list.map((c) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(Math.abs(c.perMonthCents - cur.perMonthCents) < 1),
        onClick: () => {
          const sc = active();
          sc.params.mode = 'contrib'; sc.params.perMonthCents = c.perMonthCents; sc.params.percentOfIncome = null;
          api.update({ controls: true });
        },
      }, h('span', null, `${formatMoney(c.perMonthCents)}/mês`), h('span', { class: 'chip__sub' }, `${c.months} ${c.months === 1 ? 'mês' : 'meses'}`)))),
    ];
  }

  /* ---------- Gráfico ---------- */

  function chartNode(list) {
    const valid = list.filter((r) => r.months);
    if (!valid.length) return h('p', { class: 'muted small' }, 'Escolha um valor que permita alcançar a meta para ver a trajetória.');
    const maxMonths = Math.min(240, Math.max(...valid.map((r) => r.months)));
    const series = valid.map((r) => ({
      id: r.id, label: r.name, tone: r.tone,
      points: r.points.filter((pt) => pt.i <= maxMonths),
    }));
    return futureChart(series, {
      targetCents: ctx.targetCents, maxMonths,
      label: `Trajetória simulada até ${formatMoney(ctx.targetCents)}. ${valid.map((r) => `${r.name}: ${formatMoney(r.perMonthCents)} por mês, ${r.months} meses.`).join(' ')}`,
      formatValue: (c) => formatMoneyApprox(c),
      monthLabel: (i) => (i === 0 ? 'hoje' : monthYear(addMonthsISO(i)).replace(' de ', '/')),
      pointTip: (line, pt) => `${line.label} · mês ${pt.i} (${monthYear(addMonthsISO(pt.i))}): ${formatMoney(pt.cents)} acumulados — ${formatPercent(Math.min(1, pt.cents / ctx.targetCents))} da meta`,
    });
  }

  /* ---------- Cenários ---------- */

  function tabNodes(list) {
    const tabs = list.map((r) => h('button', {
      type: 'button', class: 'sim__tab', 'aria-pressed': String(r.id === activeId), 'data-tone': r.tone,
      onClick: () => { activeId = r.id; api.update({ controls: true }); },
    }, h('span', { class: 'sim__tab-dot', 'aria-hidden': 'true' }), r.name));
    if (list.length < 4) {
      tabs.push(h('button', {
        type: 'button', class: 'sim__tab sim__tab--add',
        onClick: () => {
          const src = active();
          const sc = { id: uid(), name: NAMES[scenarios.length] || 'Cenário', params: JSON.parse(JSON.stringify(src.params)) };
          sc.params.perMonthCents = Math.round(src.params.perMonthCents * 1.25 / 1000) * 1000 || 10000;
          sc.params.mode = 'contrib';
          scenarios.push(sc); activeId = sc.id;
          api.update({ controls: true });
        },
      }, icon('plus', { size: 15 }), 'Comparar cenário'));
    }
    return tabs;
  }

  function compareNodes(list) {
    if (list.length < 2) return [];
    const labels = compareLabels(list);
    const card = (r) => {
      const acts = h('div', { class: 'sim__card-actions' });
      if (r.id !== activeId) add(acts, button('Editar', { size: 'sm', variant: 'ghost', onClick: () => { activeId = r.id; api.update({ controls: true }); } }));
      if (r.id !== 'atual') {
        add(acts, button('Remover', {
          size: 'sm',
          variant: 'ghost',
          onClick: () => {
            scenarios = scenarios.filter((x) => x.id !== r.id);
            if (activeId === r.id) activeId = 'atual';
            api.update({ controls: true });
          },
        }));
      }
      return h('li', { class: ['sim__card', r.id === activeId && 'is-active'], 'data-tone': r.tone },
        h('p', { class: 'sim__card-name' },
          h('span', { class: 'sim__tab-dot', 'aria-hidden': 'true' }), r.name,
          labels.get(r.id) && h('span', { class: 'sim__card-tag' }, labels.get(r.id))),
        h('p', { class: 'sim__card-main' }, `${formatMoney(r.perMonthCents)}/mês`),
        h('p', { class: 'sim__card-line' }, r.months ? `${r.months} ${r.months === 1 ? 'mês' : 'meses'} · ${monthYear(r.endDate)}` : 'não alcança a meta'),
        r.shareOfIncome != null && h('p', { class: 'sim__card-line' }, `${formatPercent(r.shareOfIncome)} da renda`),
        acts);
    };
    return [
      h('p', { class: 'sub-label' }, 'Comparando caminhos'),
      h('ul', { class: 'sim__cards' }, list.map(card)),
    ];
  }

  /* ---------- E se? ---------- */

  function whatIfNodes() {
    const sc = active();
    const nodes = [];
    const extraValue = h('input', { class: 'input input--money', inputmode: 'decimal', 'data-key': 'sim-extra', placeholder: 'Ex.: 3.000', 'aria-label': 'Valor do aporte extra' });
    let extraMonth = 1;
    nodes.push(h('div', { class: 'sim__wi' },
      h('p', { class: 'sub-label' }, 'Receber um valor extra'),
      h('div', { class: 'sim__row' }, h('span', { class: 'sim__prefix' }, 'R$'), extraValue),
      chipGroup(EXTRA_MONTHS.map((m) => ({ value: m, label: m === 1 ? 'no próximo mês' : `em ${m} meses` })), 1, (v) => { extraMonth = v; }, { label: 'Quando' }),
      button('Incluir no cenário', { size: 'sm', icon: 'plus', onClick: () => {
        const cents = parseMoney(extraValue.value);
        if (!(cents > 0)) { toast('Informe um valor maior que zero.'); return; }
        sc.params.extras.push({ month: extraMonth, amountCents: cents });
        extraValue.value = '';
        api.update({ controls: true });
      } }),
      listOf(sc.params.extras, 'extras', '+')));

    const outValue = h('input', { class: 'input input--money', inputmode: 'decimal', 'data-key': 'sim-out', placeholder: 'Ex.: 2.000', 'aria-label': 'Valor da retirada' });
    let outMonth = 3;
    nodes.push(h('div', { class: 'sim__wi' },
      h('p', { class: 'sub-label' }, 'Precisar retirar um valor'),
      h('div', { class: 'sim__row' }, h('span', { class: 'sim__prefix' }, 'R$'), outValue),
      chipGroup(EXTRA_MONTHS.map((m) => ({ value: m, label: m === 1 ? 'no próximo mês' : `em ${m} meses` })), 3, (v) => { outMonth = v; }, { label: 'Quando' }),
      button('Incluir no cenário', { size: 'sm', icon: 'plus', onClick: () => {
        const cents = parseMoney(outValue.value);
        if (!(cents > 0)) { toast('Informe um valor maior que zero.'); return; }
        sc.params.withdrawals.push({ month: outMonth, amountCents: cents });
        outValue.value = '';
        api.update({ controls: true });
      } }),
      listOf(sc.params.withdrawals, 'withdrawals', '−')));

    // Renda e percentual da renda
    const inc = incomeCents();
    const incomeInput = h('input', { class: 'input input--money', inputmode: 'decimal', 'data-key': 'sim-income', value: inc ? moneyField(inc) : '', placeholder: 'Ex.: 3.500', 'aria-label': 'Renda mensal considerada' });
    const pctInput = h('input', { class: 'input input--short', inputmode: 'decimal', 'data-key': 'sim-pct', value: sc.params.percentOfIncome || '', placeholder: '20', 'aria-label': 'Percentual da renda' });
    nodes.push(h('div', { class: 'sim__wi' },
      h('p', { class: 'sub-label' }, 'Renda considerada nesta simulação'),
      h('div', { class: 'sim__row' }, h('span', { class: 'sim__prefix' }, 'R$'), incomeInput,
        button('Usar', { size: 'sm', onClick: () => { const c = parseMoney(incomeInput.value); incomeOverride = c > 0 ? c : null; api.update({ controls: true }); } })),
      h('p', { class: 'muted small' }, inc ? 'Só vale para esta simulação; sua renda registrada não muda.' : 'Sem renda informada, o Norte não mostra percentuais da renda.'),
      inc > 0 && h('div', { class: 'sim__row sim__row--pct' },
        h('label', { class: 'field__label', for: idFor(pctInput, 'sim-pct-input') }, 'Destinar % da renda'), pctInput, h('span', { class: 'sim__suffix' }, '%'),
        button('Aplicar', { size: 'sm', onClick: () => {
          const pct = parseNumber(pctInput.value);
          if (!(pct > 0)) { toast('Informe uma porcentagem maior que zero.'); return; }
          sc.params.percentOfIncome = pct; sc.params.mode = 'contrib';
          sc.params.perMonthCents = Math.round((inc * pct) / 100);
          api.update({ controls: true });
        } }))));

    // Valor inicial
    const startInput = h('input', { class: 'input input--money', inputmode: 'decimal', 'data-key': 'sim-start', value: moneyField(sc.params.startCents ?? ctx.currentCents), 'aria-label': 'Valor inicial considerado' });
    nodes.push(h('div', { class: 'sim__wi' },
      h('p', { class: 'sub-label' }, 'Valor inicial considerado'),
      h('div', { class: 'sim__row' }, h('span', { class: 'sim__prefix' }, 'R$'), startInput,
        button('Usar', { size: 'sm', onClick: () => { const c = parseMoney(startInput.value); sc.params.startCents = c >= 0 ? c : null; api.update({ controls: true }); } })),
      h('p', { class: 'muted small' }, `Registrado hoje: ${formatMoney(ctx.currentCents)}.`)));

    nodes.push(adjustmentsNode(sc));
    return nodes;
  }

  function listOf(arr, kind, sign) {
    if (!arr.length) return null;
    return h('ul', { class: 'sim__chiplist' }, arr.map((x, i) => h('li', null,
      h('span', null, `${sign} ${formatMoney(x.amountCents)} ${x.month === 1 ? 'no próximo mês' : `em ${x.month} meses`}`),
      h('button', { type: 'button', class: 'icon-btn icon-btn--subtle', 'aria-label': `Remover ${formatMoney(x.amountCents)}`, onClick: () => { arr.splice(i, 1); api.update({ controls: true }); } }, icon('x', { size: 14 })))));
  }

  /** Ajustes voluntários: só aparecem categorias que o próprio usuário marcou com margem. */
  function adjustmentsNode(sc) {
    const cats = financeEnabled() ? adjustableCategories() : [];
    if (!cats.length) {
      return h('div', { class: 'sim__wi' },
        h('p', { class: 'sub-label' }, 'Ajustar algum gasto'),
        h('p', { class: 'muted small' }, 'Quando você registrar gastos e indicar que algum deles tem margem para ajuste, eles aparecem aqui para simular reduções. O Norte nunca decide isso sozinho.'));
    }
    return h('div', { class: 'sim__wi' },
      h('p', { class: 'sub-label' }, 'Ajustar um gasto que você marcou como ajustável ', helpTip(HELP.flexibilidade)),
      h('ul', { class: 'sim__adjust' }, cats.slice(0, 4).map((c) => {
        const applied = (sc.params.adjustments || []).find((a) => a.categoryId === c.categoryId);
        const line = h('p', { class: 'sim__adjust-line' });
        const render = () => {
          const a = (sc.params.adjustments || []).find((x) => x.categoryId === c.categoryId);
          line.replaceChildren(a
            ? document.createTextNode(`Com −${a.pct}%: ${formatMoney(c.avgMonth - a.amountCents)}/mês · diferença de ${formatMoney(a.amountCents)} por mês (${formatMoney(a.amountCents * 12)} por ano), somada ao cenário.`)
            : document.createTextNode(`Média de ${formatMoney(c.avgMonth)} por mês em ${c.monthCount === 1 ? '1 mês' : `${c.monthCount} meses`} · margem indicada: ${flexLabel(c.flex).toLowerCase()}.`));
        };
        const chips = chipGroup([5, 10, 15, 20, 25].map((v) => ({ value: v, label: `−${v}%` })).concat([{ value: 0, label: 'Não alterar' }]), applied?.pct || 0, (v) => {
          sc.params.adjustments = (sc.params.adjustments || []).filter((a) => a.categoryId !== c.categoryId);
          const diff = Math.round((c.avgMonth * v) / 100);
          if (v > 0) sc.params.adjustments.push({ categoryId: c.categoryId, pct: v, amountCents: diff });
          const total = (sc.params.adjustments || []).reduce((s2, a) => s2 + a.amountCents, 0);
          sc.params.perMonthCents = Math.max(0, (sc.params.baseBeforeAdjust ??= sc.params.perMonthCents) + total);
          sc.params.mode = 'contrib';
          render();
          api.update({ controls: true });
        }, { label: `Reduzir ${categoryLabel(c.categoryId)}` });
        render();
        return h('li', null, h('p', { class: 'sim__adjust-name' }, categoryLabel(c.categoryId)), line, chips);
      })),
      h('p', { class: 'muted small' }, 'A diferença simulada é somada ao valor mensal deste cenário. Nada muda nos seus gastos registrados.'));
  }

  /* ---------- Marcos ---------- */

  function milestoneNodes(list) {
    return list.filter((r) => r.months).map((r) => h('div', { class: 'sim__ms', 'data-tone': r.tone },
      h('p', { class: 'sim__ms-name' }, r.name),
      h('ul', null, r.milestones.map((m) => h('li', null,
        h('span', { class: 'sim__ms-pct' }, `${m.pct}%`),
        h('span', null, monthYear(`${m.ym}-01`)))))));
  }

  /* ---------- Salvar e usar ---------- */

  function actions() {
    return h('div', { class: 'sim__actions' },
      button('Salvar cenário', { icon: 'archive', onClick: () => saveScenario() }),
      button('Usar como plano', { variant: 'primary', icon: 'check', onClick: () => useAsPlan() }));
  }

  async function saveScenario() {
    const cur = results().find((r) => r.id === activeId);
    const suggested = cur.months ? `Guardar ${formatMoney(cur.perMonthCents)} por mês` : 'Cenário';
    const input = h('input', { class: 'input', value: suggested, maxlength: 60, 'data-key': 'sim-name', 'aria-label': 'Nome do cenário' });
    const box = h('div', { class: 'sim__save' },
      h('p', { class: 'field__label' }, 'Nome do cenário'), input,
      h('div', { class: 'row-actions' },
        button('Salvar', { variant: 'primary', size: 'sm', onClick: async () => {
          try {
            const sc = active();
            const rec = { id: uid(), goalId, name: input.value.trim() || suggested, params: JSON.parse(JSON.stringify(sc.params)), createdAt: Date.now(), updatedAt: Date.now() };
            await commit({ put: { scenarios: [rec] } });
            box.remove();
            toast('Cenário salvo. Ele fica guardado nesta meta.');
          } catch (err) { toastError(err); }
        } }),
        button('Cancelar', { variant: 'ghost', size: 'sm', onClick: () => box.remove() })));
    root.querySelector('.sim__actions').after(box);
    input.focus();
  }

  function useAsPlan() {
    const cur = results().find((r) => r.id === activeId);
    if (!cur.months) { toast('Escolha um cenário que alcance a meta.'); return; }
    const wantsTask = !nextStepOf(goalId);
    const check = h('input', { type: 'checkbox', checked: wantsTask, id: 'sim-task' });
    const usePct = active().params.percentOfIncome;
    const box = h('div', { class: 'sim__confirm' },
      h('p', { class: 'sub-label' }, 'Confirmar plano'),
      h('dl', { class: 'sim__result-grid' },
        h('div', null, h('dt', null, 'Contribuição'), h('dd', null, usePct ? `${usePct}% da renda · ${formatMoney(cur.perMonthCents)}/mês` : `${formatMoney(cur.perMonthCents)} por mês`)),
        h('div', null, h('dt', null, 'Prazo estimado'), h('dd', null, `${cur.months} ${cur.months === 1 ? 'mês' : 'meses'}`)),
        h('div', null, h('dt', null, 'Meta'), h('dd', null, goal.title))),
      h('label', { class: 'switch switch--inline', for: 'sim-task' }, check, h('span', { class: 'switch__track', 'aria-hidden': 'true' }), h('span', { class: 'switch__label' }, 'Criar a tarefa do próximo passo deste mês')),
      h('div', { class: 'row-actions' },
        button('Confirmar plano', { variant: 'primary', size: 'sm', onClick: async () => {
          try {
            if (!financeEnabled()) await enableFinance('plano');
            await savePlan({ goalId, mode: usePct ? 'percent' : 'fixed', amountCents: cur.perMonthCents, percent: usePct || 0, months: cur.months, source: 'simulator' });
            box.remove();
            sheet.close();
            toast(`Plano definido: ${formatMoney(cur.perMonthCents)} por mês.`, { action: { label: 'Registrar agora', fn: () => openProgressLog(goalId) } });
            if (check.checked) {
              openTaskForm({
                goalId, areaId: goal.areaId, nextStep: true,
                title: `Separar ${formatMoney(cur.perMonthCents)} para ${goal.title} neste mês`,
              });
            }
          } catch (err) { toastError(err); }
        } }),
        button('Cancelar', { variant: 'ghost', size: 'sm', onClick: () => box.remove() })));
    root.querySelector('.sim__actions').after(box);
    box.scrollIntoView({ block: 'nearest' });
  }

  return sheet;
}

function monthsUntil(dateISO) {
  const d = new Date();
  const t = new Date(`${dateISO}T00:00:00`);
  return Math.max(1, Math.round((t - d) / (30.4375 * 86400000)));
}

function addMonthsISO(i) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Cenários salvos de uma meta (usados na tela da meta). */
export const savedScenarios = (goalId) => [...state.scenarios.values()].filter((s) => s.goalId === goalId).sort((a, b) => b.updatedAt - a.updatedAt);
export { equivalents };
