/**
 * Painel lateral (desktop) / folha inferior (celular) / diálogo central.
 * - Prende o foco dentro do painel, fecha com Esc e devolve o foco ao sair.
 * - Re-renderiza sozinho quando os dados mudam (render retorna null → fecha).
 */
import { h, swap } from './dom.js';
import { icon } from './icons.js';
import { subscribe } from '../core/store.js';
import { hidePopover, syncPopover } from './popover.js';

const openStack = [];
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openStack.length) { e.preventDefault(); openStack[openStack.length - 1].close(); }
});

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openSheet({ title = '', render, onClose, variant = 'side', focus = null, className, key }) {
  // Cliques repetidos não abrem o mesmo painel duas vezes.
  const sheetKey = key || `${variant}:${title}`;
  const existing = openStack.find((s) => s.key === sheetKey);
  if (existing) { existing.panel.focus({ preventScroll: true }); return existing; }
  hidePopover(true);
  const prevFocus = document.activeElement;
  const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`;
  const titleEl = h('h2', { class: 'sheet__title', id: titleId }, title);
  const body = h('div', { class: 'sheet__body' });
  const panel = h('div', {
    class: ['sheet', `sheet--${variant}`, className], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1',
  },
  h('div', { class: 'sheet__handle', 'aria-hidden': 'true' }),
  h('header', { class: 'sheet__header' }, titleEl,
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fechar', onClick: () => api.close() }, icon('x'))),
  body);
  const root = h('div', { class: ['sheet-root', `sheet-root--${variant}`] },
    h('div', { class: 'sheet-backdrop', onClick: () => api.close() }), panel);

  const api = {
    key: sheetKey, body, panel, isOpen: true,
    setTitle(t) { titleEl.textContent = t; },
    refresh() {
      if (!api.isOpen) return;
      const node = render(api);
      if (node === null) { api.close(); return; }
      if (!node) return;
      const hadFocus = panel.contains(document.activeElement);
      swap(body, node);
      syncPopover();
      // Se o elemento focado sumiu na re-renderização, mantém o foco dentro do painel.
      if (hadFocus && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    },
    close(result) {
      if (!api.isOpen) return;
      api.isOpen = false;
      unsubscribe();
      openStack.splice(openStack.indexOf(api), 1);
      root.classList.remove('is-open');
      root.classList.add('is-closing');
      hidePopover(true);
      setTimeout(() => {
        root.remove();
        if (!document.querySelector('.sheet-root')) document.body.classList.remove('has-sheet');
      }, 220);
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
      onClose?.(result);
    },
  };

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  document.body.append(root);
  document.body.classList.add('has-sheet');
  openStack.push(api);
  api.refresh();
  const unsubscribe = subscribe(() => api.refresh());
  requestAnimationFrame(() => {
    root.classList.add('is-open');
    const target = focus ? panel.querySelector(focus) : null;
    (target || panel).focus({ preventScroll: true });
  });
  return api;
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const sheet = openSheet({
      title,
      variant: 'dialog',
      focus: '[data-role="cancel"]',
      onClose: () => { if (!answered) resolve(false); },
      render: () => h('div', { class: 'dialog-body' },
        message && h('p', { class: 'muted' }, message),
        h('div', { class: 'dialog-actions' },
          h('button', { type: 'button', class: 'btn btn--ghost', 'data-role': 'cancel', onClick: () => sheet.close() }, cancelLabel),
          h('button', {
            type: 'button', class: ['btn', danger ? 'btn--danger' : 'btn--primary'],
            onClick: () => { answered = true; resolve(true); sheet.close(); },
          }, confirmLabel))),
    });
  });
}
