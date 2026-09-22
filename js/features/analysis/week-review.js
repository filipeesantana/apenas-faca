/**
 * "Revisar minha semana" — cinco passos curtos sobre os últimos 7 dias:
 * 1. O que foi concluído  2. O que ficou pendente  3. O que foi adiado repetidamente
 * 4. Metas paradas  5. O que merece atenção.
 * Só mostra fatos; cada passo tem no máximo uma ação principal.
 */
import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { button } from '../../ui/components.js';
import { state } from '../../core/store.js';
import { openTasks, isOverdue, stuckTasks, nextStepOf } from '../../domain/tasks.js';
import { activeGoals, lastMovementAt } from '../../domain/goals.js';
import { computeInsights, nextActions } from '../../domain/insights.js';
import { tally } from '../../analysis/engine.js';
import { rangeText } from '../../analysis/periods.js';
import { today, addDays, startOfDayTs, daysSince, DAY } from '../../utils/dates.js';
import { plural, formatMoney, formatMinutes } from '../../utils/numbers.js';
import { taskList } from '../task-row.js';
import { goalRow } from '../goals.js';
import { openReview } from '../review.js';
import { insightList, nextActionsBlock } from './insights-ui.js';

const STEPS = ['Concluído', 'Pendente', 'Adiado repetidamente', 'Metas paradas', 'O que merece atenção'];

export function openWeekReview() {
  let stepIdx = 0;
  const to = today();
  const from = addDays(to, -6);
  const fromTs = startOfDayTs(from);

  const sheet = openSheet({
    title: 'Revisar minha semana',
    key: 'week-review',
    render: () => {
      const body = [
        h('div', { class: 'wr__top' },
          h('p', { class: 'wr__count', tabindex: '-1' }, `Passo ${stepIdx + 1} de ${STEPS.length} · ${STEPS[stepIdx]}`),
          h('ol', { class: 'wr__dots', 'aria-hidden': 'true' }, STEPS.map((_, i) => h('li', { class: [i === stepIdx && 'is-current', i < stepIdx && 'is-done'] })))),
        stepIdx === 0 && h('p', { class: 'muted small' }, `Últimos 7 dias: ${rangeText(from, to)}.`),
        h('div', { class: 'wr__body' }, [done, pending, postponed, goals, attention][stepIdx]()),
        h('div', { class: 'wr__nav' },
          stepIdx > 0 ? button('Voltar', { variant: 'ghost', icon: 'arrowLeft', onClick: () => go(-1) }) : h('span'),
          stepIdx < STEPS.length - 1
            ? button('Próximo', { variant: 'primary', icon: 'arrowRight', onClick: () => go(1) })
            : button('Concluir revisão', { variant: 'primary', icon: 'check', onClick: () => sheet.close() })),
      ];
      return h('div', { class: 'wr' }, body);
    },
  });
  function go(d) {
    stepIdx = Math.max(0, Math.min(STEPS.length - 1, stepIdx + d));
    sheet.refresh();
    sheet.panel.querySelector('.wr__count')?.focus?.();
    sheet.body.scrollTop = 0;
  }

  function block(title, text, ...content) {
    return [h('h3', { class: 'wr__title' }, title), text && h('p', { class: 'wr__text' }, text), content];
  }

  function done() {
    const t = tally({ scope: 'tudo' }, from, to);
    const ids = new Set(state.events.filter((e) => e.type === 'task.completed' && e.createdAt >= fromTs).map((e) => e.entityId));
    const tasks = [...ids].map((id) => state.tasks.get(id)).filter((x) => x && x.status === 'done');
    const extras = [
      t.goalsMoved && `progresso registrado em ${plural(t.goalsMoved, 'meta', 'metas')}`,
      t.moneyIn && `${formatMoney(t.moneyIn)} guardados`,
      t.minutes && `${formatMinutes(t.minutes)} registradas`,
    ].filter(Boolean);
    if (!tasks.length && !extras.length) return block('Nada foi concluído nestes 7 dias.', 'Tudo bem. A revisão serve justamente para decidir o próximo passo.');
    return block(tasks.length ? `Você concluiu ${plural(tasks.length, 'tarefa', 'tarefas')}.` : 'Nenhuma tarefa foi concluída.',
      extras.length ? `Também: ${extras.join(', ')}.` : null,
      tasks.length > 0 && taskList(tasks.slice(0, 8), { compact: true }),
      tasks.length > 8 && h('p', { class: 'muted small' }, `E mais ${tasks.length - 8}.`));
  }

  function pending() {
    const end = addDays(to, 7);
    const open = openTasks();
    const late = open.filter((t) => isOverdue(t));
    const soon = open.filter((t) => !isOverdue(t) && t.dueDate && t.dueDate < end);
    if (!late.length && !soon.length) return block('Nada com prazo vencido ou para os próximos dias.', `Há ${plural(open.length, 'tarefa aberta', 'tarefas abertas')} sem prazo próximo.`);
    const list = [...late, ...soon];
    return block(`${plural(late.length, 'tarefa com prazo vencido', 'tarefas com prazo vencido')} e ${soon.length} para os próximos 7 dias.`,
      'Se a lista parece grande, revise uma por vez: escolher nova data ou cancelar também é decidir.',
      taskList(list.slice(0, 8), { compact: true }),
      list.length > 8 && h('p', { class: 'muted small' }, `E mais ${list.length - 8}.`),
      late.length > 0 && button(`Revisar ${late.length === 1 ? 'a atrasada' : `as ${late.length} atrasadas`}`, { variant: 'secondary', onClick: () => openReview(late.map((t) => t.id), { title: 'Revisar atrasadas' }) }));
  }

  function postponed() {
    const list = stuckTasks(2);
    if (!list.length) return block('Nenhuma tarefa foi adiada duas vezes ou mais.', 'Nada travado por aqui.');
    return block(`${plural(list.length, 'tarefa foi adiada', 'tarefas foram adiadas')} duas vezes ou mais.`,
      'Quando algo é adiado muitas vezes, costuma ajudar dividir em um passo menor, mudar a data para algo realista ou cancelar.',
      taskList(list.slice(0, 6), { compact: true }),
      button('Revisar estas tarefas', { variant: 'secondary', onClick: () => openReview(list.map((t) => t.id), { title: 'Tarefas adiadas' }) }));
  }

  function goals() {
    const active = activeGoals();
    if (!active.length) return block('Você não tem metas ativas.', 'Metas são opcionais. Tarefas soltas também contam.');
    const stalled = active.filter((g) => {
      const last = lastMovementAt(g);
      return Date.now() - g.createdAt > 14 * DAY && (!last || daysSince(last) >= 14);
    });
    const noStep = active.filter((g) => !nextStepOf(g.id) && !stalled.includes(g));
    if (!stalled.length && !noStep.length) return block('Todas as metas ativas tiveram movimento recente e têm um próximo passo.', null);
    return block(
      stalled.length ? `${plural(stalled.length, 'meta sem progresso', 'metas sem progresso')} há 14 dias ou mais.` : 'Nenhuma meta parada.',
      noStep.length ? `${plural(noStep.length, 'meta não tem', 'metas não têm')} próximo passo definido.` : null,
      h('ul', { class: 'goal-list goal-list--compact' }, [...stalled, ...noStep].slice(0, 6).map((g) => h('li', null, goalRow(g, { compact: true })))));
  }

  function attention() {
    const list = computeInsights({ scope: 'tudo' }).filter((i) => !i.suppressed && !i.positive);
    const acts = nextActions(list, 2);
    return [
      h('h3', { class: 'wr__title' }, list.length ? 'O que merece atenção agora' : 'Nada pede atenção agora.'),
      list.length > 0 && insightList(list.slice(0, 3), { limit: 3 }),
      h('h3', { class: 'wr__title wr__title--sub' }, icon('arrowRight', { size: 16 }), 'O que vale fazer agora'),
      nextActionsBlock(acts),
    ];
  }
  return sheet;
}
