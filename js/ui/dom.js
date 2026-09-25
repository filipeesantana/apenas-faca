/** Construção de DOM sem innerHTML (sem risco de injeção a partir dos dados do usuário). */

const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected', 'open', 'indeterminate']);

function setProps(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Como Element.append, mas ignora null/false (evita textos "null" na tela). */
export const add = (el, ...children) => append(el, children);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  setProps(el, props);
  return append(el, children);
}

export function s(tag, attrs, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, v);
  return append(el, children);
}

/**
 * Troca o conteúdo de um container preservando foco, texto digitado e seleção
 * do elemento ativo (identificado por data-key). Evita que re-renderizações
 * "roubem" o campo onde o usuário está digitando.
 */
export function swap(container, ...nodes) {
  const active = document.activeElement;
  let saved = null;
  if (active && active !== container && container.contains(active) && active.dataset?.key) {
    saved = { key: active.dataset.key, tag: active.tagName, type: active.type };
    if (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|number|email|tel|url)$/.test(active.type))) {
      saved.value = active.value;
      saved.start = active.selectionStart;
      saved.end = active.selectionEnd;
    }
  }
  container.replaceChildren();
  append(container, nodes);
  if (!saved) return;
  const el = container.querySelector(`[data-key="${CSS.escape(saved.key)}"]`);
  if (!el) return;
  if (saved.value != null && 'value' in el) el.value = saved.value;
  el.focus({ preventScroll: true });
  if (saved.start != null) {
    try { el.setSelectionRange(saved.start, saved.end); } catch { /* campos sem seleção */ }
  }
}

export const srOnly = (text) => h('span', { class: 'sr-only' }, text);
