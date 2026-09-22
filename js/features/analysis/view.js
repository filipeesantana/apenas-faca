/**
 * Análises — "primeiro eu escolho, depois eu vejo, depois eu entendo, depois eu ajo".
 * 1. O que analisar  2. Período  3. Como ver  →  Resumo · Visualização · O que merece atenção · O que vale fazer agora.
 *
 * A página é montada uma vez por navegação/alteração de dados. Mudar opções só troca a região
 * de resultados; trocar aba ou agrupamento só troca o gráfico; ajuda e explicações abrem no lugar.
 */
import { h, add, swap } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { pageHead, button, emptyState } from '../../ui/components.js';
import { helpTip, HELP } from '../../ui/help.js';
import { state } from '../../core/store.js';
import { local } from '../../utils/helpers.js';
import { today, addDays, isValidISODate } from '../../utils/dates.js';
import { plural } from '../../utils/numbers.js';
import { listAreas } from '../../domain/areas.js';
import { allGoals } from '../../domain/goals.js';
import { computeInsights, nextActions } from '../../domain/insights.js';
import { SCOPES, normalizeSelection, scopeLabel, summary, sentence, compareSentence, hasDataFor, capacity, weekLoad } from '../../analysis/engine.js';
import { PERIODS, resolvePeriod, previousPeriod, customCompare, granularities, defaultGranularity, GRAN_LABEL, firstDataDay } from '../../analysis/periods.js';
import { renderViz, tabsFor, TIME_TABS, emptyViz } from './charts.js';
import { insightList, nextActionsBlock } from './insights-ui.js';
import { openTaskForm } from '../task-form.js';
import { openGoalForm } from '../goal-form.js';
import { openTaskSheet } from '../task-sheet.js';
import { openProgressLog } from '../progress-log.js';
import { openWeekReview } from './week-review.js';

const KEY = 'norte-analise';
const MODES = {
  essencial: { label: 'Essencial', desc: 'O mais importante, de forma simples.' },
  detalhado: { label: 'Detalhado', desc: 'Mais números, gráficos e explicações.' },
  comparar: { label: 'Comparar', desc: 'Este período ao lado de outro.' },
};
const DEFAULTS = { scope: 'tudo', areaId: null, goalId: null, period: '7d', de: null, ate: null, mode: 'essencial', cmp: 'auto', cmpDe: null, tab: null, gran: null };

let S = { ...DEFAULTS, ...(local.get(KEY) || {}) };
const firstVisit = !local.get(KEY);
let builderOpen = null; // null = decide pelo tamanho da tela
const save = () => local.set(KEY, S);
const isNarrow = () => matchMedia('(max-width: 720px)').matches;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let seq = 0;
const uidFor = (p) => `${p}-${++seq}`;

/* ---------- Estado derivado ---------- */

function selection() {
  const sel = normalizeSelection({ scope: S.scope, areaId: S.areaId, goalId: S.goalId });
  S.scope = sel.scope; S.areaId = sel.areaId; S.goalId = sel.goalId;
  return sel;
}
function periodOf() { return resolvePeriod(S.period, { de: S.de, ate: S.ate }); }
function comparisonOf(p) {
  if (S.mode !== 'comparar') return null;
  if (S.cmp === 'custom' && S.cmpDe) return customCompare(p, S.cmpDe);
  return previousPeriod(p);
}
function tabOf(sel) {
  const tabs = tabsFor(sel.scope);
  return tabs.some(([id]) => id === S.tab) ? S.tab : tabs[0][0];
}
function granOf(p) {
  const list = granularities(p);
  return list.includes(S.gran) ? S.gran : (list.includes(defaultGranularity(p)) ? defaultGranularity(p) : list[0]);
}

/* ---------- Página ---------- */

export function analysisView(route) {
  applyRoute(route.query || {});
  const sel = selection();
  if (builderOpen === null) builderOpen = firstVisit || !isNarrow();

  const results = h('div', { class: 'an-results', id: 'an-results' });
  const status = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const bar = summaryBar();
  const builderEl = builder(sel);
  builderEl.hidden = !builderOpen;

  const refresh = ({ announce = true } = {}) => {
    const s = selection();
    save();
    bar.update();
    swap(results, ...renderResults(s));
    if (announce) status.textContent = `Resultados atualizados: ${bar.text()}.`;
  };
  builderEl.onChange = refresh;
  bar.onToggle = (open) => {
    builderOpen = open;
    builderEl.hidden = !open;
    bar.update();
    if (open) {
      builderEl.classList.remove('is-entering'); void builderEl.offsetWidth; builderEl.classList.add('is-entering');
      requestAnimationFrame(() => {
        const r = builderEl.getBoundingClientRect();
        if (r.top < 0 || r.top > innerHeight * 0.6) builderEl.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
        builderEl.querySelector('input:checked')?.focus({ preventScroll: true });
      });
    }
  };
  bar.builder = builderEl;

  const view = h('div', { class: 'view view--wide view--analysis' },
    pageHead('Análises', 'Entenda o que está acontecendo a partir dos seus próprios dados.',
      button('Revisar minha semana', { icon: 'refresh', onClick: () => openWeekReview() })),
    bar.el, builderEl, status, results);
  swap(results, ...renderResults(sel));
  bar.update();
  return view;
}

/** Links de outras telas: #/analises?meta=ID · ?area=ID · ?escopo=tarefas · ?periodo=30d */
function applyRoute(q) {
  let touched = false;
  if (q.meta && state.goals.has(q.meta)) { S.scope = 'meta'; S.goalId = q.meta; touched = true; }
  else if (q.area && state.areas.has(q.area)) { S.scope = 'area'; S.areaId = q.area; touched = true; }
  else if (q.escopo && SCOPES[q.escopo]) { S.scope = q.escopo; touched = true; }
  if (q.periodo && PERIODS.some((p) => p.id === q.periodo)) { S.period = q.periodo; touched = true; }
  if (touched) { save(); history.replaceState(null, '', '#/analises'); }
}

/* ---------- Barra "Analisando: …" (fixa ao rolar) ---------- */

function summaryBar() {
  const textEl = h('span', { class: 'an-bar__value' });
  const btn = h('button', { type: 'button', class: 'btn btn--secondary btn--sm an-bar__btn', 'aria-controls': 'an-builder' });
  const el = h('div', { class: 'an-bar', 'data-help-slot': '' },
    h('p', { class: 'an-bar__text' }, h('span', { class: 'an-bar__label' }, 'Analisando: '), textEl), btn);
  let builderVisible = true;
  const api = {
    el, builder: null, onToggle: null,
    text: () => {
      const sel = selection(); const p = periodOf();
      return [scopeLabel(sel), /dias/.test(p.label) ? p.label : `${p.label} (${p.daysText})`, MODES[S.mode].label].join(' · ');
    },
    update() {
      textEl.textContent = api.text();
      // Aberto e visível → "Recolher opções"; fechado ou fora da tela → "Alterar".
      const collapseLabel = builderOpen && builderVisible;
      btn.replaceChildren(icon(collapseLabel ? 'chevronDown' : 'edit', { size: 16 }), h('span', null, collapseLabel ? 'Recolher' : 'Alterar'));
      btn.classList.toggle('is-up', collapseLabel);
      btn.setAttribute('aria-expanded', String(!!builderOpen));
      el.classList.toggle('is-collapsed', !builderOpen);
    },
  };
  btn.addEventListener('click', () => {
    if (builderOpen && !builderVisible) {
      api.builder?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      api.builder?.querySelector('input:checked')?.focus({ preventScroll: true });
      return;
    }
    api.onToggle?.(!builderOpen);
  });
  // Detecta quando o construtor sai da tela (a barra continua fixa no topo com "Alterar").
  requestAnimationFrame(() => {
    if (!api.builder || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => {
      if (!el.isConnected) { io.disconnect(); return; }
      builderVisible = e.isIntersecting;
      el.classList.toggle('is-stuck', !e.isIntersecting && builderOpen);
      api.update();
    }, { rootMargin: '-80px 0px 0px 0px', threshold: 0 });
    io.observe(api.builder);
  });
  return api;
}

/* ---------- Construtor ---------- */

/** Grupo de opções com rádios nativos (setas do teclado, leitores de tela). Seleção: borda, fundo e ✓. */
function radioGroup(name, options, value, onChange, { variant = 'card', label, key = name } = {}) {
  const group = h('div', { class: ['opts', `opts--${variant}`], role: 'radiogroup', 'aria-label': label });
  for (const o of options) {
    const input = h('input', { type: 'radio', class: 'opt__input', name, value: o.value, checked: o.value === value, 'data-key': `an-${key}-${o.value}` });
    input.addEventListener('change', () => { if (input.checked) onChange(o.value); });
    add(group, h('label', { class: 'opt' }, input,
      h('span', { class: 'opt__check', 'aria-hidden': 'true' }, icon('check', { size: 14 })),
      h('span', { class: 'opt__body' },
        h('span', { class: 'opt__title' }, o.label),
        o.desc && h('span', { class: 'opt__desc' }, o.desc))));
  }
  return group;
}

function step(n, title, help, ...content) {
  const id = uidFor('an-q');
  return h('fieldset', { class: 'builder__step', 'aria-labelledby': id },
    h('div', { class: 'builder__q' },
      h('span', { class: 'builder__n', 'aria-hidden': 'true' }, String(n)),
      h('h2', { class: 'builder__title', id }, title),
      help && helpTip(help)),
    content);
}

function builder(sel) {
  const root = h('section', { class: 'builder card', id: 'an-builder', 'aria-label': 'Escolher o que analisar' });
  const changed = () => root.onChange?.();
  const uniq = uidFor('an');

  /* 1. O que analisar */
  const areaSel = h('select', { class: 'input', id: `${uniq}-area`, 'data-key': 'an-area' },
    listAreas().map((a) => h('option', { value: a.id, selected: a.id === S.areaId }, a.name)));
  areaSel.addEventListener('change', () => { S.areaId = areaSel.value; changed(); });
  const goals = allGoals();
  const byStatus = (st) => goals.filter((g) => g.status === st);
  const goalSel = h('select', { class: 'input', id: `${uniq}-goal`, 'data-key': 'an-goal' },
    [['active', 'Em andamento'], ['done', 'Concluídas'], ['archived', 'Arquivadas']].map(([st, lbl]) => byStatus(st).length > 0 && h('optgroup', { label: lbl },
      byStatus(st).map((g) => h('option', { value: g.id, selected: g.id === S.goalId }, g.title)))));
  goalSel.addEventListener('change', () => { S.goalId = goalSel.value; changed(); });
  const areaBox = h('div', { class: 'builder__sub', hidden: S.scope !== 'area' },
    h('label', { class: 'field__label', for: areaSel.id }, 'Qual área?'), areaSel);
  const goalBox = h('div', { class: 'builder__sub', hidden: S.scope !== 'meta' },
    goals.length
      ? [h('label', { class: 'field__label', for: goalSel.id }, 'Qual meta?'), goalSel]
      : h('p', { class: 'muted' }, 'Você ainda não criou metas. ', h('button', { type: 'button', class: 'link-btn', onClick: () => openGoalForm() }, 'Criar uma meta')));
  const scopeOpts = Object.entries(SCOPES).map(([value, s]) => ({ value, label: s.label, desc: s.desc }));
  const scopeGroup = radioGroup(`${uniq}-scope`, scopeOpts, S.scope, (v) => {
    S.scope = v; S.tab = null;
    if (v === 'area' && !S.areaId) S.areaId = areaSel.value || null;
    if (v === 'meta' && !S.goalId) S.goalId = goalSel.value || null;
    areaBox.hidden = v !== 'area'; goalBox.hidden = v !== 'meta';
    changed();
  }, { label: 'O que analisar', key: 'scope' });

  /* 2. Período */
  const T = today();
  const minDay = firstDataDay() < T ? firstDataDay() : addDays(T, -365);
  const deIn = h('input', { type: 'date', class: 'input input--date', id: `${uniq}-de`, value: S.de || addDays(T, -13), max: T, 'data-key': 'an-de' });
  const ateIn = h('input', { type: 'date', class: 'input input--date', id: `${uniq}-ate`, value: S.ate || T, max: T, 'data-key': 'an-ate' });
  const dateErr = h('p', { class: 'field-error', role: 'alert', hidden: true }, 'A data inicial precisa ser igual ou anterior à final.');
  const onDates = () => {
    const ok = isValidISODate(deIn.value) && isValidISODate(ateIn.value) && deIn.value <= ateIn.value;
    dateErr.hidden = ok || !deIn.value || !ateIn.value;
    if (!ok) return;
    S.de = deIn.value; S.ate = ateIn.value; updateRange(); changed();
  };
  deIn.addEventListener('change', onDates); ateIn.addEventListener('change', onDates);
  const customBox = h('div', { class: 'builder__sub builder__dates', hidden: S.period !== 'custom' },
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: deIn.id }, 'De'), deIn),
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: ateIn.id }, 'Até'), ateIn),
    dateErr);
  const rangeEl = h('p', { class: 'builder__range' });
  const updateRange = () => {
    const p = periodOf();
    rangeEl.replaceChildren(icon('calendar', { size: 15 }), h('span', null, `${p.range} · ${p.daysText}`));
    updateCompare();
  };
  const periodGroup = radioGroup(`${uniq}-per`, PERIODS.map((p) => ({ value: p.id, label: p.label })), S.period, (v) => {
    S.period = v;
    if (v === 'custom' && !S.de) { S.de = deIn.value; S.ate = ateIn.value; }
    customBox.hidden = v !== 'custom';
    updateRange(); changed();
  }, { variant: 'chip', label: 'Período', key: 'per' });

  /* 3. Como ver */
  const cmpDeIn = h('input', { type: 'date', class: 'input input--date', id: `${uniq}-cmp`, max: T, min: minDay, 'data-key': 'an-cmp' });
  cmpDeIn.addEventListener('change', () => {
    if (!isValidISODate(cmpDeIn.value)) return;
    S.cmpDe = cmpDeIn.value;
    const o = customCompare(periodOf(), S.cmpDe);
    const desc = cmpBox.querySelector('input[value="custom"]')?.closest('.opt')?.querySelector('.opt__desc');
    if (desc && o) desc.textContent = `${o.range} · mesmo tamanho`;
    changed();
  });
  const cmpBox = h('div', { class: 'builder__sub builder__cmp', hidden: S.mode !== 'comparar' });
  const updateCompare = () => {
    const p = periodOf();
    cmpBox.hidden = S.mode !== 'comparar';
    if (cmpBox.hidden) return;
    const prev = previousPeriod(p);
    if (!prev) {
      cmpBox.replaceChildren(h('p', { class: 'builder__note' }, icon('info', { size: 15 }), h('span', null, 'Para comparar, escolha um período com início e fim, como “Este mês” ou “Últimos 30 dias”.')));
      return;
    }
    if (!S.cmpDe) S.cmpDe = prev.from;
    cmpDeIn.value = S.cmpDe;
    const other = customCompare(p, S.cmpDe);
    cmpBox.replaceChildren(
      h('p', { class: 'field__label' }, 'Comparar com'),
      radioGroup(`${uniq}-cmpk`, [
        { value: 'auto', label: `${prev.label[0].toUpperCase()}${prev.label.slice(1)}`, desc: prev.range },
        { value: 'custom', label: 'Outro período', desc: other ? `${other.range} · mesmo tamanho` : 'Escolha a data de início' },
      ], S.cmp, (v) => { S.cmp = v; cmpDateBox.hidden = v !== 'custom'; changed(); }, { variant: 'row', label: 'Comparar com', key: 'cmpk' }),
      cmpDateBox);
    cmpDateBox.hidden = S.cmp !== 'custom';
  };
  const cmpDateBox = h('div', { class: 'field builder__cmp-date' }, h('label', { class: 'field__label', for: cmpDeIn.id }, 'Início do outro período'), cmpDeIn);
  const modeGroup = radioGroup(`${uniq}-mode`, Object.entries(MODES).map(([value, m]) => ({ value, label: m.label, desc: m.desc })), S.mode, (v) => {
    S.mode = v; updateCompare(); changed();
  }, { label: 'Como ver', key: 'mode' });

  add(root,
    step(1, 'O que você quer analisar?', HELP.analisarO, scopeGroup, areaBox, goalBox),
    step(2, 'Qual período?', HELP.periodo, periodGroup, customBox, rangeEl),
    step(3, 'Como quer ver?', HELP.visao, modeGroup, cmpBox));
  updateRange();
  return root;
}

/* ---------- Resultados ---------- */

function renderResults(sel) {
  const p = periodOf();
  const compare = S.mode === 'comparar';
  const prev = comparisonOf(p);
  const detailed = S.mode !== 'essencial';

  if (!state.events.length) {
    return [emptyState({
      icon: 'lens', title: 'Ainda não há atividade suficiente para analisar.',
      text: 'Conforme você cria e conclui tarefas ou registra o progresso das metas, esta página mostra o que está acontecendo.',
      actions: [button('Adicionar uma tarefa', { variant: 'primary', icon: 'plus', onClick: () => openTaskForm() }), button('Criar uma meta', { icon: 'target', onClick: () => openGoalForm() })],
    })];
  }

  const prevOk = prev && hasDataFor(prev);
  const sum = summary(sel, p, prevOk ? prev : null);
  const out = [];

  /* Resumo */
  let metrics = sum.metrics.filter((m) => detailed || !m.detail);
  if (compare) metrics = [...metrics.filter((m) => !m.now), ...metrics.filter((m) => m.now)];
  if (!detailed) metrics = metrics.slice(0, 4);
  const sentenceText = compare && prevOk ? compareSentence(sel, sum, prev.label) : sentence(sel, sum);
  out.push(section('an-resumo', 'Resumo', `${p.range}`,
    h('div', { class: 'metrics' }, metrics.map((m) => metric(m, compare && prevOk))),
    h('p', { class: 'an-sentence' }, sentenceText),
    compare && !prev && h('p', { class: 'builder__note' }, icon('info', { size: 15 }), h('span', null, 'O período “Tudo” não tem um período anterior para comparar.')),
    compare && prev && !prevOk && h('p', { class: 'builder__note' }, icon('info', { size: 15 }), h('span', null, 'Ainda não há dados suficientes para comparar estes períodos.')),
    compare && prevOk && h('p', { class: 'an-cmp-legend' }, h('span', null, `Comparando com: ${prev.range}.`), ' Métricas marcadas com “hoje” mostram a situação atual e não entram na comparação.')));

  /* Visualização */
  out.push(vizSection(sel, p, prevOk ? prev : null, compare));

  /* Planejado × realizado em destaque (Tudo / Tarefas) */
  if (!compare && (sel.scope === 'tudo' || sel.scope === 'tarefas')) {
    const pr = planHighlight();
    if (pr) out.push(pr);
  }

  /* O que merece atenção */
  const insights = computeInsights(sel).filter((i) => !i.suppressed);
  const actionable = insights.filter((i) => !i.positive);
  out.push(section('an-atencao', 'O que merece atenção', 'situação de hoje',
    insights.length
      ? insightList(insights, { limit: detailed ? 6 : 3 })
      : h('p', { class: 'an-calm' }, icon('check', { size: 16 }), h('span', null, 'Nada pede atenção neste recorte agora.'))));

  /* O que vale fazer agora */
  const acts = nextActions(actionable, 2);
  out.push(section('an-agora', 'O que vale fazer agora', null,
    nextActionsBlock(acts, { fallback: h('p', { class: 'muted small' }, 'Se quiser, faça uma revisão rápida da semana.', ' ', h('button', { type: 'button', class: 'link-btn', onClick: () => openWeekReview() }, 'Revisar minha semana')) })));
  return out;
}

function section(id, title, note, ...body) {
  return h('section', { class: 'an-section', 'aria-labelledby': `${id}-t` },
    h('div', { class: 'section-head' },
      h('h2', { class: 'label', id: `${id}-t` }, title),
      note && h('span', { class: 'section-head__note' }, note)),
    body);
}

function metric(m, showCompare) {
  const cmp = showCompare && m.compare;
  const inner = [
    h('span', { class: 'metric__label' }, m.label, m.now && showCompare && h('span', { class: 'metric__now' }, 'hoje')),
    h('span', { class: ['metric__value', m.accent && 'is-accent'] }, m.display),
    cmp
      ? h('span', { class: 'metric__cmp' }, `antes: ${m.compare.prev}`, h('span', { class: ['metric__diff', m.compare.diff > 0 && 'is-up', m.compare.diff < 0 && 'is-down'] }, m.compare.diffText))
      : m.hint && h('span', { class: 'metric__hint' }, m.warn && icon('alert', { size: 13 }), m.hint),
  ];
  const cls = ['metric', m.warn && 'metric--warn'];
  return m.href ? h('a', { class: cls, href: m.href }, inner) : h('div', { class: cls }, inner);
}

/* ---------- Visualização: troca local de aba e agrupamento ---------- */

function vizSection(sel, p, prev, compare) {
  const detailed = S.mode === 'detalhado';
  const body = h('div', { class: 'viz-body' });
  const toolbar = h('div', { class: 'viz-toolbar' });
  const goal = sel.scope === 'meta' ? state.goals.get(sel.goalId) : null;
  const ctx = {
    sel, period: p, prev, compare, gran: granOf(p), todayKey: today(), goal,
    emptyActions: () => [
      button('Escolher outro período', { size: 'sm', onClick: () => { const b = document.getElementById('an-builder'); if (b?.hidden) document.querySelector('.an-bar__btn')?.click(); requestAnimationFrame(() => document.querySelector('#an-builder .opts--chip input:checked')?.focus()); } }),
      button('Adicionar uma tarefa', { size: 'sm', variant: 'ghost', icon: 'plus', onClick: () => openTaskForm() }),
    ],
    openGoalForm: () => openGoalForm(),
    openTask: (id) => openTaskSheet(id),
    logProgress: (id) => openProgressLog(id),
  };
  const tabs = tabsFor(sel.scope);
  let tab = compare ? (sel.scope === 'meta' ? 'registros' : 'atividade') : detailed ? tabOf(sel) : tabs[0][0];

  const draw = () => {
    const needsGran = TIME_TABS.has(tab) || (tab === 'evolucao' && goal?.type === 'steps');
    const grans = granularities(p);
    toolbar.replaceChildren();
    if (needsGran && grans.length > 1) {
      add(toolbar, h('div', { class: 'segmented segmented--sm', role: 'group', 'aria-label': 'Agrupar' },
        grans.map((g) => h('button', {
          type: 'button', class: 'segmented__btn', 'aria-pressed': String(g === ctx.gran),
          onClick: () => { ctx.gran = g; S.gran = g; save(); draw(); },
        }, GRAN_LABEL[g]))));
    }
    toolbar.hidden = !toolbar.childElementCount;
    let node;
    try { node = renderViz(tab, ctx); } catch (err) { console.error(err); node = emptyViz('Não foi possível montar este gráfico. Seus dados estão salvos.'); }
    swap(body, node);
  };

  let tablist = null;
  if (detailed && tabs.length > 1) {
    const btns = [];
    const select = (id, focus) => {
      tab = id; S.tab = id; save();
      btns.forEach((b) => { const on = b.dataset.tab === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
      draw();
    };
    tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Visualizações' });
    tabs.forEach(([id, label]) => {
      const b = h('button', {
        type: 'button', role: 'tab', class: 'tabs__btn', id: `an-tab-${id}`, 'aria-controls': 'an-viz', 'data-tab': id,
        'aria-selected': String(id === tab), tabindex: id === tab ? '0' : '-1',
        onClick: () => select(id),
        onKeydown: (e) => {
          const i = tabs.findIndex(([x]) => x === id);
          const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
          if (n == null) return;
          e.preventDefault();
          select(tabs[(n + tabs.length) % tabs.length][0], true);
        },
      }, label);
      btns.push(b); add(tablist, b);
    });
  }
  draw();
  const panel = h('div', { class: 'viz-panel', id: 'an-viz', role: tablist ? 'tabpanel' : null, 'aria-labelledby': tablist ? `an-tab-${tab}` : null }, toolbar, body);
  if (tablist) tablist.addEventListener('click', () => panel.setAttribute('aria-labelledby', `an-tab-${tab}`));
  return section('an-viz-s', compare ? 'Comparação' : 'Visualização', null, h('div', { class: 'card viz-card' }, tablist, panel));
}

/* ---------- Planejado × realizado desta semana + capacidade recente ---------- */

function planHighlight() {
  const load = weekLoad();
  const cap = capacity();
  if (!load.planned && !cap) return null;
  const avg = cap ? Math.round(cap.avgDone) : null;
  const over = cap && load.planned > Math.max(3, cap.avgDone * 1.3);
  const reading = !cap
    ? 'Com mais algumas semanas de uso, o Norte compara o tamanho do plano com o seu ritmo real.'
    : over
      ? `O plano desta semana tem ${load.planned} tarefas com prazo; nas últimas ${cap.weeks} semanas você concluiu em média ${avg} por semana.`
      : `O plano desta semana (${plural(load.planned, 'tarefa', 'tarefas')}) está dentro do seu ritmo recente (${avg} por semana, em média).`;
  return section('an-plano', 'Planejado × realizado', 'esta semana',
    h('div', { class: ['card', 'plan-hl', over && 'plan-hl--warn'] },
      h('dl', { class: 'plan-hl__nums' },
        h('div', null, h('dt', null, 'Planejadas'), h('dd', null, String(load.planned))),
        h('div', null, h('dt', null, 'Concluídas'), h('dd', null, String(load.done))),
        h('div', null, h('dt', null, 'Pendentes'), h('dd', null, String(load.pending + load.postponed))),
        h('div', null, h('dt', null, 'Ritmo recente'), h('dd', null, avg != null ? `${avg}/sem.` : '—'))),
      h('p', { class: 'plan-hl__reading' }, reading, ' ', helpTip(HELP.capacidade))));
}
