/** Detalhe da tarefa: editar, prazo, começar, concluir, cancelar. */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet, confirmDialog } from '../ui/sheet.js';
import { chipGroup, field, button } from '../ui/components.js';
import { labelWithHelp, HELP } from '../ui/help.js';
import { state } from '../core/store.js';
import { eventsOf } from '../core/events.js';
import { isOpen, updateTask } from '../domain/tasks.js';
import { rankTasks, explain } from '../domain/priority.js';
import { listAreas } from '../domain/areas.js';
import { formatDateTime, relativeTime, formatDay } from '../utils/dates.js';
import { toastError } from '../ui/toast.js';
import { dueField, importanceField, estimateField, goalField } from './fields.js';
import {
  completeWithFeedback, startWithFeedback, pauseWithFeedback, dropWithFeedback,
  reopenWithFeedback, setDueWithFeedback, deleteWithFeedback,
} from './task-actions.js';

const FIELD_NAMES = { title: 'nome', notes: 'descrição', areaId: 'área', importance: 'importância', goalId: 'meta', estimateMin: 'duração', nextStep: 'próximo passo' };
const EVENT_TEXT = {
  'task.created': () => 'Criada',
  'task.started': () => 'Começou',
  'task.paused': () => 'Pausada',
  'task.completed': () => 'Concluída',
  'task.reopened': () => 'Reaberta',
  'task.dropped': () => 'Cancelada',
  'task.postponed': (m) => (m.to ? `Adiada para ${formatDay(m.to)}` : 'Adiada (prazo removido)'),
  'task.rescheduled': (m) => (m.to ? `Prazo definido: ${formatDay(m.to)}` : 'Prazo removido'),
  'task.edited': (m) => `Editada (${(m.fields || []).map((f) => FIELD_NAMES[f] || f).join(', ')})`,
};

export function openTaskSheet(id) {
  // O painel só se reconstrói quando ESTA tarefa muda (evita perder o que está sendo editado).
  let lastSeen = null;
  const sheet = openSheet({
    title: 'Tarefa',
    render: (api) => {
      const t = state.tasks.get(id);
      if (!t) return null;
      const stamp = `${t.updatedAt}|${state.goals.size}`;
      if (stamp === lastSeen) return undefined;
      lastSeen = stamp;
      return renderTask(t, api);
    },
  });
  return sheet;
}

function renderTask(t, sheet) {
  const open = isOpen(t);
  const wrap = h('div', { class: 'task-sheet' });
  const title = h('textarea', {
    class: 'title-input', rows: 1, 'data-key': 'task-title', 'aria-label': 'Nome da tarefa', value: t.title, maxlength: 300,
    onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
    onBlur: (e) => { if (e.target.value.trim() && e.target.value !== t.title) updateTask(t.id, { title: e.target.value }).catch(toastError); else e.target.value = t.title; },
    onInput: (e) => autoGrow(e.target),
  });
  requestAnimationFrame(() => autoGrow(title));
  const facts = [`Criada ${relativeTime(t.createdAt)}`];
  if (t.postponedCount) facts.push(`adiada ${t.postponedCount}×`);
  add(wrap, title, h('p', { class: 'task-sheet__facts' }, facts.join(' · ')));

  if (!open) {
    add(wrap, h('div', { class: ['status-banner', t.status === 'done' && 'status-banner--ok'] },
      icon(t.status === 'done' ? 'check' : 'ban', { size: 16 }),
      h('span', null, t.status === 'done' ? `Concluída ${relativeTime(t.completedAt)}.` : `Cancelada ${relativeTime(t.droppedAt)}.`),
      button('Reabrir', { variant: 'ghost', size: 'sm', icon: 'undo', onClick: () => reopenWithFeedback(t.id) })));
  } else {
    const ranked = rankTasks().find((r) => r.task.id === t.id);
    if (ranked?.reasons.length) {
      add(wrap, h('p', { class: 'why' }, labelWithHelp('Por que aparece como prioridade', HELP.prioridade, { className: 'why__label' }), h('span', null, explain(ranked))));
    }
    add(wrap, h('div', { class: 'task-sheet__primary' },
      button('Concluir', { variant: 'primary', icon: 'check', onClick: () => { sheet.close(); completeWithFeedback(t.id); } }),
      t.status === 'doing'
        ? button('Pausar', { icon: 'pause', onClick: () => pauseWithFeedback(t.id) })
        : button('Começar agora', { icon: 'play', onClick: () => startWithFeedback(t.id) })));

    add(wrap,
      h('section', { class: 'sheet-section' }, dueField(t.dueDate, (d) => setDueWithFeedback(t.id, d), { label: 'Prazo', allowPast: true })),
      h('section', { class: 'sheet-section' }, importanceField(t.importance, (v) => updateTask(t.id, { importance: v }).catch(toastError))),
      h('section', { class: 'sheet-section' }, h('div', { class: 'field' }, labelWithHelp('Área', HELP.area),
        chipGroup(listAreas().map((a) => ({ value: a.id, label: a.name, color: a.color })), t.areaId,
          (v) => updateTask(t.id, { areaId: v }).catch(toastError), { label: 'Área', allowNone: true, className: 'chips--areas' }))),
      h('section', { class: 'sheet-section' }, goalField(t.goalId, t.nextStep, (g, ns) => updateTask(t.id, { goalId: g, nextStep: ns }).catch(toastError))),
      h('section', { class: 'sheet-section' }, estimateField(t.estimateMin, (v) => updateTask(t.id, { estimateMin: v }).catch(toastError))));
  }

  add(wrap, h('section', { class: 'sheet-section' },
    field('Descrição', h('textarea', {
      class: 'input', rows: 3, 'data-key': 'task-notes', placeholder: 'Detalhes, links, observações…', value: t.notes || '',
      onBlur: (e) => { if (e.target.value !== (t.notes || '')) updateTask(t.id, { notes: e.target.value }).catch(toastError); },
    }))));

  const history = eventsOf(t.id).slice().reverse();
  add(wrap, h('details', { class: 'history' },
    h('summary', null, `Histórico · ${history.length}`),
    h('ol', { class: 'timeline' }, history.map((e) => h('li', null,
      h('span', { class: 'timeline__text' }, (EVENT_TEXT[e.type] || (() => e.type))(e.metadata || {})),
      h('time', { class: 'timeline__time', datetime: new Date(e.createdAt).toISOString() }, formatDateTime(e.createdAt)))))));

  add(wrap, h('footer', { class: 'task-sheet__footer' },
    open && button('Cancelar tarefa', { variant: 'ghost', icon: 'ban', onClick: () => { sheet.close(); dropWithFeedback(t.id); } }),
    button('Excluir', {
      variant: 'ghost-danger', icon: 'trash',
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'Excluir esta tarefa?',
          message: 'Excluir apaga a tarefa como se fosse um engano. Se ela só perdeu o sentido, prefira “Cancelar tarefa” — assim o histórico fica registrado.',
          confirmLabel: 'Excluir', danger: true,
        });
        if (ok) { sheet.close(); deleteWithFeedback(t.id); }
      },
    })));
  return wrap;
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
