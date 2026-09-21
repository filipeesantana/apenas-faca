/** Início: "O que merece minha atenção agora?" */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, areaTag, progressBar, sectionHead, linkButton } from '../ui/components.js';
import { state } from '../core/store.js';
import { rankTasks, explain, attentionToday } from '../domain/priority.js';
import { openInboxItems } from '../domain/inbox.js';
import { activeGoals, progressOf, goalValueLine, paceOf } from '../domain/goals.js';
import { homeInsights } from '../domain/insights.js';
import { periodSummary } from '../domain/stats.js';
import { greeting, formatToday, formatDue, today } from '../utils/dates.js';
import { formatPercent, formatMoney, plural } from '../utils/numbers.js';
import { capitalize } from '../utils/helpers.js';
import { captureBox } from './capture.js';
import { openOrganizer } from './inbox-organizer.js';
import { openTaskSheet } from './task-sheet.js';
import { taskRow } from './task-row.js';
import { completeWithFeedback, startWithFeedback, pauseWithFeedback } from './task-actions.js';
import { insightCard } from './insight-card.js';
import { openGoalForm } from './goal-form.js';
import { loadDemoWithConfirm } from './settings.js';

const skipped = new Set();

export function homeView() {
  const ranked = rankTasks();
  const inbox = openInboxItems();
  const goals = activeGoals();
  const view = h('div', { class: 'view view--home' },
    h('p', { class: 'eyebrow' }, capitalize(formatToday())),
    h('h1', { class: 'display' }, `${greeting()}.`));

  const isEmpty = !state.tasks.size && !state.goals.size && !state.inbox.size;
  if (isEmpty) { add(view, firstRun()); return view; }

  add(view, 
    h('p', { class: 'lead' }, summarySentence(ranked, inbox)),
    captureBox({ key: 'home-capture', placeholder: 'Tirar algo da cabeça…' }),
    nowSection(ranked, inbox),
    alsoSection(ranked, goals, inbox),
    insightsSection(),
    recentStrip(),
  );
  return view;
}

function summarySentence(ranked, inbox) {
  const urgent = attentionToday();
  const late = urgent.filter((t) => t.dueDate < today()).length;
  if (urgent.length === 1) return `Você tem 1 coisa que realmente precisa da sua atenção hoje.${late ? ' Ela já passou do prazo.' : ''}`;
  if (urgent.length > 1) return `Você tem ${urgent.length} coisas que realmente precisam da sua atenção hoje.${late ? ` ${late === urgent.length ? 'Todas' : late === 1 ? 'Uma delas' : `${late} delas`} já ${late === 1 ? 'passou' : 'passaram'} do prazo.` : ''}`;
  if (ranked.length) return 'Nada vence hoje. Dá para avançar no que importa sem pressa.';
  if (inbox.length) return `Sua lista está vazia, mas ${plural(inbox.length, 'item espera', 'itens esperam')} decisão na caixa de entrada.`;
  return 'Nada pendente por aqui.';
}

function pickNow(ranked) {
  let candidates = ranked.filter((r) => !skipped.has(r.task.id));
  if (!candidates.length && ranked.length) { skipped.clear(); candidates = ranked; }
  return candidates[0] || null;
}

function nowSection(ranked, inbox) {
  const top = pickNow(ranked);
  const section = h('section', { class: 'now', 'aria-labelledby': 'now-label' }, h('h2', { class: 'label label--accent', id: 'now-label' }, 'Agora'));

  if (!top) {
    if (inbox.length) {
      add(section, h('article', { class: 'now-card' },
        h('h3', { class: 'now-card__title' }, `${plural(inbox.length, 'item', 'itens')} na caixa de entrada`),
        h('p', { class: 'now-card__why' }, 'Decidir o que cada um é leva poucos minutos — e tira o peso de ter que lembrar.'),
        h('div', { class: 'now-card__actions' }, button('Organizar agora', { variant: 'primary', icon: 'arrowRight', onClick: () => openOrganizer() }))));
    } else {
      add(section, h('article', { class: 'now-card now-card--calm' },
        h('h3', { class: 'now-card__title' }, 'Nada urgente agora.'),
        h('p', { class: 'now-card__why' }, 'Se alguma coisa está ocupando sua cabeça, escreva acima. Se não, aproveite o espaço livre.')));
    }
    return section;
  }

  const t = top.task;
  const card = h('article', { class: ['now-card', t.status === 'doing' && 'is-doing'] });
  add(card, 
    h('button', { type: 'button', class: 'now-card__title now-card__title--btn', onClick: () => openTaskSheet(t.id) }, t.title),
    h('div', { class: 'now-card__meta' },
      t.status === 'doing' && h('span', { class: 'pill pill--doing' }, icon('play', { size: 11 }), 'em andamento'),
      t.dueDate && h('span', { class: ['due', t.dueDate < today() && 'due--late'] }, icon('calendar', { size: 13 }), capitalize(formatDue(t.dueDate))),
      areaTag(t.areaId)),
    h('p', { class: 'now-card__why' }, explain(top)),
    h('div', { class: 'now-card__actions' },
      t.status === 'doing'
        ? [button('Concluir', { variant: 'primary', icon: 'check', onClick: () => completeWithFeedback(t.id, card) }),
          button('Pausar', { icon: 'pause', onClick: () => pauseWithFeedback(t.id) })]
        : [button('Começar', { variant: 'primary', icon: 'play', onClick: () => startWithFeedback(t.id) }),
          button('Concluir', { icon: 'check', onClick: () => completeWithFeedback(t.id, card) })],
      ranked.length > 1 && button('Outra sugestão', {
        variant: 'ghost', icon: 'refresh',
        onClick: () => { skipped.add(t.id); window.dispatchEvent(new CustomEvent('app:rerender')); },
      })),
  );
  add(section, card);
  return section;
}

function alsoSection(ranked, goals, inbox) {
  const top = pickNow(ranked);
  const nextTasks = ranked.filter((r) => r.task.id !== top?.task.id).slice(0, 3);
  const goalItems = goals
    .map((g) => ({ g, pace: paceOf(g), ratio: progressOf(g).ratio }))
    .sort((a, b) => (b.pace?.offPace || b.pace?.datePassed ? 1 : 0) - (a.pace?.offPace || a.pace?.datePassed ? 1 : 0) || b.g.updatedAt - a.g.updatedAt)
    .slice(0, 2);
  if (!nextTasks.length && !goalItems.length && !(top && inbox.length)) return null;

  const list = h('ul', { class: 'task-list task-list--also' });
  for (const r of nextTasks) {
    // O prazo já aparece no chip; mostra só um motivo que acrescente informação.
    const extra = r.reasons.find((x) => !/^(vence|está atrasada|era para ontem)/.test(x));
    add(list, taskRow(r.task, { reason: extra ? capitalize(extra) : null }));
  }

  const section = h('section', { class: 'also' }, sectionHead('Também merece atenção', { action: linkButton('Todas as tarefas', '#/tarefas', { variant: 'ghost', size: 'sm' }) }));
  if (nextTasks.length) add(section, list);
  if (top && inbox.length) {
    add(section, h('button', { type: 'button', class: 'inline-note', onClick: () => openOrganizer() },
      icon('inbox', { size: 16 }), `${plural(inbox.length, 'item', 'itens')} na caixa de entrada esperando decisão`, icon('chevronRight', { size: 16 })));
  }
  if (goalItems.length) {
    add(section, h('ul', { class: 'goal-mini-list' }, goalItems.map(({ g, pace, ratio }) => h('li', null,
      h('a', { class: 'goal-mini', href: `#/metas/${g.id}` },
        h('span', { class: 'goal-mini__title' }, g.title),
        h('span', { class: 'goal-mini__value' }, `${goalValueLine(g)} — ${formatPercent(ratio)}`),
        progressBar(ratio, { key: `goal-${g.id}`, size: 'sm', label: `Progresso de ${g.title}`, tone: pace?.offPace || pace?.datePassed ? 'warn' : null }),
        (pace?.offPace || pace?.datePassed) && h('span', { class: 'goal-mini__warn' }, pace.datePassed ? 'A data escolhida já passou.' : 'Abaixo do ritmo necessário.'))))));
  }
  return section;
}

function insightsSection() {
  const list = homeInsights(2);
  if (!list.length) return null;
  return h('section', { class: 'home-insights' },
    sectionHead('Percebido', { action: linkButton('Análises', '#/analises', { variant: 'ghost', size: 'sm' }) }),
    h('div', { class: 'insight-stack' }, list.map((i) => insightCard(i, { compact: true }))));
}

function recentStrip() {
  const s = periodSummary(7);
  const parts = [];
  parts.push(s.completed ? plural(s.completed, 'tarefa concluída', 'tarefas concluídas') : 'nenhuma tarefa concluída ainda');
  if (s.goalsMoved) parts.push(plural(s.goalsMoved, 'meta movimentada', 'metas movimentadas'));
  if (s.moneyIn) parts.push(`${formatMoney(s.moneyIn)} guardados`);
  return h('a', { class: 'recent-strip', href: '#/progresso' },
    h('span', { class: 'recent-strip__label' }, 'Últimos 7 dias'),
    h('span', { class: 'recent-strip__text' }, capitalize(parts.join(' · '))),
    icon('chevronRight', { size: 16 }));
}

function firstRun() {
  return h('div', { class: 'first-run' },
    h('p', { class: 'lead' }, 'O que está ocupando sua cabeça agora?'),
    h('p', { class: 'muted' }, 'Escreva do jeito que vier — uma conta, uma ideia, algo que você vem adiando. Uma coisa por linha. Você decide o que fazer com cada uma depois.'),
    captureBox({ key: 'first-capture', big: true, autofocus: true, placeholder: 'pagar cartão\nmarcar dentista\nestudar Python', buttonLabel: 'Tirar da cabeça' }),
    h('div', { class: 'first-run__alt' },
      h('span', { class: 'muted small' }, 'Ou, se já sabe o que quer:'),
      button('Criar uma meta', { variant: 'ghost', size: 'sm', icon: 'target', onClick: () => openGoalForm() }),
      button('Ver com dados de exemplo', { variant: 'ghost', size: 'sm', icon: 'layers', onClick: () => loadDemoWithConfirm() })));
}
