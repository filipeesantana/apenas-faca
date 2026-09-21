/**
 * Análises — central de interpretação.
 * 1. Visão geral (período escolhido)  2. Merece atenção (situação atual, filtrável)
 * 3. Tendências (período × anterior)   4. Dados de apoio (fluxo, áreas, adiamentos, ritmo)
 */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { sectionHead, pageHead, emptyState, button } from '../ui/components.js';
import { pairedChart } from '../ui/charts.js';
import { labelWithHelp, HELP } from '../ui/help.js';
import { state } from '../core/store.js';
import { computeInsights, CATEGORIES } from '../domain/insights.js';
import { weeklyFlow, areaOverview, hasHistory, rangeSummary } from '../domain/stats.js';
import { openTasks, isOverdue, stuckTasks } from '../domain/tasks.js';
import { activeGoals, paceOf, lastMovementAt } from '../domain/goals.js';
import { rateText } from '../domain/planning.js';
import { formatDay, relativeTime, startOfDayTs, endOfDayTs, daysSince, DAY } from '../utils/dates.js';
import { plural, formatMoney, formatMinutes } from '../utils/numbers.js';
import { pickCopy } from '../content/microcopy.js';
import { insightRow } from './insight-card.js';
import { taskList } from './task-row.js';
import { openReview } from './review.js';
import { resolvePeriod, previousPeriod, periodControl } from './period.js';

const ORDER = ['acumulo', 'consistencia', 'execucao', 'direcao', 'ritmo', 'equilibrio', 'cuidados'];
let catFilter = 'all';
let showHidden = false;
let showAll = false;
const INITIAL_ROWS = 6;

const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

export function analyticsView(route) {
  const per = resolvePeriod(route.query);
  const empty = !state.events.length || !hasHistory(1);
  const insights = computeInsights();
  const visible = insights.filter((i) => !i.suppressed);
  const hidden = insights.filter((i) => i.suppressed);

  const view = h('div', { class: 'view view--wide view--analytics' },
    pageHead('Análises', pickCopy('analytics', [empty ? 'empty' : !visible.length ? 'calm' : 'any']), periodControl('analises', per)));

  if (empty) {
    add(view, emptyState({ icon: 'lens', title: 'As análises ficam úteis com alguns dias de uso.', text: 'Continue registrando. Acúmulo de tarefas, adiamentos repetidos, metas paradas e áreas esquecidas aparecem aqui automaticamente.', compact: true }));
    return view;
  }

  add(view, overview(per));
  add(view, attentionSection(visible, hidden));
  add(view, h('div', { class: 'an-grid an-grid--2' }, trendsSection(per), flowSection(route.query.ver === 'fluxo')));
  add(view, h('div', { class: 'an-grid an-grid--3' }, paceSection(), areasSection(), stuckSection()));
  if (route.query.ver && route.query.ver !== 'fluxo' && CATEGORIES[route.query.ver]) catFilter = route.query.ver;
  return view;
}

/* ---------- 1. Visão geral ---------- */

function overview(per) {
  const from = startOfDayTs(per.from);
  const to = endOfDayTs(per.to);
  const prev = previousPeriod(per);
  const s = rangeSummary(from, to);
  const p = rangeSummary(startOfDayTs(prev.from), endOfDayTs(prev.to));
  const open = openTasks();
  const late = open.filter((t) => isOverdue(t)).length;
  const stuck = stuckTasks(2).length;
  const goals = activeGoals();
  const idle = goals.filter((g) => { const l = lastMovementAt(g); return Date.now() - g.createdAt > 14 * DAY && (!l || daysSince(l) > 30); }).length;
  const withDate = goals.filter((g) => g.targetDate && g.type);
  const off = withDate.filter((g) => { const x = paceOf(g); return x?.offPace || x?.datePassed; }).length;
  const areas = areaOverview();
  const quiet = areas.filter((a) => (a.open || a.goals) && (!a.lastActivity || daysSince(a.lastActivity) >= 14)).length;

  const diff = s.completed - p.completed;
  const deltaText = !s.completed && !p.completed ? 'Sem conclusões nos dois períodos' : diff > 0 ? `${diff} a mais que no período anterior` : diff < 0 ? `${-diff} a menos que no período anterior` : 'Igual ao período anterior';

  const tiles = [
    { label: 'Execução', value: s.completed, unit: s.completed === 1 ? 'concluída' : 'concluídas', hint: deltaText, href: '#/tarefas?ver=concluidas', tone: null, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : null },
    { label: 'Pendências', value: open.length, unit: open.length === 1 ? 'aberta' : 'abertas', hint: late ? `${late} com prazo vencido` : 'Nenhuma vencida', href: late ? '#/tarefas?f=atrasadas' : '#/tarefas', tone: late >= 5 ? 'bad' : late ? 'warn' : null },
    { label: 'Adiamentos', value: stuck, unit: stuck === 1 ? 'recorrente' : 'recorrentes', hint: 'Tarefas adiadas 2 vezes ou mais', href: '#/tarefas?f=travadas', tone: stuck ? 'warn' : null },
    { label: 'Metas ativas', value: goals.length, unit: '', hint: idle ? `${idle} sem movimento há 30 dias` : goals.length ? 'Todas com movimento recente' : 'Nenhuma meta criada', href: idle ? '#/metas?f=paradas' : '#/metas', tone: idle ? 'warn' : null },
    { label: 'Ritmo', value: withDate.length ? off : '—', unit: withDate.length ? 'abaixo do ritmo' : '', hint: withDate.length ? `de ${plural(withDate.length, 'meta com prazo', 'metas com prazo')}` : 'Nenhuma meta com prazo', onClick: () => scrollTo('an-ritmo'), tone: off ? 'warn' : null },
    { label: 'Equilíbrio', value: quiet, unit: quiet === 1 ? 'área parada' : 'áreas paradas', hint: 'Sem atividade há 14 dias ou mais', onClick: () => scrollTo('an-areas'), tone: quiet ? 'warn' : null },
  ];
  return h('section', { class: 'ov', 'aria-label': `Visão geral ${per.label}` }, tiles.map((t) => {
    const inner = [
      h('span', { class: 'ov__label' }, t.label, t.tone && h('span', { class: 'sr-only' }, ' — merece atenção')),
      h('span', { class: 'ov__value' }, String(t.value), t.unit && h('span', { class: 'ov__unit' }, ` ${t.unit}`)),
      h('span', { class: 'ov__hint' }, t.dir && icon(t.dir === 'up' ? 'trend' : 'trendDown', { size: 13 }), t.hint),
    ];
    return t.href
      ? h('a', { class: ['ov__tile', t.tone && `ov__tile--${t.tone}`], href: t.href }, inner)
      : h('button', { type: 'button', class: ['ov__tile', t.tone && `ov__tile--${t.tone}`], onClick: t.onClick }, inner);
  }));
}

/* ---------- 2. Merece atenção ---------- */

function attentionSection(visible, hidden) {
  const counts = new Map(ORDER.map((c) => [c, visible.filter((i) => i.category === c).length]));
  if (catFilter !== 'all' && !counts.get(catFilter)) catFilter = 'all';
  const list = h('div', { class: 'ins-list' });
  const empty = h('p', { class: 'muted ins-list__empty', hidden: true }, 'Nada nesta categoria.');
  const more = h('button', { type: 'button', class: 'ins-more', onClick: () => { showAll = true; applyFilter(); } });
  const applyFilter = () => {
    let shown = 0;
    let matching = 0;
    list.querySelectorAll('.ins').forEach((el) => {
      const ok = catFilter === 'all' || el.dataset.cat === catFilter;
      if (ok) matching++;
      const visibleNow = ok && (showAll || catFilter !== 'all' || matching <= INITIAL_ROWS);
      el.hidden = !visibleNow;
      if (visibleNow) shown++;
    });
    empty.hidden = matching > 0;
    const rest = matching - shown;
    more.hidden = rest <= 0;
    more.textContent = `Mostrar mais ${rest}`;
  };
  for (const c of ORDER) {
    for (const i of visible.filter((x) => x.category === c)) {
      const row = insightRow(i);
      row.dataset.cat = c;
      add(list, row);
    }
  }
  const chips = h('div', { class: 'filter-chips', role: 'group', 'aria-label': 'Filtrar por perspectiva' },
    [['all', 'Todas', visible.length], ...ORDER.filter((c) => counts.get(c)).map((c) => [c, CATEGORIES[c].label, counts.get(c)])].map(([id, label, n]) => h('button', {
      type: 'button', class: 'chip chip--sm', 'aria-pressed': String(catFilter === id), title: id === 'all' ? null : CATEGORIES[id].question,
      onClick: (e) => {
        catFilter = id;
        chips.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        applyFilter();
      },
    }, label, h('span', { class: 'chip__count' }, n))));
  applyFilter();

  const sec = h('section', { class: 'section an-att', 'aria-labelledby': 'an-att-h' },
    sectionHead('Merece atenção', { id: 'an-att-h', count: visible.length || null, action: h('span', { class: 'muted small' }, 'Situação atual') }));
  if (!visible.length) {
    add(sec, h('p', { class: 'an-calm' }, icon('check', { size: 16 }), 'Nada fora do comum agora. Atrasos, acúmulo, metas fora do ritmo e áreas paradas aparecem aqui.'));
  } else {
    add(list, more);
    add(sec, chips, list, empty);
  }
  if (hidden.length) {
    const hiddenBox = h('div', { class: 'ins-list is-dim', hidden: !showHidden }, hidden.map((i) => insightRow(i)));
    const btn = button(showHidden ? 'Esconder itens ocultados' : `Ver ${plural(hidden.length, 'item ocultado', 'itens ocultados')}`, {
      variant: 'ghost', size: 'sm',
      onClick: () => { showHidden = !showHidden; hiddenBox.hidden = !showHidden; btn.querySelector('span').textContent = showHidden ? 'Esconder itens ocultados' : `Ver ${plural(hidden.length, 'item ocultado', 'itens ocultados')}`; },
    });
    add(sec, h('div', { class: 'hidden-insights' }, btn, hiddenBox));
  }
  return sec;
}

/* ---------- 3. Tendências ---------- */

function trendsSection(per) {
  const prev = previousPeriod(per);
  const s = rangeSummary(startOfDayTs(per.from), endOfDayTs(per.to));
  const p = rangeSummary(startOfDayTs(prev.from), endOfDayTs(prev.to));
  const rows = [
    ['Tarefas concluídas', s.completed, p.completed, (v) => v, true],
    ['Tarefas criadas', s.created, p.created, (v) => v, null],
    ['Adiamentos', s.postponed, p.postponed, (v) => v, false],
    ['Canceladas', s.dropped, p.dropped, (v) => v, null],
    ['Metas movimentadas', s.goalsMoved, p.goalsMoved, (v) => v, true],
    ['Guardado em metas', s.moneyIn, p.moneyIn, (v) => (v ? formatMoney(v) : '—'), true],
    ['Tempo registrado', s.minutes, p.minutes, (v) => (v ? formatMinutes(v) : '—'), true],
  ].filter(([, a, b]) => a || b);
  return h('section', { class: 'card section', 'aria-labelledby': 'an-trend-h' },
    sectionHead('Tendências', { id: 'an-trend-h', action: h('span', { class: 'muted small' }, `${per.short} × período anterior`) }),
    rows.length ? h('table', { class: 'trend' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Indicador')), h('th', { scope: 'col' }, 'Agora'), h('th', { scope: 'col' }, 'Antes'), h('th', { scope: 'col' }, 'Mudança'))),
      h('tbody', null, rows.map(([label, a, b, fmt, goodUp]) => {
        const d = a - b;
        const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
        const tone = goodUp == null || dir === 'flat' ? '' : (dir === 'up') === goodUp ? 'is-good' : 'is-bad';
        return h('tr', null,
          h('th', { scope: 'row' }, label),
          h('td', null, fmt(a)),
          h('td', { class: 'muted' }, fmt(b)),
          h('td', { class: ['trend__delta', tone] }, dir === 'flat' ? 'igual' : [h('span', { 'aria-hidden': 'true' }, dir === 'up' ? '↑ ' : '↓ '), dir === 'up' ? 'aumentou' : 'diminuiu']));
      }))) : h('p', { class: 'muted' }, 'Sem movimento suficiente para comparar.'),
    h('p', { class: 'muted small trend__note' }, 'Comparação de fatos, sem julgamento: mais tarefas concluídas não significa, sozinho, mais produtividade.'));
}

/* ---------- 4. Dados de apoio ---------- */

function flowSection(focus) {
  const weeks = weeklyFlow(8);
  const created = weeks.reduce((a, w) => a + w.created, 0);
  const completed = weeks.reduce((a, w) => a + w.completed, 0);
  const diff = created - completed;
  const text = !created && !completed ? 'Sem movimento nas últimas 8 semanas.'
    : `Entraram ${created} e saíram ${completed} concluídas em 8 semanas. ${diff > 0 ? `A lista cresceu cerca de ${plural(diff, 'tarefa', 'tarefas')}.` : diff < 0 ? 'Você concluiu mais do que criou.' : 'A lista ficou estável.'}`;
  const sec = h('section', { class: ['card section', focus && 'is-focus'], id: 'fluxo', 'aria-labelledby': 'an-flow-h' },
    sectionHead('Entradas e saídas', { id: 'an-flow-h', action: h('span', { class: 'muted small' }, 'por semana') }),
    h('p', { class: 'small' }, text),
    pairedChart(weeks, {
      key: 'flow', compact: true, label: text, a: { key: 'created', label: 'Criadas' }, b: { key: 'completed', label: 'Concluídas' },
      tick: (w) => formatDay(w.start).replace(/ \d{4}$/, ''),
      tip: (w) => `Semana de ${formatDay(w.start)}: ${plural(w.created, 'criada', 'criadas')}, ${plural(w.completed, 'concluída', 'concluídas')}`,
    }),
    diff > 5 && h('div', { class: 'row-actions' }, button('Revisar pendências', { size: 'sm', icon: 'refresh', onClick: () => openReview() })));
  if (focus) requestAnimationFrame(() => scrollTo('fluxo'));
  return sec;
}

function areasSection() {
  const rows = areaOverview();
  return h('section', { class: 'card section', id: 'an-areas', 'aria-labelledby': 'an-areas-h' },
    sectionHead(labelWithHelp('Áreas', HELP.area, { className: 'label' }), { id: 'an-areas-h' }),
    rows.length ? h('ul', { class: 'area-rows' }, rows.map((r) => {
      const quiet = (r.open || r.goals) && (!r.lastActivity || daysSince(r.lastActivity) >= 14);
      return h('li', null, h('a', { class: 'area-row', href: `#/area/${r.area.id}` },
        h('span', { class: 'area-row__name', 'data-color': r.area.color }, h('span', { class: 'area-dot', 'aria-hidden': 'true' }), r.area.name),
        h('span', { class: 'area-row__facts' }, r.open ? plural(r.open, 'aberta', 'abertas') : '—', r.overdue ? h('span', { class: 'is-warn' }, ` · ${r.overdue} vencida${r.overdue > 1 ? 's' : ''}`) : null),
        h('span', { class: ['area-row__last', quiet && 'is-warn'] }, r.lastActivity ? relativeTime(r.lastActivity) : 'sem atividade')));
    })) : h('p', { class: 'muted' }, 'Nenhuma área criada.'));
}

function stuckSection() {
  const list = stuckTasks(2).slice(0, 5);
  return h('section', { class: 'card section', 'aria-labelledby': 'an-stuck-h' },
    sectionHead('Mais adiadas', { id: 'an-stuck-h', count: list.length || null }),
    list.length
      ? [taskList(list, { compact: true, showArea: false }),
        h('div', { class: 'row-actions' }, button('Revisar estas', { size: 'sm', icon: 'refresh', onClick: () => openReview(list.map((t) => t.id)) }))]
      : h('p', { class: 'muted' }, 'Nenhuma tarefa foi adiada repetidamente.'));
}

function paceSection() {
  const goals = activeGoals();
  return h('section', { class: 'card section', id: 'an-ritmo', 'aria-labelledby': 'an-ritmo-h' },
    sectionHead(labelWithHelp('Ritmo das metas', HELP.ritmo, { className: 'label' }), { id: 'an-ritmo-h' }),
    goals.length ? h('ul', { class: 'pace-rows' }, goals.map((g) => {
      const p = paceOf(g);
      let status; let tone = null;
      if (p.datePassed) { status = 'A data escolhida já passou'; tone = 'warn'; }
      else if (p.offPace) { status = `Precisa de ${rateText(g, p.neededPerDay)} · média ${rateText(g, p.recent.perDay)}`; tone = 'warn'; }
      else if (p.neededPerDay != null && p.recent) status = `No ritmo · precisa de ${rateText(g, p.neededPerDay)}`;
      else if (p.recent) status = p.recent.perDay > 0 ? `Média ${rateText(g, p.recent.perDay)} · sem prazo` : 'Sem avanço recente';
      else status = p.neededPerDay != null ? `Precisa de ${rateText(g, p.neededPerDay)} · histórico curto` : 'Histórico ainda curto';
      return h('li', null, h('a', { class: 'pace-row', href: `#/metas/${g.id}?ver=plano` },
        h('span', { class: 'pace-row__title' }, g.title),
        h('span', { class: ['pace-row__status', tone && `is-${tone}`] }, tone && icon('alert', { size: 13 }), status)));
    })) : h('p', { class: 'muted' }, 'Nenhuma meta ativa.'));
}
