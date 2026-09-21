/**
 * Início — painel operacional pessoal. Responde, nesta ordem:
 * 1. O que merece atenção agora?  2. O que tenho para hoje?  3. Como estão minhas metas?
 * 4. Como estou indo?             5. Existe algo que merece atenção?
 */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, areaTag, sectionHead, linkButton, logoMark } from '../ui/components.js';
import { state } from '../core/store.js';
import { rankTasks, explain, attentionToday, fitsIn } from '../domain/priority.js';
import { openInboxItems } from '../domain/inbox.js';
import { activeGoals, paceOf } from '../domain/goals.js';
import { openTasks, isOverdue, stuckTasks } from '../domain/tasks.js';
import { homeInsights } from '../domain/insights.js';
import { rangeSummary, recentCapacity, thisWeekLoad } from '../domain/stats.js';
import { greeting, formatToday, formatDue, today, startOfWeek, startOfMonth, startOfDayTs, daysAgoTs } from '../utils/dates.js';
import { formatMoney, formatMinutes, plural } from '../utils/numbers.js';
import { capitalize } from '../utils/helpers.js';
import { pickCopy } from '../content/microcopy.js';
import { openOrganizer } from './inbox-organizer.js';
import { openTaskSheet } from './task-sheet.js';
import { taskRow } from './task-row.js';
import { completeWithFeedback, startWithFeedback, pauseWithFeedback } from './task-actions.js';
import { insightCard } from './insight-card.js';
import { goalRow } from './goals.js';
import { openGoalForm } from './goal-form.js';
import { openTaskForm } from './task-form.js';
import { openAddMenu } from './add-menu.js';
import { openCapture } from './capture.js';
import { openReview } from './review.js';
import { loadDemoWithConfirm } from './settings.js';

const skipped = new Set();

function homeState(ranked, overdue) {
  const s = rangeSummary(daysAgoTs(2));
  if (overdue.length >= 8 || ranked.length >= 25) return 'overloaded';
  if (s.completed >= 3 || s.goalsMoved >= 1) return 'progress';
  if (!attentionToday().length) return 'clear';
  return 'any';
}

export function homeView() {
  const isEmpty = !state.tasks.size && !state.goals.size && !state.inbox.size;
  const view = h('div', { class: 'view view--wide view--home' });
  if (isEmpty) { add(view, welcome()); return view; }

  const ranked = rankTasks();
  const overdue = openTasks().filter((t) => isOverdue(t));
  const urgent = attentionToday();
  const mood = homeState(ranked, overdue);

  add(view, h('header', { class: 'home-head' },
    h('p', { class: 'eyebrow' }, capitalize(formatToday())),
    h('h1', { class: 'display' }, `${greeting()}.`),
    h('p', { class: 'lead' }, summarySentence(urgent, ranked)),
    h('p', { class: 'home-head__copy' }, pickCopy('home', [mood]))));

  if (mood === 'overloaded') {
    add(view, h('div', { class: 'calm-banner' },
      h('div', null,
        h('p', { class: 'calm-banner__title' }, `Existem ${overdue.length >= 8 ? overdue.length : ranked.length} pendências acumuladas.`),
        h('p', null, 'Você não precisa resolver tudo agora. Vamos começar pelas que merecem mais atenção.')),
      button('Revisar prioridades', { variant: 'primary', icon: 'refresh', onClick: () => openReview(overdue.length >= 8 ? overdue.map((t) => t.id) : null) })));
  }

  const grid = h('div', { class: 'home-grid' });
  const left = h('div', { class: 'home-grid__main' });
  const right = h('div', { class: 'home-grid__side' });
  add(grid, left, right);
  add(view, grid);

  add(left, nowSection(ranked), todaySection(ranked), quickWins(ranked));
  add(right, goalsSection(), howSection(), attentionSection(mood === 'overloaded'), inboxLine());
  return view;
}

function summarySentence(urgent, ranked) {
  const late = urgent.filter((t) => t.dueDate < today()).length;
  if (urgent.length >= 8) return `${urgent.length} pendências precisam de uma decisão. Uma de cada vez resolve.`;
  if (urgent.length === 1) return `Você tem 1 item que merece atenção hoje${late ? ', e ele já passou do prazo' : ''}.`;
  if (urgent.length > 1) return `Você tem ${urgent.length} itens que merecem atenção hoje${late ? ` — ${late === urgent.length ? 'todos' : late} já ${late === 1 ? 'passou' : 'passaram'} do prazo` : ''}.`;
  if (ranked.length) return `Nada vence hoje. Você tem ${plural(ranked.length, 'tarefa aberta', 'tarefas abertas')}.`;
  return 'Nenhuma tarefa pendente.';
}

function pickNow(ranked) {
  let c = ranked.filter((r) => !skipped.has(r.task.id));
  if (!c.length && ranked.length) { skipped.clear(); c = ranked; }
  return c[0] || null;
}

function nowSection(ranked) {
  const top = pickNow(ranked);
  const sec = h('section', { class: 'panel', 'aria-labelledby': 'h-now' }, h('h2', { class: 'label label--accent', id: 'h-now' }, 'Agora'));
  if (!top) {
    add(sec, h('div', { class: 'now now--calm' },
      h('p', { class: 'now__title' }, 'Nada urgente agora.'),
      h('p', { class: 'now__why' }, 'Adicione algo que precisa ser feito ou avance em uma meta.'),
      h('div', { class: 'now__actions' }, button('Adicionar', { variant: 'primary', icon: 'plus', onClick: () => openAddMenu() }))));
    return sec;
  }
  const t = top.task;
  const card = h('article', { class: ['now', t.status === 'doing' && 'is-doing'] });
  add(card,
    h('p', { class: 'now__title' }, t.title),
    h('div', { class: 'now__meta' },
      t.status === 'doing' && h('span', { class: 'pill pill--doing' }, icon('play', { size: 11 }), 'em andamento'),
      t.dueDate && h('span', { class: ['due', t.dueDate < today() && 'due--late', t.dueDate === today() && 'due--today'] }, icon('calendar', { size: 13 }), capitalize(formatDue(t.dueDate))),
      t.importance === 'high' && h('span', { class: 'pill pill--important' }, icon('flag', { size: 12 }), 'Alta importância'),
      t.estimateMin && h('span', { class: 'meta-muted' }, icon('clock', { size: 12 }), formatMinutes(t.estimateMin)),
      areaTag(t.areaId)),
    h('p', { class: 'now__why' }, h('strong', null, 'Por quê: '), explain(top)),
    h('div', { class: 'now__actions' },
      t.status === 'doing'
        ? [button('Concluir', { variant: 'primary', icon: 'check', onClick: () => completeWithFeedback(t.id, card) }), button('Pausar', { icon: 'pause', onClick: () => pauseWithFeedback(t.id) })]
        : [button('Começar', { variant: 'primary', icon: 'play', onClick: () => startWithFeedback(t.id) }), button('Concluir', { icon: 'check', onClick: () => completeWithFeedback(t.id, card) })],
      button('Ver detalhes', { variant: 'ghost', onClick: () => openTaskSheet(t.id) }),
      ranked.length > 1 && button('Outra sugestão', { variant: 'ghost', icon: 'refresh', onClick: () => { skipped.add(t.id); window.dispatchEvent(new CustomEvent('app:rerender')); } })));
  add(sec, card);
  return sec;
}

function todaySection(ranked) {
  const top = pickNow(ranked)?.task.id;
  const ref = today();
  const list = ranked.map((r) => r.task).filter((t) => t.id !== top && ((t.dueDate && t.dueDate <= ref) || t.status === 'doing'));
  const sec = h('section', { class: 'panel', 'aria-labelledby': 'h-today' },
    sectionHead('Hoje', { id: 'h-today', count: list.length ? plural(list.length, 'pendência', 'pendências') : null, action: linkButton('Todas as tarefas', '#/tarefas', { variant: 'ghost', size: 'sm' }) }));
  if (!list.length) {
    const upcoming = ranked.filter((r) => r.task.id !== top).slice(0, 3).map((r) => r.task);
    add(sec, h('p', { class: 'panel__empty' }, top ? 'Nada mais vence hoje.' : 'Nada vence hoje.'),
      upcoming.length > 0 && [h('p', { class: 'sub-label' }, 'Próximas na fila'), h('ul', { class: 'task-list task-list--boxed' }, upcoming.map((t) => taskRow(t, { compact: true })))]);
  } else {
    add(sec, h('ul', { class: 'task-list task-list--boxed' }, list.slice(0, 7).map((t) => taskRow(t, { compact: true }))),
      list.length > 7 && h('a', { class: 'more-link-inline', href: '#/tarefas' }, `Ver mais ${list.length - 7}`));
  }
  add(sec, h('button', { type: 'button', class: 'add-row', onClick: () => openTaskForm({ dueDate: today() }) }, icon('plus', { size: 16 }), 'Adicionar tarefa para hoje'));
  return sec;
}

/** "Tem uns 30 minutos?" — só aparece quando há tarefas com duração estimada. */
function quickWins(ranked) {
  const top = pickNow(ranked)?.task.id;
  const ref = today();
  const inToday = (t) => (t.dueDate && t.dueDate <= ref) || t.status === 'doing';
  const fits = fitsIn(30, 8).filter((r) => r.task.id !== top && !inToday(r.task)).slice(0, 3);
  if (!fits.length) return null;
  return h('section', { class: 'panel' },
    sectionHead('Tem uns 30 minutos?'),
    h('p', { class: 'muted small' }, 'Estas cabem no tempo:'),
    h('ul', { class: 'task-list task-list--boxed' }, fits.map((r) => taskRow(r.task, { compact: true }))));
}

function goalsSection() {
  const goals = activeGoals()
    .map((g) => ({ g, p: paceOf(g) }))
    .sort((a, b) => ((b.p?.offPace || b.p?.datePassed) ? 1 : 0) - ((a.p?.offPace || a.p?.datePassed) ? 1 : 0) || b.g.updatedAt - a.g.updatedAt);
  const sec = h('section', { class: 'panel', 'aria-labelledby': 'h-goals' },
    sectionHead('Metas em andamento', { id: 'h-goals', count: goals.length || null, action: goals.length ? linkButton('Ver metas', '#/metas', { variant: 'ghost', size: 'sm' }) : null }));
  if (!goals.length) {
    add(sec, h('div', { class: 'panel__empty' },
      h('p', null, 'Nenhuma meta ainda. Metas mostram quanto falta e qual ritmo manter.'),
      button('Criar meta', { size: 'sm', icon: 'plus', onClick: () => openGoalForm() })));
    return sec;
  }
  add(sec, h('ul', { class: 'goal-list goal-list--compact' }, goals.slice(0, 4).map(({ g }) => h('li', null, goalRow(g, { compact: true })))));
  if (goals.length > 4) add(sec, h('a', { class: 'more-link-inline', href: '#/metas' }, `Ver mais ${goals.length - 4}`));
  return sec;
}

/** Indicadores curtos com símbolo + texto (não dependem de cor). */
function howSection() {
  const weekFrom = startOfDayTs(startOfWeek(today()));
  const monthFrom = startOfDayTs(startOfMonth());
  const week = rangeSummary(weekFrom);
  const month = rangeSummary(monthFrom);
  const stuck = stuckTasks(2);
  const cap = recentCapacity();
  const load = thisWeekLoad();
  const lines = [];
  lines.push({ kind: 'ok', mark: '✓', text: week.completed ? `${plural(week.completed, 'tarefa concluída', 'tarefas concluídas')} esta semana` : 'Nenhuma tarefa concluída esta semana ainda', href: '#/progresso?p=7' });
  if (stuck.length) lines.push({ kind: 'warn', mark: '!', text: `${plural(stuck.length, 'tarefa foi adiada', 'tarefas foram adiadas')} repetidamente`, href: '#/tarefas?f=travadas' });
  if (month.moneyIn) lines.push({ kind: 'up', mark: '↑', text: `Suas metas financeiras avançaram ${formatMoney(month.moneyIn)} este mês`, href: '#/metas' });
  if (week.minutes) lines.push({ kind: 'up', mark: '↑', text: `${formatMinutes(week.minutes)} registradas em metas de tempo esta semana`, href: '#/metas' });
  if (cap && load.planned) {
    const over = load.planned > cap.avgDone * 1.5 && load.planned - cap.avgDone >= 5;
    lines.push({ kind: over ? 'warn' : 'info', mark: over ? '!' : '→', text: `${plural(load.planned, 'tarefa planejada', 'tarefas planejadas')} para esta semana; sua média recente é ${Math.round(cap.avgDone)} por semana`, href: '#/progresso' });
  }
  return h('section', { class: 'panel', 'aria-labelledby': 'h-how' },
    sectionHead('Como você está indo', { id: 'h-how', action: linkButton('Ver análises', '#/analises', { variant: 'ghost', size: 'sm' }) }),
    h('ul', { class: 'how-list' }, lines.map((l) => h('li', null, h('a', { class: `how how--${l.kind}`, href: l.href },
      h('span', { class: 'how__mark', 'aria-hidden': 'true' }, l.mark), h('span', null, l.text))))));
}

function attentionSection(overloaded) {
  const list = homeInsights(2, overloaded ? ['overdue'] : []);
  if (!list.length) return null;
  return h('section', { class: 'panel', 'aria-labelledby': 'h-att' },
    sectionHead('Merece atenção', { id: 'h-att' }),
    h('div', { class: 'insight-stack' }, list.map((i) => insightCard(i, { compact: true }))));
}

function inboxLine() {
  const n = openInboxItems().length;
  if (!n) return null;
  return h('button', { type: 'button', class: 'inline-note', onClick: () => openOrganizer() },
    icon('note', { size: 16 }), h('span', null, `${plural(n, 'anotação espera', 'anotações esperam')} uma decisão`), icon('chevronRight', { size: 16 }));
}

/* ---------- Primeiro uso ---------- */

function welcome() {
  return h('section', { class: 'welcome' },
    h('div', { class: 'welcome__brand', 'aria-hidden': 'true' }, logoMark(40)),
    h('h1', { class: 'display' }, 'Bem-vindo ao Norte.'),
    h('p', { class: 'lead' }, 'Um lugar para organizar o que importa, executar e acompanhar seu progresso. Você pode começar de duas formas:'),
    h('div', { class: 'welcome__choices' },
      h('button', { type: 'button', class: 'welcome-choice', onClick: () => openTaskForm() },
        icon('tasks', { size: 22 }), h('span', { class: 'welcome-choice__title' }, 'Tenho algo para fazer'), h('span', { class: 'welcome-choice__desc' }, 'Uma conta, um compromisso, uma entrega.')),
      h('button', { type: 'button', class: 'welcome-choice', onClick: () => openGoalForm() },
        icon('target', { size: 22 }), h('span', { class: 'welcome-choice__title' }, 'Quero alcançar alguma coisa'), h('span', { class: 'welcome-choice__desc' }, 'Juntar dinheiro, estudar, completar um curso.'))),
    h('div', { class: 'welcome__alt' },
      button('Anotar algo rápido', { variant: 'secondary', icon: 'note', onClick: () => openCapture() }),
      button('Ver com dados de exemplo', { variant: 'ghost', icon: 'layers', onClick: () => loadDemoWithConfirm() }),
      linkButton('Como funciona', '#/ajuda', { variant: 'ghost', icon: 'info' })),
    h('p', { class: 'muted small' }, 'Seus dados ficam só neste navegador. Nada é enviado para a internet.'));
}

