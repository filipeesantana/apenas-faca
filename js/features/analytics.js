/** Análises: dados → interpretação → ação, em seis perspectivas. */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { sectionHead, pageHead, emptyState, button } from '../ui/components.js';
import { pairedChart } from '../ui/charts.js';
import { state } from '../core/store.js';
import { computeInsights, CATEGORIES } from '../domain/insights.js';
import { weeklyFlow, areaOverview, hasHistory } from '../domain/stats.js';
import { stuckTasks } from '../domain/tasks.js';
import { activeGoals, paceOf } from '../domain/goals.js';
import { rateText } from '../domain/planning.js';
import { formatDay, relativeTime } from '../utils/dates.js';
import { plural } from '../utils/numbers.js';
import { pickCopy } from '../content/microcopy.js';
import { insightCard } from './insight-card.js';
import { taskList } from './task-row.js';
import { openReview } from './review.js';

let showHidden = false;
const ORDER = ['acumulo', 'consistencia', 'execucao', 'direcao', 'ritmo', 'equilibrio', 'cuidados'];

export function analyticsView(route) {
  const insights = computeInsights();
  const visible = insights.filter((i) => !i.suppressed);
  const hidden = insights.filter((i) => i.suppressed);
  const empty = !state.events.length || !hasHistory(1);
  const view = h('div', { class: 'view view--wide view--analytics' },
    pageHead('Análises', pickCopy('analytics', [empty ? 'empty' : !visible.length ? 'calm' : 'any'])));

  if (empty) {
    add(view, emptyState({ icon: 'lens', title: 'As análises ficam úteis com alguns dias de uso.', text: 'Continue registrando o que faz. Acúmulo de tarefas, adiamentos repetidos, metas paradas e áreas esquecidas aparecem aqui automaticamente.' }));
  }

  // Visão rápida das perspectivas
  const byCat = new Map(ORDER.map((c) => [c, visible.filter((i) => i.category === c)]));
  add(view, h('nav', { class: 'cat-strip', 'aria-label': 'Perspectivas' }, ORDER.filter((c) => c !== 'cuidados').map((c) => {
    const n = byCat.get(c).length;
    const worst = byCat.get(c).reduce((m, i) => Math.max(m, i.positive ? 0 : i.severity), 0);
    return h('a', { class: ['cat', n && `cat--s${worst}`], href: `#/analises?ver=${c}` },
      h('span', { class: 'cat__label' }, CATEGORIES[c].label),
      h('span', { class: 'cat__q' }, CATEGORIES[c].question),
      h('span', { class: 'cat__n' }, n ? plural(n, 'ponto', 'pontos') : 'Nada a observar'));
  })));

  for (const c of ORDER) {
    const list = byCat.get(c);
    if (!list.length) continue;
    add(view, h('section', { class: ['section', route.query.ver === c && 'is-target'], id: `cat-${c}` },
      sectionHead(CATEGORIES[c].label, { action: h('span', { class: 'muted small' }, CATEGORIES[c].question) }),
      h('div', { class: 'insight-grid' }, list.map((i) => insightCard(i)))));
    if (route.query.ver === c) requestAnimationFrame(() => document.getElementById(`cat-${c}`)?.scrollIntoView({ block: 'start' }));
  }
  if (!visible.length && !empty) add(view, h('p', { class: 'muted section' }, 'Nada fora do comum agora. Quando algo merecer atenção — atraso, acúmulo, meta fora do ritmo — aparece aqui.'));
  if (hidden.length) {
    add(view, h('div', { class: 'hidden-insights' },
      button(showHidden ? 'Esconder ocultos' : `Mostrar ${plural(hidden.length, 'item oculto', 'itens ocultos')}`, { variant: 'ghost', size: 'sm', onClick: () => { showHidden = !showHidden; window.dispatchEvent(new CustomEvent('app:rerender')); } }),
      showHidden && h('div', { class: 'insight-grid is-dim' }, hidden.map((i) => insightCard(i, { showCategory: true })))));
  }

  add(view, h('h2', { class: 'label section' }, 'Dados de apoio'));
  add(view, flowSection(route.query.ver === 'fluxo'));
  add(view, h('div', { class: 'grid-2 grid-2--top' }, areasSection(), stuckSection()));
  const pace = paceSection();
  if (pace) add(view, pace);
  return view;
}

function flowSection(focus) {
  const weeks = weeklyFlow(8);
  const created = weeks.reduce((a, w) => a + w.created, 0);
  const completed = weeks.reduce((a, w) => a + w.completed, 0);
  const diff = created - completed;
  const text = !created && !completed
    ? 'Sem movimento nas últimas 8 semanas.'
    : `Nas últimas 8 semanas entraram ${created} tarefas e ${completed} foram concluídas. ${diff > 0 ? `A lista cresceu cerca de ${plural(diff, 'tarefa', 'tarefas')} (sem contar canceladas).` : diff < 0 ? 'Você concluiu mais do que criou.' : 'A lista se manteve estável.'}`;
  const sec = h('section', { class: ['card section', focus && 'is-focus'], id: 'fluxo' },
    sectionHead('Entradas e saídas'),
    h('p', null, text),
    pairedChart(weeks, {
      label: text, a: { key: 'created', label: 'Criadas' }, b: { key: 'completed', label: 'Concluídas' },
      tick: (w) => formatDay(w.start).replace(/ \d{4}$/, ''),
      tip: (w) => `Semana de ${formatDay(w.start)}: ${w.created} criadas, ${w.completed} concluídas`,
    }),
    diff > 5 && h('div', { class: 'row-actions' }, button('Revisar pendências', { variant: 'primary', size: 'sm', icon: 'refresh', onClick: () => openReview() })));
  if (focus) requestAnimationFrame(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  return sec;
}

function areasSection() {
  const rows = areaOverview();
  return h('section', { class: 'card section' },
    sectionHead('Áreas'),
    rows.length ? h('ul', { class: 'area-rows' }, rows.map((r) => h('li', null,
      h('a', { class: 'area-row', href: `#/area/${r.area.id}` },
        h('span', { class: 'area-row__name', 'data-color': r.area.color }, h('span', { class: 'area-dot', 'aria-hidden': 'true' }), r.area.name),
        h('span', { class: 'area-row__facts' },
          r.open ? plural(r.open, 'aberta', 'abertas') : 'nada aberto',
          r.overdue ? h('span', { class: 'is-warn' }, ` · ${r.overdue} vencida${r.overdue > 1 ? 's' : ''}`) : null,
          r.goals ? ` · ${plural(r.goals, 'meta', 'metas')}` : null),
        h('span', { class: 'area-row__last' }, r.lastActivity ? relativeTime(r.lastActivity) : 'sem atividade'),
        icon('chevronRight', { size: 16 }))))) : h('p', { class: 'muted' }, 'Nenhuma área criada.'));
}

function stuckSection() {
  const list = stuckTasks(2).slice(0, 5);
  return h('section', { class: 'card section' },
    sectionHead('Mais adiadas'),
    list.length
      ? [h('p', { class: 'muted small' }, 'Adiar de novo raramente resolve. Vale dividir em algo menor, dar um prazo realista ou cancelar.'),
        taskList(list, { compact: true }),
        h('div', { class: 'row-actions' }, button('Revisar estas', { size: 'sm', icon: 'refresh', onClick: () => openReview(list.map((t) => t.id)) }))]
      : h('p', { class: 'muted' }, 'Nenhuma tarefa foi adiada repetidamente.'));
}

function paceSection() {
  const goals = activeGoals();
  if (!goals.length) return null;
  return h('section', { class: 'card section' },
    sectionHead('Ritmo das metas'),
    h('ul', { class: 'pace-rows' }, goals.map((g) => {
      const p = paceOf(g);
      let status; let tone = null;
      if (p.datePassed) { status = 'A data escolhida já passou.'; tone = 'warn'; }
      else if (p.offPace) { status = `Precisa de ${rateText(g, p.neededPerDay)} · média recente ${rateText(g, p.recent.perDay)}`; tone = 'warn'; }
      else if (p.neededPerDay != null && p.recent) status = `No ritmo: precisa de ${rateText(g, p.neededPerDay)} · média ${rateText(g, p.recent.perDay)}`;
      else if (p.recent) status = p.recent.perDay > 0 ? `Média recente: ${rateText(g, p.recent.perDay)} · sem prazo definido` : 'Sem avanço líquido recente.';
      else status = p.neededPerDay != null ? `Precisa de ${rateText(g, p.neededPerDay)} · histórico ainda curto` : 'Histórico ainda curto para estimar.';
      return h('li', null, h('a', { class: 'pace-row', href: `#/metas/${g.id}?ver=plano` },
        h('span', { class: 'pace-row__title' }, g.title),
        h('span', { class: ['pace-row__status', tone && `is-${tone}`] }, tone && icon('alert', { size: 14 }), status),
        g.targetDate && h('span', { class: 'meta-muted' }, `até ${formatDay(g.targetDate, { withYear: true })}`)));
    })));
}
