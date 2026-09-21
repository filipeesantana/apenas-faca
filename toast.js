/** Feedback curto após ações, com "Desfazer" quando possível. */
import { h } from './dom.js';

export function toast(message, { action, duration = 5500, tone } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return () => {};
  let timer;
  const el = h('div', { class: ['toast', tone && `toast--${tone}`] },
    h('span', { class: 'toast__msg' }, message),
    action && h('button', {
      type: 'button',
      class: 'toast__action',
      onClick: async () => { dismiss(); try { await action.fn(); } catch (err) { console.error(err); } },
    }, action.label),
  );
  function dismiss() {
    clearTimeout(timer);
    el.classList.remove('is-in');
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  }
  host.append(el);
  while (host.children.length > 3) host.firstElementChild.remove();
  requestAnimationFrame(() => el.classList.add('is-in'));
  timer = setTimeout(dismiss, duration);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 2500); });
  el.addEventListener('focusin', () => clearTimeout(timer));
  return dismiss;
}

export function toastError(err) {
  console.error(err);
  toast(err?.message ? `Não foi possível concluir: ${err.message}` : 'Algo deu errado. Tente de novo.', { tone: 'danger', duration: 7000 });
}
