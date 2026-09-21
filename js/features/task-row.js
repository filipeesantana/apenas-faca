/** Linha de tarefa usada em todas as listas. */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { areaTag } from '../ui/components.js';
import { state } from '../core/store.js';
import { today, formatDue, relativeTime } from '../utils/dates.js';
import { formatMinutes } from '../utils/numbers.js';
import { capitalize } from '../utils/helpers.js';
import { completeWithFeedback, reopenWithFeedback, startWithFeedback, pauseWithFeedback, setDueWithFeedback, dropWithFeedback } from './task-actions.js';
import { openTaskSheet } from './task-sheet.js';
import { openMenu } from '../ui/popover.js';
import { isOverdue, DUE_PRESETS, IMPORTANCE, updateTask } from '../domain/tasks.js';
import { toastError } from '../ui/toast.js';

/**
 * Ações rápidas de uma tarefa num menu ancorado: começar, prazo, importância,
 * detalhes e cancelar — sem abrir o painel completo.
 */
function taskMenu(t, anchor) {
  openMenu(anchor, (close) => {
    const item = (label, ic, fn, cls) => h('button', { type: 'button', class: ['menu__item', cls], role: 'menuitem', onClick: () => { close(); fn(); } }, icon(ic, { size: 16 }), label);
    const open = t.status === 'pending' || t.status === 'doing';
    if (!open) {
      return h('div', { class: 'menu', role: 'menu', 'aria-label': `Ações: ${t.title}` },
        item('Reabrir', 'undo', () => reopenWithFeedback(t.id)),
        item('Abrir detalhes', 'edit', () => openTaskSheet(t.id)));
    }
    const dateInput = h('input', {
      type: 'date', class: 'input input--date', 'aria-label': 'Outra data', value: t.dueDate || '',
      onChange: (e) => { if (e.target.value) { close(); setDueWithFeedback(t.id, e.target.value); } },
    });
    const chip = (label, pressed, fn) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(pressed), onClick: () => { close(); fn(); } }, label);
    return h('div', { class: 'menu', 'aria-label': `Ações: ${t.title}` },
      t.status === 'doing'
        ? item('Pausar', 'pause', () => pauseWithFeedback(t.id))
        : item('Começar agora', 'play', () => startWithFeedback(t.id)),
      h('p', { class: 'menu__label' }, 'Prazo'),
      h('div', { class: 'menu__row' },
        [DUE_PRESETS[0], DUE_PRESETS[1], DUE_PRESETS[3]].map((p) => chip(p.label, p.date() === t.dueDate, () => setDueWithFeedback(t.id, p.date()))),
        chip('Sem prazo', !t.dueDate, () => setDueWithFeedback(t.id, null)),
        dateInput),
      h('p', { class: 'menu__label' }, 'Importância'),
      h('div', { class: 'menu__row' }, IMPORTANCE.map((o) => chip(o.label, (t.importance || 'normal') === o.value, () => updateTask(t.id, { importance: o.value }).catch(toastError)))),
      h('div', { class: 'menu__sep' }),
      item('Abrir detalhes', 'edit', () => openTaskSheet(t.id)),
      item('Cancelar tarefa', 'ban', () => dropWithFeedback(t.id), 'menu__item--danger'));
  }, { label: `Ações da tarefa ${t.title}` });
}

export function dueChip(t) {
  if (!t.dueDate) return null;
  const late = isOverdue(t);
  const isToday = t.dueDate === today();
  return h('span', { class: ['due', late && 'due--late', isToday && 'due--today'] },
    icon(late ? 'alert' : 'calendar', { size: 13 }), capitalize(formatDue(t.dueDate)));
}

export function taskMeta(t, { showArea = true, showGoal = true } = {}) {
  const goal = t.goalId ? state.goals.get(t.goalId) : null;
  return [
    t.status === 'doing' && h('span', { class: 'pill pill--doing' }, icon('play', { size: 11 }), 'em andamento'),
    dueChip(t),
    t.importance === 'high' && h('span', { class: 'pill pill--important' }, icon('flag', { size: 12 }), 'alta importância'),
    t.estimateMin && h('span', { class: 'meta-muted' }, icon('clock', { size: 12 }), formatMinutes(t.estimateMin)),
    (t.postponedCount || 0) >= 2 && h('span', { class: 'meta-muted' }, `adiada ${t.postponedCount}×`),
    showGoal && goal && h('span', { class: 'goal-link' }, icon('target', { size: 12 }), t.nextStep ? `próximo passo · ${goal.title}` : goal.title),
    showArea && t.areaId && areaTag(t.areaId),
  ].filter(Boolean);
}

export function taskRow(t, { showArea = true, showGoal = true, reason, compact = false } = {}) {
  const done = t.status === 'done';
  const dropped = t.status === 'dropped';
  const row = h('li', { class: ['task-row', t.status === 'doing' && 'is-doing', done && 'is-done', dropped && 'is-dropped', compact && 'is-compact'] });
  const check = h('button', {
    type: 'button', class: 'check', 'data-key': `check-${t.id}`,
    'aria-label': done ? `Reabrir: ${t.title}` : `Concluir: ${t.title}`, 'aria-pressed': String(done), disabled: dropped,
    onClick: (e) => { e.stopPropagation(); if (done) reopenWithFeedback(t.id); else completeWithFeedback(t.id, row); },
  }, icon('check', { size: 14 }));

  const meta = done || dropped
    ? [h('span', { class: 'meta-muted' }, done ? `concluída ${relativeTime(t.completedAt)}` : `cancelada ${relativeTime(t.droppedAt)}`), showArea && areaTag(t.areaId)].filter(Boolean)
    : taskMeta(t, { showArea, showGoal });

  add(row, check,
    h('button', { type: 'button', class: 'task-row__main', 'data-key': `task-${t.id}`, onClick: () => openTaskSheet(t.id) },
      h('span', { class: 'task-row__title' }, t.title),
      meta.length > 0 && h('span', { class: 'task-row__meta' }, meta),
      reason && h('span', { class: 'task-row__reason' }, reason)),
    h('button', {
      type: 'button', class: 'icon-btn icon-btn--subtle task-row__more', 'aria-label': `Mais ações: ${t.title}`, 'aria-haspopup': 'true', 'aria-expanded': 'false',
      title: 'Mais ações', onClick: (e) => taskMenu(t, e.currentTarget),
    }, icon('kebab', { size: 18 })));
  return row;
}

export function taskList(tasks, opts) {
  return h('ul', { class: 'task-list' }, tasks.map((t) => taskRow(t, opts)));
}
