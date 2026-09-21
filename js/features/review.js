/**
 * Revisão rápida: passa pelas tarefas uma a uma perguntando "ainda faz sentido?".
 * Pensada para quem acumulou muita coisa (usuários B e D).
 */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { chipGroup, button, areaTag } from '../ui/components.js';
import { state } from '../core/store.js';
import { openTasks, isOpen, DUE_PRESETS, setDueDate, completeTask, dropTask } from '../domain/tasks.js';
import { toast, toastError } from '../ui/toast.js';
import { today, relativeTime, formatDue, diffDays, dayKey } from '../utils/dates.js';
import { plural } from '../utils/numbers.js';
import { capitalize } from '../utils/helpers.js';

function defaultQueue() {
  const ref = today();
  const age = (t) => diffDays(dayKey(t.createdAt), ref);
  return openTasks()
    .sort((a, b) => {
      const la = a.dueDate && a.dueDate < ref ? 1 : 0;
      const lb = b.dueDate && b.dueDate < ref ? 1 : 0;
      return lb - la || (b.postponedCount || 0) - (a.postponedCount || 0) || age(b) - age(a);
    })
    .slice(0, 20)
    .map((t) => t.id);
}

export function openReview(ids) {
  const queue = (ids?.length ? ids : defaultQueue()).filter((id) => state.tasks.get(id) && isOpen(state.tasks.get(id)));
  if (!queue.length) { toast('Nada para revisar agora.'); return; }
  let index = 0;
  let mode = 'ask';
  const tally = { today: 0, dated: 0, kept: 0, done: 0, dropped: 0 };

  const current = () => {
    while (index < queue.length) {
      const t = state.tasks.get(queue[index]);
      if (t && isOpen(t)) return t;
      index++;
    }
    return null;
  };

  const act = async (kind, fn) => {
    tally[kind]++;
    index++;
    mode = 'ask';
    try { await fn?.(); } catch (err) { toastError(err); }
    sheet.refresh();
  };

  const sheet = openSheet({
    title: 'Revisão rápida',
    render: () => {
      const t = current();
      if (!t) return summary();
      const facts = [`Criada ${relativeTime(t.createdAt)}`];
      if (t.dueDate) facts.push(capitalize(formatDue(t.dueDate)));
      if (t.postponedCount) facts.push(`adiada ${t.postponedCount}×`);

      const body = h('div', { class: 'review' },
        h('p', { class: 'review__counter' }, `${index + 1} de ${queue.length}`),
        h('div', { class: 'review__card' },
          h('p', { class: 'review__title' }, t.title),
          h('p', { class: 'review__facts' }, facts.join(' · '), t.areaId && ' · ', areaTag(t.areaId))),
      );

      if (mode === 'date') {
        add(body, h('p', { class: 'question' }, 'Para quando?'),
          chipGroup(DUE_PRESETS.map((p) => ({ value: p.id, label: p.label })), null, (v) => {
            const p = DUE_PRESETS.find((x) => x.id === v);
            act('dated', () => setDueDate(t.id, p.date()));
          }, { label: 'Prazo' }),
          h('div', { class: 'review__date' },
            h('input', { type: 'date', class: 'input', 'aria-label': 'Escolher data', min: today(), onChange: (e) => e.target.value && act('dated', () => setDueDate(t.id, e.target.value)) }),
            button('Voltar', { variant: 'ghost', icon: 'arrowLeft', onClick: () => { mode = 'ask'; sheet.refresh(); } })));
      } else {
        add(body, h('p', { class: 'question' }, 'Ainda faz sentido?'),
          h('div', { class: 'options' },
            option('Sim, faço hoje', 'Fica com prazo para hoje.', 'play', () => act('today', () => setDueDate(t.id, today()))),
            option('Sim, mas com outro prazo', 'Escolha quando.', 'calendar', () => { mode = 'date'; sheet.refresh(); }),
            option('Manter como está', 'Sem mudanças por enquanto.', 'arrowRight', () => act('kept')),
            option('Já fiz', 'Marca como concluída.', 'check', () => act('done', () => completeTask(t.id))),
            option('Não vou fazer', 'Sai da lista, sem culpa.', 'ban', () => act('dropped', () => dropTask(t.id)))));
      }
      return body;
    },
  });

  function summary() {
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    const parts = [
      tally.today && `${tally.today} para hoje`,
      tally.dated && `${tally.dated} com novo prazo`,
      tally.kept && plural(tally.kept, 'mantida', 'mantidas'),
      tally.done && plural(tally.done, 'concluída', 'concluídas'),
      tally.dropped && plural(tally.dropped, 'deixada de lado', 'deixadas de lado'),
    ].filter(Boolean);
    return h('div', { class: 'review review--done' },
      h('div', { class: 'review__done-icon', 'aria-hidden': 'true' }, icon('check', { size: 22 })),
      h('p', { class: 'review__title' }, 'Revisão concluída.'),
      h('p', { class: 'muted' }, total ? `${plural(total, 'tarefa revisada', 'tarefas revisadas')}: ${parts.join(', ')}.` : 'Nenhuma tarefa foi alterada.'),
      button('Fechar', { variant: 'primary', onClick: () => sheet.close() }));
  }
}

export function option(title, desc, ic, onClick) {
  return h('button', { type: 'button', class: 'option', onClick },
    h('span', { class: 'option__icon', 'aria-hidden': 'true' }, icon(ic, { size: 18 })),
    h('span', { class: 'option__text' }, h('span', { class: 'option__title' }, title), desc && h('span', { class: 'option__desc' }, desc)));
}
