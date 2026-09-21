/** "Tirar da cabeça": captura rápida disponível de qualquer lugar (atalho N). */
import { h } from '../ui/dom.js';
import { openSheet } from '../ui/sheet.js';
import { button } from '../ui/components.js';
import { capture } from '../domain/inbox.js';
import { toast, toastError } from '../ui/toast.js';
import { plural } from '../utils/numbers.js';
import { openOrganizer } from './inbox-organizer.js';

export async function captureWithFeedback(text) {
  try {
    const items = await capture(text);
    if (!items.length) return items;
    toast(items.length === 1 ? 'Guardado na caixa de entrada.' : `${plural(items.length, 'item guardado', 'itens guardados')} na caixa de entrada.`, {
      action: { label: 'Organizar', fn: () => openOrganizer(items[0].id) },
    });
    return items;
  } catch (err) { toastError(err); return []; }
}

/** Área de texto de captura reutilizável: Enter guarda, Shift+Enter quebra linha. */
export function captureBox({ key, placeholder = 'O que está ocupando sua cabeça?', big = false, autofocus = false, onDone, buttonLabel = 'Guardar' } = {}) {
  const ta = h('textarea', {
    class: ['capture__input', big && 'capture__input--big'], rows: big ? 3 : 1, 'data-key': key, placeholder,
    'aria-label': 'Tirar algo da cabeça', maxlength: 5000, autofocus,
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
    title: 'Tirar da cabeça',
    variant: 'dialog',
    focus: 'textarea',
    render: () => h('div', { class: 'capture-sheet' },
      h('p', { class: 'muted' }, 'Escreva do jeito que vier. Uma coisa por linha — você decide o que fazer com cada uma depois.'),
      captureBox({ key: 'capture-sheet', big: true, onDone: (items) => { if (items.length) sheet.close(); } }),
      h('p', { class: 'hint' }, 'Enter guarda · Shift + Enter quebra a linha')),
  });
  return sheet;
}

