/**
 * Motor único de popovers (dicas "?", leitura de gráficos e menus de ação).
 *
 * Por que é renderizado no <body>: um elemento `position: fixed` dentro de um ancestral
 * com `transform` (diálogos, animações) passa a ser posicionado relativo a esse ancestral —
 * era a causa das dicas aparecendo longe do "?". No <body> o sistema de coordenadas é
 * sempre a viewport.
 *
 * Posição: calculada com getBoundingClientRect(). Prefere o lado pedido; se não couber,
 * troca (cima ↔ baixo). Horizontalmente centraliza na origem e é limitado às bordas da tela.
 * A seta acompanha a origem. Rolagens (inclusive dentro de painéis) reposicionam o popover.
 */

const MARGIN = 8;
const GAP = 8;
let current = null;
let seq = 0;

export const popoverId = () => `pop-${++seq}`;

function place(pop, anchor, prefer) {
  if (!anchor.isConnected) { hidePopover(true); return; }
  const r = anchor.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  // Origem fora da tela (rolou para longe): fecha em vez de flutuar solto.
  if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) { hidePopover(); return; }
  pop.style.maxWidth = `${Math.min(320, vw - MARGIN * 2)}px`;
  const w = pop.offsetWidth;
  const hgt = pop.offsetHeight;
  const above = r.top - MARGIN;
  const below = vh - r.bottom - MARGIN;
  let side = prefer;
  if (prefer === 'top' && above < hgt + GAP && below > above) side = 'bottom';
  if (prefer === 'bottom' && below < hgt + GAP && above > below) side = 'top';
  let top = side === 'top' ? r.top - GAP - hgt : r.bottom + GAP;
  top = Math.max(MARGIN, Math.min(top, vh - hgt - MARGIN));
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
  pop.dataset.side = side;
  const arrowX = Math.max(12, Math.min(r.left + r.width / 2 - left, w - 12));
  pop.style.setProperty('--arrow-x', `${Math.round(arrowX)}px`);
}

let raf = 0;
function reposition() {
  if (!current || raf) return;
  raf = requestAnimationFrame(() => { raf = 0; if (current) place(current.el, current.anchor, current.prefer); });
}

function onPointerDown(e) {
  if (!current) return;
  if (current.el.contains(e.target) || current.anchor.contains(e.target)) return;
  hidePopover();
}
function onKey(e) {
  if (e.key === 'Escape' && current) {
    e.stopPropagation();
    const { anchor, interactive } = current;
    hidePopover();
    if (interactive) anchor.focus({ preventScroll: true });
  }
}

/**
 * Mostra um popover ancorado.
 * content: string | Node · options: { side: 'top'|'bottom', role, id, interactive, className, onHide }
 */
export function showPopover(anchor, content, { side = 'top', role = 'tooltip', id = popoverId(), interactive = false, className = '', onHide } = {}) {
  if (current?.anchor === anchor && current.id === id) return current;
  hidePopover(true);
  const el = document.createElement('div');
  el.className = `pop ${interactive ? 'pop--menu' : ''} ${className}`.trim();
  el.id = id;
  el.setAttribute('role', role);
  if (typeof content === 'string') el.textContent = content; else el.append(content);
  const arrow = document.createElement('span');
  arrow.className = 'pop__arrow';
  arrow.setAttribute('aria-hidden', 'true');
  el.append(arrow);
  document.body.append(el);
  current = { el, anchor, prefer: side, id, interactive, onHide };
  place(el, anchor, side);
  requestAnimationFrame(() => el.classList.add('is-in'));
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
  return current;
}

export function hidePopover(immediate = false) {
  if (!current) return;
  const { el, onHide } = current;
  current = null;
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('scroll', reposition, true);
  window.removeEventListener('resize', reposition);
  if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) el.remove();
  else { el.classList.remove('is-in'); setTimeout(() => el.remove(), 140); }
  onHide?.();
}

export const popoverOpenFor = (anchor) => current?.anchor === anchor;

/**
 * Menu de ações ancorado (acessível por teclado).
 * build(close) → Node. O primeiro elemento focável recebe o foco.
 */
export function openMenu(anchor, build, { side = 'bottom', label = 'Ações' } = {}) {
  if (popoverOpenFor(anchor)) { hidePopover(); return; }
  const close = () => { hidePopover(); anchor.focus({ preventScroll: true }); };
  const node = build(close);
  const pop = showPopover(anchor, node, { side, role: 'dialog', interactive: true, className: 'pop--panel', onHide: () => anchor.setAttribute('aria-expanded', 'false') });
  pop.el.setAttribute('aria-label', label);
  anchor.setAttribute('aria-expanded', 'true');
  pop.el.addEventListener('keydown', (e) => { if (e.key === 'Tab' && !pop.el.contains(document.activeElement)) hidePopover(); });
  requestAnimationFrame(() => pop.el.querySelector('button, input, select, a[href]')?.focus({ preventScroll: true }));
  return pop;
}

/** Após uma re-renderização: fecha se a origem saiu da página; senão, reposiciona. */
export function syncPopover() {
  if (!current) return;
  if (!current.anchor.isConnected) hidePopover(true);
  else place(current.el, current.anchor, current.prefer);
}
