/** Feedback curto após ações, com "Desfazer" quando possível. */
import { h } from './dom.js';

/** Duração padrão: 4,5 s; com ação (ex.: Desfazer), 6,5 s. Passar o mouse ou focar pausa. */
export function toast(message, { action, actions, duration, tone } = {}) {
  const list = (actions || (action ? [action] : [])).filter(Boolean);
  duration = duration || (list.length ? 6500 : 4500);
  const host = document.getElementById('toasts');
  if (!host) return () => {};
  let timer;
  const el = h('div', { class: ['toast', tone && `toast--${tone}`], role: tone === 'danger' ? 'alert' : null },
    h('span', { class: 'toast__msg' }, message),
    list.length > 0 && h('span', { class: 'toast__actions' }, list.map((a) => h('button', {
      type: 'button',
      class: 'toast__action',
      onClick: async () => { dismiss(); try { await a.fn(); } catch (err) { console.error(err); } },
    }, a.label))),
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

/**
 * Erro para o usuário: mensagem simples, detalhe técnico só no console.
 * Mensagens de validação (err.userMessage) aparecem como estão.
 */
export function toastError(err, { retry, message } = {}) {
  console.error(err);
  const text = message || err?.userMessage || 'Não foi possível salvar a alteração.';
  toast(text, { tone: 'danger', duration: 8000, action: retry ? { label: 'Tentar novamente', fn: retry } : undefined });
}
