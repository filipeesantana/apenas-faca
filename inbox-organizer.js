/**
 * Organizar a caixa de entrada, um item por vez.
 * "O que isso é?" → (tarefa) "Tem prazo?" → "De que área?" → pronto.
 * "Não sei" é uma resposta válida em todas as etapas.
 */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { chipGroup, button } from '../ui/components.js';
import { state } from '../core/store.js';
import { openInboxItems, processAsTask, keepAsNote, discardItem } from '../domain/inbox.js';
import { listAreas } from '../domain/areas.js';
import { today, endOfWeek, relativeTime } from '../utils/dates.js';
import { plural } from '../utils/numbers.js';
import { toastError } from '../ui/toast.js';
import { option } from './review.js';
import { openGoalForm } from './goal-form.js';
import { go } from '../core/router.js';

export function openOrganizer(startId) {
  const initial = openInboxItems().map((i) => i.id);
  if (!initial.length) return null;
  if (startId && initial.includes(startId)) { initial.splice(initial.indexOf(startId), 1); initial.unshift(startId); }
  const queue = initial;
  let index = 0;
  let step = 'what';
  let draft = null;
  const tally = { task: 0, goal: 0, note: 0, discarded: 0, skipped: 0 };

  const current = () => {
    while (index < queue.length) {
      const it = state.inbox.get(queue[index]);
      if (it && it.status === 'open') return it;
      index++;
    }
    return null;
  };

  const next = (kind) => { tally[kind]++; index++; step = 'what'; draft = null; sheet.refresh(); };
  const run = async (kind, fn) => {
    const pending = fn();
    next(kind);
    try { await pending; } catch (err) { toastError(err); }
  };

  const sheet = openSheet({
    title: 'Organizar',
    render: () => {
      const item = current();
      if (!item) return summary();
      if (!draft || draft.id !== item.id) draft = { id: item.id, title: item.text, dueDate: null };

      const titleInput = h('textarea', {
        class: 'title-input', rows: 1, 'data-key': `org-${item.id}`, value: draft.title, 'aria-label': 'Texto do item (pode reescrever)',
        onInput: (e) => { draft.title = e.target.value; },
        onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
      });

      const body = h('div', { class: 'organizer' },
        h('div', { class: 'organizer__top' },
          h('span', { class: 'review__counter' }, `${index + 1} de ${queue.length}`),
          h('span', { class: 'muted small' }, `anotado ${relativeTime(item.createdAt)}`)),
        h('div', { class: 'review__card' }, titleInput, h('p', { class: 'hint' }, 'Pode reescrever para ficar mais claro.')));

      if (step === 'what') {
        add(body, h('p', { class: 'question' }, 'O que isso é?'),
          h('div', { class: 'options' },
            option('Preciso fazer', 'Vira uma tarefa.', 'tasks', () => { step = 'due'; sheet.refresh(); }),
            option('Quero alcançar', 'Vira uma meta, com progresso.', 'target', () => {
              const title = draft.title;
              const itemId = item.id;
              sheet.close();
              openGoalForm({ title, fromInboxId: itemId, onDone: () => { if (openInboxItems().length) openOrganizer(); } });
            }),
            option('Só queria anotar', 'Fica guardado, sem cobrança.', 'note', () => run('note', () => keepAsNote(item.id, draft.title))),
            option('Não preciso mais', 'Sai da sua cabeça e da lista.', 'x', () => run('discarded', () => discardItem(item.id)))));
      } else if (step === 'due') {
        const dateInput = h('input', {
          type: 'date', class: 'input', 'aria-label': 'Escolher uma data', min: today(),
          onChange: (e) => { if (e.target.value) { draft.dueDate = e.target.value; step = 'area'; sheet.refresh(); } },
        });
        add(body, h('p', { class: 'question' }, 'Tem prazo?'),
          h('div', { class: 'options options--grid' },
            option('Hoje', null, 'clock', () => { draft.dueDate = today(); step = 'area'; sheet.refresh(); }),
            option('Esta semana', null, 'calendar', () => { draft.dueDate = endOfWeek(); step = 'area'; sheet.refresh(); }),
            option('Não sei', 'Tudo bem. Dá para decidir depois.', 'more', () => { draft.dueDate = null; step = 'area'; sheet.refresh(); })),
          h('div', { class: 'field field--inline' }, h('label', { class: 'field__label' }, 'Ou escolha uma data', dateInput)),
          backButton('what'));
      } else if (step === 'area') {
        add(body, h('p', { class: 'question' }, 'De que parte da sua vida é?'),
          chipGroup(listAreas().map((a) => ({ value: a.id, label: a.name, color: a.color })), null,
            (areaId) => run('task', () => processAsTask(item.id, { title: draft.title, dueDate: draft.dueDate, areaId })),
            { label: 'Área', className: 'chips--areas chips--lg' }),
          h('div', { class: 'row-actions' },
            button('Pular esta parte', { variant: 'secondary', onClick: () => run('task', () => processAsTask(item.id, { title: draft.title, dueDate: draft.dueDate })) }),
            backButton('due')));
      }

      add(body, h('div', { class: 'organizer__footer' },
        button('Decidir depois', { variant: 'ghost', icon: 'arrowRight', onClick: () => next('skipped') })));
      return body;
    },
  });

  function backButton(to) {
    return button('Voltar', { variant: 'ghost', icon: 'arrowLeft', onClick: () => { step = to; sheet.refresh(); } });
  }

  function summary() {
    const parts = [
      tally.task && plural(tally.task, 'virou tarefa', 'viraram tarefas'),
      tally.note && plural(tally.note, 'virou anotação', 'viraram anotações'),
      tally.discarded && plural(tally.discarded, 'saiu da lista', 'saíram da lista'),
      tally.skipped && plural(tally.skipped, 'ficou para depois', 'ficaram para depois'),
    ].filter(Boolean);
    const remaining = openInboxItems().length;
    return h('div', { class: 'review review--done' },
      h('div', { class: 'review__done-icon', 'aria-hidden': 'true' }, icon('check', { size: 22 })),
      h('p', { class: 'review__title' }, remaining ? 'Por agora, é isso.' : 'Caixa de entrada vazia.'),
      parts.length > 0 && h('p', { class: 'muted' }, `${parts.join(' · ')}.`),
      h('div', { class: 'row-actions row-actions--center' },
        tally.task > 0 && button('Ver tarefas', { onClick: () => { sheet.close(); go('tarefas'); } }),
        button('Fechar', { variant: 'primary', onClick: () => sheet.close() })));
  }
  return sheet;
}
