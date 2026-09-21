/** Análises: dados → interpretação → ação. */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { sectionHead, pageHead, emptyState, button } from '../ui/components.js';
import { pairedChart } from '../ui/charts.js';
import { state } from '../core/store.js';
import { computeInsights } from '../domain/insights.js';
import { weeklyFlow, areaOverview, hasHistory } from '../domain/stats.js';
import { stuckTasks } from '../domain/tasks.js';
import { activeGoals, paceOf, rateText } from '../domain/goals.js';
import { formatDay, relativeTime } from '../utils/dates.js';
import { plural } from '../utils/numbers.js';
import { insightCard } from './insight-card.js';
import { taskList } from './task-row.js';
import { openReview } from './review.js';

let showHidden = false;

export function analyticsView(route) {
  const insights = computeInsights();
  const visible = insights.filter((i) => !i.suppressed);
  const hidden = insights.filter((i) => i.suppressed);

  const view = h('div', { class: 'view view--wide view--analytics' },
    pageHead('Análises', 'O que seus dados mostram — e o que dá para fazer com isso.'));

  if (!state.events.length || !hasHistory(1)) {
    add(view, emptyState({
      icon: 'lens', title: 'As análises ficam úteis com alguns dias de uso.',
      text: 'Continue registrando o que faz. Padrões como acúmulo de tarefas, adiamentos repetidos e áreas esquecidas aparecem aqui automaticamente.',
    }));
  }

  add(view, h('section', { class: 'section', 'aria-labelledby': 'ins-h' },
    sectionHead('O que chama atenção', { id: 'ins-h', count: visible.length || null }),
    visible.length
      ? h('div', { class: 'insight-grid' }, visible.map((i) => insightCard(i)))
      : h('p', { class: 'muted' }, 'Nada fora do comum agora. Quando algo merecer atenção — atraso, acúmulo, meta fora do ritmo — aparece aqui.'),
    hidden.length > 0 && h('div', { class: 'hidden-insights' },
      button(showHidden ? 'Esconder ocultos' : `Mostrar ${plural(hidden.length, 'oculto', 'ocultos')}`, {
        variant: 'ghost', size: 'sm',
        onClick: () => { showHidden = !showHidden; window.dispatchEvent(new CustomEvent('app:rerender')); },
      }),
      showHidden && h('div', { class: 'insight-grid is-dim' }, hidden.map((i) => insightCard(i))))));

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
    : diff > 0
      ? `Nas últimas 8 semanas entraram ${created} tarefas e saíram ${completed} concluídas. A lista cresceu ${plural(diff, 'tarefa', 'tarefas')} nesse período (sem contar as que você deixou de lado).`
      : diff < 0
        ? `Nas últimas 8 semanas entraram ${created} tarefas e saíram ${completed} concluídas. Você concluiu mais do que criou.`
        : `Nas últimas 8 semanas entraram e saíram ${created} tarefas. A lista se manteve estável.`;
  const section = h('section', { class: ['card section', focus && 'is-focus'], id: 'fluxo' },
    sectionHead('Entradas e saídas'),
    h('p', null, text),
    pairedChart(weeks, {
      label: text,
      a: { key: 'created', label: 'Criadas' },
      b: { key: 'completed', label: 'Concluídas' },
      tick: (w) => formatDay(w.start).replace(/ \d{4}$/, ''),
      tip: (w) => `Semana de ${formatDay(w.start)}: ${w.created} criadas, ${w.completed} concluídas`,
    }),
    diff > 5 && h('div', { class: 'row-actions' }, button('Revisar tarefas pendentes', { variant: 'primary', size: 'sm', icon: 'refresh', onClick: () => openReview() })));
  if (focus) requestAnimationFrame(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  return section;
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
          r.overdue ? h('span', { class: 'is-warn' }, ` · ${r.overdue} atrasada${r.overdue > 1 ? 's' : ''}`) : null,
          r.goals ? ` · ${plural(r.goals, 'meta', 'metas')}` : null),
        h('span', { class: 'area-row__last' }, r.lastActivity ? relativeTime(r.lastActivity) : 'sem atividade'),
        icon('chevronRight', { size: 16 }))))) : h('p', { class: 'muted' }, 'Nenhuma área criada.'));
}

function stuckSection() {
  const list = stuckTasks(2).slice(0, 5);
  return h('section', { class: 'card section' },
    sectionHead('Mais adiadas'),
    list.length
      ? [h('p', { class: 'muted small' }, 'Adiar de novo raramente resolve. Vale quebrar em algo menor, dar um prazo realista ou abandonar.'),
        taskList(list),
        h('div', { class: 'row-actions' }, button('Revisar estas', { size: 'sm', icon: 'refresh', onClick: () => openReview(list.map((t) => t.id)) }))]
      : h('p', { class: 'muted' }, 'Nenhuma tarefa foi adiada repetidamente. Bom sinal.'));
}

function paceSection() {
  const goals = activeGoals().filter((g) => g.type !== 'steps');
  if (!goals.length) return null;
  return h('section', { class: 'card section' },
    sectionHead('Ritmo das metas'),
    h('ul', { class: 'pace-rows' }, goals.map((g) => {
      const p = paceOf(g);
      let status; let tone = null;
      if (p.datePassed) { status = 'A data escolhida já passou.'; tone = 'warn'; }
      else if (p.offPace) { status = `Precisa de ${rateText(g, p.neededPerDay)} · média recente ${rateText(g, p.avgPerDay)}`; tone = 'warn'; }
      else if (p.neededPerDay != null && p.avgPerDay != null) status = `No ritmo: precisa de ${rateText(g, p.neededPerDay)} · média ${rateText(g, p.avgPerDay)}`;
      else if (p.avgPerDay != null) status = p.avgPerDay > 0 ? `Média recente: ${rateText(g, p.avgPerDay)} · sem data definida` : 'Sem avanço líquido recente.';
      else status = p.neededPerDay != null ? `Precisa de ${rateText(g, p.neededPerDay)} · histórico ainda curto` : 'Histórico ainda curto para estimar.';
      return h('li', null, h('a', { class: 'pace-row', href: `#/metas/${g.id}` },
        h('span', { class: 'pace-row__title' }, g.title),
        h('span', { class: ['pace-row__status', tone && `is-${tone}`] }, tone && icon('alert', { size: 14 }), status),
        g.targetDate && h('span', { class: 'meta-muted' }, `até ${formatDay(g.targetDate, { withYear: true })}`)));
    })));
}
