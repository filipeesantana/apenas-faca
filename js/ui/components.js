/** Componentes visuais reutilizáveis. */
import { h, s } from './dom.js';
import { icon } from './icons.js';
import { getArea } from '../domain/areas.js';
import { clamp } from '../utils/helpers.js';

export function button(label, { variant = 'secondary', icon: ic, onClick, size, type = 'button', attrs = {} } = {}) {
  return h('button', { type, class: ['btn', `btn--${variant}`, size && `btn--${size}`], onClick, ...attrs },
    ic && icon(ic, { size: size === 'sm' ? 16 : 18 }), label && h('span', null, label));
}

export function linkButton(label, href, { variant = 'secondary', icon: ic, size } = {}) {
  return h('a', { href, class: ['btn', `btn--${variant}`, size && `btn--${size}`] }, ic && icon(ic, { size: 16 }), h('span', null, label));
}

export function iconButton(name, label, onClick, attrs = {}) {
  return h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onClick, ...attrs }, icon(name));
}

/** Marca: agulha discreta (norte) + nome + assinatura menor. */
export function logoMark(size = 22) {
  return s('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'logo', 'aria-hidden': 'true', focusable: 'false' },
    s('path', { d: 'M12 2.5 15.2 12H8.8z', class: 'logo__n' }),
    s('path', { d: 'M8.8 12h6.4L12 21.5z', class: 'logo__s' }));
}

export function brandMark({ signature = true } = {}) {
  return h('span', { class: 'brand-mark' }, logoMark(),
    h('span', { class: 'brand-mark__text' },
      h('span', { class: 'brand-mark__name' }, 'Norte'),
      signature && h('span', { class: 'brand-mark__sig' }, 'Apenas, faça.')));
}

export function areaTag(areaId, { link = false } = {}) {
  const a = getArea(areaId);
  if (!a) return null;
  return h(link ? 'a' : 'span', { class: 'area-tag', 'data-color': a.color, href: link ? `#/area/${a.id}` : null },
    h('span', { class: 'area-dot', 'aria-hidden': 'true' }), a.name);
}

const lastRatios = new Map();
/** Barra de progresso acessível; anima a partir do último valor mostrado. */
export function progressBar(ratio, { key, label = 'Progresso', size, tone } = {}) {
  const pct = clamp(Number(ratio) || 0, 0, 1) * 100;
  const fill = h('span', { class: 'bar__fill' });
  const prev = key ? (lastRatios.has(key) ? lastRatios.get(key) : 0) : pct;
  fill.style.width = `${prev}%`;
  if (key) lastRatios.set(key, pct);
  if (prev !== pct) requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct}%`; }));
  return h('div', {
    class: ['bar', size && `bar--${size}`, tone && `bar--${tone}`], role: 'progressbar',
    'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': label,
  }, fill);
}

export function emptyState({ icon: ic, title, text, actions = [], compact = false }) {
  return h('div', { class: ['empty', compact && 'empty--compact'] },
    ic && h('div', { class: 'empty__icon', 'aria-hidden': 'true' }, icon(ic, { size: 22 })),
    h('p', { class: 'empty__title' }, title),
    text && h('p', { class: 'empty__text' }, text),
    actions.length > 0 && h('div', { class: 'empty__actions' }, actions));
}

export function sectionHead(title, { count, action, id, level = 'h2' } = {}) {
  return h('div', { class: 'section-head' },
    h(level, { class: 'label', id }, title, count != null && h('span', { class: 'label__count' }, ` · ${count}`)),
    action);
}

export function pageHead(title, subtitle, actions) {
  return h('header', { class: 'page-head' },
    h('div', { class: 'page-head__text' },
      h('h1', { class: 'page-title' }, title),
      subtitle && h('p', { class: 'page-sub' }, subtitle)),
    actions && h('div', { class: 'page-head__actions' }, actions));
}

/**
 * Grupo de opções (chips). Gerencia o próprio estado visual, sem re-render global.
 * options: [{ value, label }]
 */
export function chipGroup(options, value, onChange, { label, allowNone = false, className } = {}) {
  let current = value;
  const group = h('div', { class: ['chips', className], role: 'group', 'aria-label': label });
  const buttons = options.map((opt) => {
    const b = h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(opt.value === current),
      'data-color': opt.color || null,
      onClick: () => {
        const next = allowNone && current === opt.value ? null : opt.value;
        current = next;
        for (const [i, other] of buttons.entries()) other.setAttribute('aria-pressed', String(options[i].value === current));
        onChange(next, opt);
      },
    }, opt.color && h('span', { class: 'area-dot', 'aria-hidden': 'true' }), opt.label);
    return b;
  });
  group.append(...buttons);
  return group;
}

/** Controle segmentado (navegação entre filtros/períodos). */
export function segmented(options, value, onChange, { label } = {}) {
  return h('div', { class: 'segmented', role: 'group', 'aria-label': label },
    options.map((opt) => h('button', {
      type: 'button', class: 'segmented__btn', 'aria-pressed': String(opt.value === value),
      onClick: () => onChange(opt.value),
    }, opt.label, opt.count != null && opt.count > 0 && h('span', { class: 'segmented__count' }, opt.count))));
}

export function field(labelText, control, { hint, id } = {}) {
  const controlId = id || control.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = controlId;
  return h('div', { class: 'field' },
    h('label', { class: 'field__label', for: controlId }, labelText),
    control,
    hint && h('p', { class: 'field__hint' }, hint));
}

export function toneLabel(tone) {
  return { attention: 'Atenção', watch: 'Para observar', info: 'Registro', good: 'Bom sinal' }[tone] || '';
}

/**
 * Executa uma ação assíncrona a partir de um botão, com estados coerentes:
 * impede clique duplo; mostra "Salvando…" só se demorar (>200 ms);
 * opcionalmente mostra "Salvo" por um instante. Falha → estado de erro breve.
 */
export async function runWithButton(btn, fn, { busy = 'Salvando…', done = null } = {}) {
  if (!btn || btn.getAttribute('aria-busy') === 'true') return undefined;
  const label = btn.querySelector('span');
  const original = label?.textContent;
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  const slow = setTimeout(() => { if (label) label.textContent = busy; }, 200);
  try {
    const result = await fn();
    clearTimeout(slow);
    if (done && btn.isConnected) {
      if (label) label.textContent = done;
      btn.classList.add('is-done');
      await new Promise((r) => setTimeout(r, 900));
      btn.classList.remove('is-done');
    }
    return result;
  } catch (err) {
    clearTimeout(slow);
    btn.classList.add('is-failed');
    setTimeout(() => btn.classList.remove('is-failed'), 1200);
    throw err;
  } finally {
    if (label && original != null) label.textContent = original;
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
  }
}
