/** Detalhe da tarefa: editar, dar prazo, começar, concluir, abandonar. */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet, confirmDialog } from '../ui/sheet.js';
import { chipGroup, field, button } from '../ui/components.js';
import { state } from '../core/store.js';
import { eventsOf } from '../core/events.js';
import { DUE_PRESETS, isOpen, updateTask } from '../domain/tasks.js';
import { listAreas } from '../domain/areas.js';
import { activeGoals } from '../domain/goals.js';
import { formatDue, formatDateTime, relativeTime, formatDay, today } from '../utils/dates.js';
import { capitalize } from '../utils/helpers.js';
import { toastError } from '../ui/toast.js';
import {
  completeWithFeedback, startWithFeedback, pauseWithFeedback, dropWithFeedback,
  reopenWithFeedback, setDueWithFeedback, deleteWithFeedback,
} from './task-actions.js';

const EVENT_TEXT = {
  'task.created': () => 'Criada',
  'task.started': () => 'Começou',
  'task.paused': () => 'Pausada',
  'task.completed': () => 'Concluída',
  'task.reopened': () => 'Reaberta',
  'task.dropped': () => 'Decidiu não fazer',
  'task.postponed': (m) => (m.to ? `Adiada para ${formatDay(m.to)}` : 'Adiada (prazo removido)'),
  'task.rescheduled': (m) => (m.to ? `Prazo definido: ${formatDay(m.to)}` : 'Prazo removido'),
  'task.edited': (m) => `Editada (${(m.fields || []).map((f) => ({ title: 'título', notes: 'notas', areaId: 'área', importance: 'importância', goalId: 'meta' }[f] || f)).join(', ')})`,
};

export function openTaskSheet(id) {
  const sheet = openSheet({
    title: 'Tarefa',
    render: (api) => {
      const t = state.tasks.get(id);
      if (!t) return null;
      return renderTask(t, api);
    },
  });
  return sheet;
}

function renderTask(t, sheet) {
  const open = isOpen(t);
  const wrap = h('div', { class: 'task-sheet' });

  const title = h('textarea', {
    class: 'title-input', rows: 1, 'data-key': 'task-title', 'aria-label': 'Título da tarefa', value: t.title, maxlength: 300,
    onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
    onBlur: (e) => { if (e.target.value.trim() && e.target.value !== t.title) updateTask(t.id, { title: e.target.value }).catch(toastError); else e.target.value = t.title; },
    onInput: (e) => autoGrow(e.target),
  });
  requestAnimationFrame(() => autoGrow(title));

  const facts = [`Criada ${relativeTime(t.createdAt)}`];
  if (t.postponedCount) facts.push(`adiada ${t.postponedCount}×`);
  add(wrap, title, h('p', { class: 'task-sheet__facts' }, facts.join(' · ')));

  if (!open) {
    add(wrap, h('div', { class: ['status-banner', t.status === 'done' ? 'status-banner--ok' : ''] },
      icon(t.status === 'done' ? 'check' : 'ban', { size: 16 }),
      h('span', null, t.status === 'done' ? `Concluída ${relativeTime(t.completedAt)}.` : `Você decidiu não fazer ${relativeTime(t.droppedAt)}.`),
      button('Reabrir', { variant: 'ghost', size: 'sm', icon: 'undo', onClick: () => reopenWithFeedback(t.id) })));
  } else {
    add(wrap, h('div', { class: 'task-sheet__primary' },
      button('Concluir', { variant: 'primary', icon: 'check', onClick: () => { completeWithFeedback(t.id); sheet.close(); } }),
      t.status === 'doing'
        ? button('Pausar', { icon: 'pause', onClick: () => pauseWithFeedback(t.id) })
        : button('Começar', { icon: 'play', onClick: () => startWithFeedback(t.id) })));

    // Prazo
    const presetMatch = DUE_PRESETS.find((p) => p.date() === t.dueDate);
    const dateInput = h('input', {
      type: 'date', class: 'input input--date', 'aria-label': 'Escolher data', value: t.dueDate || '',
      onChange: (e) => { if (e.target.value) setDueWithFeedback(t.id, e.target.value); },
    });
    add(wrap, h('section', { class: 'sheet-section' },
      h('h3', { class: 'sheet-section__title' }, 'Quando?',
        t.dueDate && h('span', { class: 'sheet-section__value' }, ` · ${capitalize(formatDue(t.dueDate))}`)),
      h('div', { class: 'due-picker' },
        chipGroup(
          [...DUE_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: 'none', label: 'Sem prazo' }],
          presetMatch?.id || (t.dueDate ? null : 'none'),
          (v) => {
            if (v === 'none') setDueWithFeedback(t.id, null);
            else if (v) setDueWithFeedback(t.id, DUE_PRESETS.find((p) => p.id === v).date());
          },
          { label: 'Prazo' }),
        dateInput)));

    // Área
    add(wrap, h('section', { class: 'sheet-section' },
      h('h3', { class: 'sheet-section__title' }, 'Área'),
      chipGroup(listAreas().map((a) => ({ value: a.id, label: a.name, color: a.color })), t.areaId,
        (v) => updateTask(t.id, { areaId: v }).catch(toastError), { label: 'Área', allowNone: true, className: 'chips--areas' })));

    // Importância e meta
    const goals = activeGoals();
    add(wrap, h('section', { class: 'sheet-section sheet-section--row' },
      h('label', { class: 'switch' },
        h('input', {
          type: 'checkbox', checked: t.importance === 'high',
          onChange: (e) => updateTask(t.id, { importance: e.target.checked ? 'high' : 'normal' }).catch(toastError),
        }),
        h('span', { class: 'switch__track', 'aria-hidden': 'true' }),
        h('span', null, 'Importante')),
      goals.length > 0 && field('Faz parte de uma meta?', h('select', {
        class: 'input', onChange: (e) => updateTask(t.id, { goalId: e.target.value || null }).catch(toastError),
      }, h('option', { value: '' }, 'Nenhuma'), goals.map((g) => h('option', { value: g.id, selected: g.id === t.goalId }, g.title))))));
  }

  // Notas
  add(wrap, h('section', { class: 'sheet-section' },
    field('Notas', h('textarea', {
      class: 'input', rows: 3, 'data-key': 'task-notes', placeholder: 'Detalhes, links, próximos passos…', value: t.notes || '',
      onBlur: (e) => { if (e.target.value !== (t.notes || '')) updateTask(t.id, { notes: e.target.value }).catch(toastError); },
    }))));

  // Histórico
  const history = eventsOf(t.id).slice().reverse();
  add(wrap, h('details', { class: 'history' },
    h('summary', null, `Histórico · ${history.length}`),
    h('ol', { class: 'timeline' }, history.map((e) => h('li', null,
      h('span', { class: 'timeline__text' }, (EVENT_TEXT[e.type] || (() => e.type))(e.metadata || {})),
      h('time', { class: 'timeline__time', datetime: new Date(e.createdAt).toISOString() }, formatDateTime(e.createdAt)))))));

  // Saídas conscientes
  add(wrap, h('footer', { class: 'task-sheet__footer' },
    open && button('Não vou fazer', { variant: 'ghost', icon: 'ban', onClick: () => { dropWithFeedback(t.id); sheet.close(); } }),
    button('Excluir', {
      variant: 'ghost-danger', icon: 'trash',
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'Excluir esta tarefa?',
          message: 'Use “Não vou fazer” para abandonar conscientemente. Excluir apaga a tarefa como se fosse um engano.',
          confirmLabel: 'Excluir', danger: true,
        });
        if (ok) { sheet.close(); deleteWithFeedback(t.id); }
      },
    })));
  if (open && t.dueDate && t.dueDate < today()) wrap.prepend(h('p', { class: 'sr-only' }, 'Tarefa atrasada.'));
  return wrap;
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
