/** Anotações: guardar primeiro, decidir depois. */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, iconButton, emptyState, sectionHead, pageHead } from '../ui/components.js';
import { undo } from '../core/store.js';
import { openInboxItems, noteItems, discardItem, reopenNote } from '../domain/inbox.js';
import { relativeTime } from '../utils/dates.js';
import { plural } from '../utils/numbers.js';
import { toast, toastError } from '../ui/toast.js';
import { captureBox } from './capture.js';
import { labelWithHelp, HELP } from '../ui/help.js';
import { pickCopy } from '../content/microcopy.js';
import { openOrganizer } from './inbox-organizer.js';

export function inboxView() {
  const items = openInboxItems();
  const notes = noteItems();
  const view = h('div', { class: 'view view--inbox' },
    pageHead(labelWithHelp('Anotações', HELP.anotacao, { className: '' }), pickCopy('inbox', [items.length ? 'pending' : 'empty'])),
    h('div', { class: 'card capture-card' },
      captureBox({ key: 'inbox-capture', big: true }),
      h('p', { class: 'hint' }, 'Enter guarda · Shift + Enter quebra a linha · cole uma lista inteira, se quiser')));

  if (items.length) {
    add(view, h('div', { class: 'organize-bar' },
      h('div', null,
        h('p', { class: 'organize-bar__title' }, `${plural(items.length, 'anotação espera', 'anotações esperam')} uma decisão`),
        h('p', { class: 'muted small' }, 'Para cada uma: é algo a fazer, algo a alcançar, só um lembrete — ou já não importa?')),
      button('Organizar um a um', { variant: 'primary', icon: 'arrowRight', onClick: () => openOrganizer() })));

    add(view, h('ul', { class: 'inbox-list' }, items.map((it) => h('li', { class: 'inbox-item' },
      h('button', { type: 'button', class: 'inbox-item__main', 'data-key': `inbox-${it.id}`, onClick: () => openOrganizer(it.id) },
        h('span', { class: 'inbox-item__text' }, it.text),
        h('span', { class: 'meta-muted' }, relativeTime(it.createdAt))),
      iconButton('trash', `Apagar anotação: ${it.text}`, async () => {
        try {
          const token = await discardItem(it.id);
          toast('Anotação apagada.', { action: { label: 'Desfazer', fn: () => undo(token) } });
        } catch (err) { toastError(err); }
      }, { class: 'icon-btn icon-btn--subtle' })))));
  } else {
    add(view, emptyState({
      icon: 'inbox',
      title: 'Nenhuma anotação esperando decisão.',
      text: 'Quando algo surgir — no meio do trabalho, antes de dormir — anote aqui. Leva segundos, e você não precisa decidir nada na hora.',
      compact: true,
    }));
  }

  if (notes.length) {
    add(view, h('details', { class: 'fold', open: notes.length <= 5 },
      h('summary', null, sectionHead('Lembretes guardados', { count: notes.length, level: 'span' })),
      h('p', { class: 'muted small' }, 'Coisas que você quis guardar, sem cobrança.'),
      h('ul', { class: 'inbox-list inbox-list--notes' }, notes.map((n) => h('li', { class: 'inbox-item' },
        h('div', { class: 'inbox-item__main inbox-item__main--static' },
          icon('note', { size: 16 }),
          h('span', { class: 'inbox-item__text' }, n.text),
          h('span', { class: 'meta-muted' }, relativeTime(n.updatedAt))),
        button('Organizar', { variant: 'ghost', size: 'sm', onClick: () => reopenNote(n.id).then(() => openOrganizer(n.id)).catch(toastError) }),
        iconButton('trash', `Apagar lembrete: ${n.text}`, async () => {
          const token = await discardItem(n.id);
          toast('Lembrete apagado.', { action: { label: 'Desfazer', fn: () => undo(token) } });
        }, { class: 'icon-btn icon-btn--subtle' }))))));
  }
  return view;
}
