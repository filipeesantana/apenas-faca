/** Linha de tarefa usada em todas as listas. */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { areaTag } from '../ui/components.js';
import { isOverdue } from '../domain/tasks.js';
import { today, formatDue, relativeTime } from '../utils/dates.js';
import { capitalize } from '../utils/helpers.js';
import { completeWithFeedback, reopenWithFeedback } from './task-actions.js';
import { openTaskSheet } from './task-sheet.js';

export function dueChip(t) {
  if (!t.dueDate) return null;
  const late = isOverdue(t);
  const isToday = t.dueDate === today();
  return h('span', { class: ['due', late && 'due--late', isToday && 'due--today'] },
    icon(late ? 'alert' : 'calendar', { size: 13 }), capitalize(formatDue(t.dueDate)));
}

export function taskMeta(t, { showArea = true } = {}) {
  const parts = [];
  if (t.status === 'doing') parts.push(h('span', { class: 'pill pill--doing' }, icon('play', { size: 11 }), 'em andamento'));
  parts.push(dueChip(t));
  if (t.importance === 'high') parts.push(h('span', { class: 'pill pill--important' }, icon('flag', { size: 12 }), 'importante'));
  if ((t.postponedCount || 0) >= 2) parts.push(h('span', { class: 'meta-muted' }, `adiada ${t.postponedCount}×`));
  if (showArea && t.areaId) parts.push(areaTag(t.areaId));
  return parts.filter(Boolean);
}

export function taskRow(t, { showArea = true, reason } = {}) {
  const done = t.status === 'done';
  const dropped = t.status === 'dropped';
  const row = h('li', { class: ['task-row', t.status === 'doing' && 'is-doing', done && 'is-done', dropped && 'is-dropped'] });

  const check = h('button', {
    type: 'button',
    class: 'check',
    'data-key': `check-${t.id}`,
    'aria-label': done ? `Reabrir: ${t.title}` : `Concluir: ${t.title}`,
    'aria-pressed': String(done),
    disabled: dropped,
    onClick: (e) => {
      e.stopPropagation();
      if (done) reopenWithFeedback(t.id);
      else completeWithFeedback(t.id, row);
    },
  }, icon('check', { size: 14 }));

  const meta = done || dropped
    ? [h('span', { class: 'meta-muted' }, done ? `concluída ${relativeTime(t.completedAt)}` : `deixada de lado ${relativeTime(t.droppedAt)}`),
      showArea && areaTag(t.areaId)]
    : taskMeta(t, { showArea });

  add(row, 
    check,
    h('button', { type: 'button', class: 'task-row__main', 'data-key': `task-${t.id}`, onClick: () => openTaskSheet(t.id) },
      h('span', { class: 'task-row__title' }, t.title),
      meta.filter(Boolean).length > 0 && h('span', { class: 'task-row__meta' }, meta),
      reason && h('span', { class: 'task-row__reason' }, reason)),
    h('span', { class: 'task-row__chev', 'aria-hidden': 'true' }, icon('chevronRight', { size: 16 })),
  );
  return row;
}

export function taskList(tasks, opts) {
  return h('ul', { class: 'task-list' }, tasks.map((t) => taskRow(t, opts)));
}
