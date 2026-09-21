/** Anotação rápida: guardar algo sem decidir nada agora. */
import { h } from '../ui/dom.js';
import { openSheet } from '../ui/sheet.js';
import { button } from '../ui/components.js';
import { capture } from '../domain/inbox.js';
import { toast, toastError } from '../ui/toast.js';
import { plural } from '../utils/numbers.js';
import { openOrganizer } from './inbox-organizer.js';
import { pickCopy } from '../content/microcopy.js';

export async function captureWithFeedback(text) {
  try {
    const items = await capture(text);
    if (!items.length) return items;
    toast(items.length === 1 ? 'Anotação guardada.' : `${plural(items.length, 'anotação guardada', 'anotações guardadas')}.`, {
      action: { label: 'Organizar', fn: () => openOrganizer(items[0].id) },
    });
    return items;
  } catch (err) { toastError(err); return []; }
}

/** Área de texto de captura reutilizável: Enter guarda, Shift+Enter quebra linha. */
export function captureBox({ key, placeholder, big = false, autofocus = false, onDone, buttonLabel = 'Guardar' } = {}) {
  placeholder = placeholder || pickCopy('capture');
  const ta = h('textarea', {
    class: ['capture__input', big && 'capture__input--big'], rows: big ? 3 : 1, 'data-key': key, placeholder,
    'aria-label': 'Anotação rápida', maxlength: 5000, autofocus,
    onInput: (e) => grow(e.target),
    onKeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } },
  });
  async function submit() {
    const text = ta.value;
    if (!text.trim()) { ta.focus(); return; }
    ta.value = '';
    grow(ta);
    const items = await captureWithFeedback(text);
    onDone?.(items);
  }
  const form = h('form', { class: ['capture', big && 'capture--big'], onSubmit: (e) => { e.preventDefault(); submit(); } },
    ta, button(buttonLabel, { variant: 'primary', type: 'submit', icon: big ? null : 'plus' }));
  return form;
}

function grow(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
}

export function openCapture() {
  const sheet = openSheet({
    title: 'Anotação rápida',
    variant: 'dialog',
    focus: 'textarea',
    render: () => h('div', { class: 'capture-sheet' },
      h('p', { class: 'muted' }, 'Guarde agora e decida depois se vira tarefa, meta ou só um lembrete. Uma coisa por linha.'),
      captureBox({ key: 'capture-sheet', big: true, onDone: (items) => { if (items.length) sheet.close(); } }),
      h('p', { class: 'hint' }, 'Enter guarda · Shift + Enter quebra a linha')),
  });
  return sheet;
}

