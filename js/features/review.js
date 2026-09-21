/**
 * "Revisar meu plano": uma pendência por vez, das que merecem mais atenção para as demais.
 * Pensado para quem tem dezenas de pendências e não sabe por onde começar.
 */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { chipGroup, button, areaTag } from '../ui/components.js';
import { state } from '../core/store.js';
import { openTasks, isOpen, DUE_PRESETS, setDueDate, completeTask, dropTask, startTask } from '../domain/tasks.js';
import { rankTasks } from '../domain/priority.js';
import { toast, toastError } from '../ui/toast.js';
import { pickCopy } from '../content/microcopy.js';
import { today, relativeTime, formatDue, startOfWeek, addDays } from '../utils/dates.js';
import { plural } from '../utils/numbers.js';
import { capitalize } from '../utils/helpers.js';

export const weekTaskIds = () => {
  const start = startOfWeek(today());
  const end = addDays(start, 7);
  return openTasks().filter((t) => t.dueDate && t.dueDate >= start && t.dueDate < end).map((t) => t.id);
};

export function openReview(ids, { title = 'Revisar meu plano' } = {}) {
  const base = ids?.length ? ids : openTasks().map((t) => t.id);
  const order = new Map(rankTasks().map((r, i) => [r.task.id, i]));
  const queue = base.filter((id) => state.tasks.get(id) && isOpen(state.tasks.get(id))).sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
  if (!queue.length) { toast('Nada para revisar agora.'); return null; }
  let index = 0;
  let mode = 'ask';
  const tally = { now: 0, dated: 0, nodate: 0, kept: 0, done: 0, dropped: 0 };

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
    title,
    render: () => {
      const t = current();
      if (!t) return summary();
      const late = t.dueDate && t.dueDate < today();
      const facts = [
        t.dueDate ? capitalize(formatDue(t.dueDate)) : 'Sem prazo',
        `criada ${relativeTime(t.createdAt)}`,
        t.postponedCount ? `adiada ${t.postponedCount}×` : null,
      ].filter(Boolean);
      const body = h('div', { class: 'review' },
        h('div', { class: 'review__top' },
          h('span', { class: 'review__counter' }, `${index + 1} de ${queue.length}`),
          h('span', { class: 'review__bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${(index / queue.length) * 100}%` } }))),
        index === 0 && h('p', { class: 'muted small' }, pickCopy('review')),
        h('div', { class: ['review__card', late && 'is-late'] },
          h('p', { class: 'review__title' }, t.title),
          h('p', { class: 'review__facts' }, facts.join(' · '), t.areaId && ' · ', areaTag(t.areaId))));

      if (mode === 'date') {
        add(body, h('p', { class: 'question' }, 'Para quando?'),
          chipGroup(DUE_PRESETS.map((p) => ({ value: p.id, label: p.label })), null, (v) => {
            const p = DUE_PRESETS.find((x) => x.id === v);
            if (p) act('dated', () => setDueDate(t.id, p.date()));
          }, { label: 'Novo prazo', className: 'chips--lg' }),
          h('div', { class: 'review__date' },
            h('label', { class: 'field__label' }, 'Ou escolha uma data ',
              h('input', { type: 'date', class: 'input input--date', min: today(), onChange: (e) => e.target.value && act('dated', () => setDueDate(t.id, e.target.value)) }))),
          button('Voltar', { variant: 'ghost', icon: 'arrowLeft', onClick: () => { mode = 'ask'; sheet.refresh(); } }));
      } else {
        add(body, h('p', { class: 'question' }, 'O que deseja fazer?'),
          h('div', { class: 'options' },
            option('Fazer agora', 'Fica em andamento, com prazo para hoje.', 'play', () => act('now', async () => { if (t.dueDate !== today()) await setDueDate(t.id, today()); await startTask(t.id); })),
            option('Escolher nova data', 'Defina um prazo realista.', 'calendar', () => { mode = 'date'; sheet.refresh(); }),
            t.dueDate
              ? option('Manter sem prazo', 'Continua na lista, sem cobrança de data.', 'more', () => act('nodate', () => setDueDate(t.id, null)))
              : option('Manter como está', 'Sem mudanças por enquanto.', 'arrowRight', () => act('kept')),
            option('Já fiz', 'Marca como concluída.', 'check', () => act('done', () => completeTask(t.id))),
            option('Cancelar', 'Sai da lista. Fica registrado no histórico.', 'ban', () => act('dropped', () => dropTask(t.id)))),
          h('div', { class: 'review__footer' },
            button('Pular', { variant: 'ghost', icon: 'arrowRight', onClick: () => act('kept') }),
            button('Parar por aqui', { variant: 'ghost', onClick: () => { index = queue.length; sheet.refresh(); } })));
      }
      return body;
    },
  });

  function summary() {
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    const parts = [
      tally.now && `${tally.now} para fazer agora`,
      tally.dated && `${tally.dated} com novo prazo`,
      tally.nodate && `${tally.nodate} sem prazo`,
      tally.kept && plural(tally.kept, 'mantida', 'mantidas'),
      tally.done && plural(tally.done, 'concluída', 'concluídas'),
      tally.dropped && plural(tally.dropped, 'cancelada', 'canceladas'),
    ].filter(Boolean);
    return h('div', { class: 'review review--done' },
      h('div', { class: 'review__done-icon', 'aria-hidden': 'true' }, icon('check', { size: 22 })),
      h('p', { class: 'review__title' }, pickCopy('reviewDone')),
      h('p', { class: 'muted' }, total ? `${plural(total, 'pendência revisada', 'pendências revisadas')}: ${parts.join(', ')}.` : 'Nenhuma pendência foi alterada.'),
      button('Fechar', { variant: 'primary', onClick: () => sheet.close() }));
  }
  return sheet;
}

export function option(title, desc, ic, onClick) {
  return h('button', { type: 'button', class: 'option', onClick },
    h('span', { class: 'option__icon', 'aria-hidden': 'true' }, icon(ic, { size: 18 })),
    h('span', { class: 'option__text' }, h('span', { class: 'option__title' }, title), desc && h('span', { class: 'option__desc' }, desc)));
}

