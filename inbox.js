/** Caixa de entrada: tirar da cabeça primeiro, decidir depois. */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, iconButton, emptyState, sectionHead, pageHead } from '../ui/components.js';
import { undo } from '../core/store.js';
import { openInboxItems, noteItems, discardItem, reopenNote } from '../domain/inbox.js';
import { relativeTime } from '../utils/dates.js';
import { plural } from '../utils/numbers.js';
import { toast, toastError } from '../ui/toast.js';
import { captureBox } from './capture.js';
import { openOrganizer } from './inbox-organizer.js';

export function inboxView() {
  const items = openInboxItems();
  const notes = noteItems();
  const view = h('div', { class: 'view view--inbox' },
    pageHead('Caixa de entrada', 'Tire da cabeça primeiro. Decida depois.'),
    h('div', { class: 'card capture-card' },
      captureBox({ key: 'inbox-capture', big: true, placeholder: 'O que está ocupando sua cabeça?\nUma coisa por linha.' }),
      h('p', { class: 'hint' }, 'Enter guarda · Shift + Enter quebra a linha · cole uma lista inteira, se quiser')));

  if (items.length) {
    add(view, h('div', { class: 'organize-bar' },
      h('div', null,
        h('p', { class: 'organize-bar__title' }, `${plural(items.length, 'item espera', 'itens esperam')} decisão`),
        h('p', { class: 'muted small' }, 'Para cada um: é algo a fazer, algo a alcançar, só uma anotação — ou já não importa?')),
      button('Organizar um a um', { variant: 'primary', icon: 'arrowRight', onClick: () => openOrganizer() })));

    add(view, h('ul', { class: 'inbox-list' }, items.map((it) => h('li', { class: 'inbox-item' },
      h('button', { type: 'button', class: 'inbox-item__main', 'data-key': `inbox-${it.id}`, onClick: () => openOrganizer(it.id) },
        h('span', { class: 'inbox-item__text' }, it.text),
        h('span', { class: 'meta-muted' }, relativeTime(it.createdAt))),
      iconButton('x', `Não preciso mais: ${it.text}`, async () => {
        try {
          const token = await discardItem(it.id);
          toast('Tirado da lista.', { action: { label: 'Desfazer', fn: () => undo(token) } });
        } catch (err) { toastError(err); }
      }, { class: 'icon-btn icon-btn--subtle' })))));
  } else {
    add(view, emptyState({
      icon: 'inbox',
      title: 'Caixa vazia. Nada esperando decisão.',
      text: 'Quando algo surgir na sua cabeça — no meio do trabalho, antes de dormir — coloque aqui. Leva segundos, e você não precisa decidir nada na hora.',
      compact: true,
    }));
  }

  if (notes.length) {
    add(view, h('details', { class: 'fold', open: notes.length <= 5 },
      h('summary', null, sectionHead('Anotações', { count: notes.length, level: 'span' })),
      h('p', { class: 'muted small' }, 'Coisas que você quis guardar, sem cobrança.'),
      h('ul', { class: 'inbox-list inbox-list--notes' }, notes.map((n) => h('li', { class: 'inbox-item' },
        h('div', { class: 'inbox-item__main inbox-item__main--static' },
          icon('note', { size: 16 }),
          h('span', { class: 'inbox-item__text' }, n.text),
          h('span', { class: 'meta-muted' }, relativeTime(n.updatedAt))),
        button('Organizar', { variant: 'ghost', size: 'sm', onClick: () => reopenNote(n.id).then(() => openOrganizer(n.id)).catch(toastError) }),
        iconButton('trash', `Apagar anotação: ${n.text}`, async () => {
          const token = await discardItem(n.id);
          toast('Anotação apagada.', { action: { label: 'Desfazer', fn: () => undo(token) } });
        }, { class: 'icon-btn icon-btn--subtle' }))))));
  }
  return view;
}
