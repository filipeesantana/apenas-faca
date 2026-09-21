/** Estrutura fixa: barra lateral (desktop), barra superior e barra de abas (celular). */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { brandMark } from '../ui/components.js';
import { openSheet } from '../ui/sheet.js';
import { state } from '../core/store.js';
import { go } from '../core/router.js';
import { openInboxItems } from '../domain/inbox.js';
import { openCapture } from './capture.js';

const NAV = [
  { id: 'inicio', label: 'Início', icon: 'home' },
  { id: 'entrada', label: 'Caixa de entrada', short: 'Entrada', icon: 'inbox' },
  { id: 'tarefas', label: 'Tarefas', icon: 'tasks' },
  { id: 'metas', label: 'Metas', icon: 'target' },
  { id: 'progresso', label: 'Progresso', icon: 'trend' },
  { id: 'analises', label: 'Análises', icon: 'lens' },
];
const MORE = ['progresso', 'analises', 'ajustes'];

function navLink(item, kind) {
  const isSide = kind === 'side';
  return h('a', { class: isSide ? 'side-link' : 'tab-link', href: `#/${item.id}`, 'data-nav': item.id },
    icon(item.icon, { size: isSide ? 18 : 22 }),
    h('span', { class: isSide ? 'side-link__label' : 'tab-link__label' }, !isSide && item.short ? item.short : item.label),
    item.id === 'entrada' && h('span', { class: 'badge', 'data-badge': 'inbox', hidden: true }));
}

export function buildShell() {
  document.getElementById('sidebar').replaceChildren(
    h('a', { class: 'brand', href: '#/inicio', 'aria-label': 'Apenas, Faça. — Início' }, brandMark()),
    h('button', { type: 'button', class: 'btn btn--primary btn--block capture-btn', onClick: () => openCapture() },
      icon('plus'), h('span', null, 'Tirar da cabeça'), h('kbd', { class: 'kbd', 'aria-hidden': 'true' }, 'N')),
    h('nav', { class: 'side-nav', 'aria-label': 'Principal' }, h('ul', null, NAV.map((item) => h('li', null, navLink(item, 'side'))))),
    h('div', { class: 'sidebar__foot' },
      navLink({ id: 'ajustes', label: 'Ajustes', icon: 'settings' }, 'side'),
      h('div', { class: 'demo-flag', 'data-demo': '', hidden: true }, icon('layers', { size: 14 }), 'Dados de exemplo')));

  document.getElementById('topbar').replaceChildren(
    h('a', { class: 'brand brand--sm', href: '#/inicio', 'aria-label': 'Apenas, Faça. — Início' }, brandMark()),
    h('div', { class: 'topbar__actions' },
      h('span', { class: 'demo-flag', 'data-demo': '', hidden: true }, 'exemplo'),
      h('button', { type: 'button', class: 'icon-btn icon-btn--accent', 'aria-label': 'Tirar algo da cabeça', onClick: () => openCapture() }, icon('plus', { size: 22 }))));

  const tabs = h('ul', null,
    NAV.slice(0, 4).map((item) => h('li', null, navLink(item, 'tab'))),
    h('li', null, h('button', { type: 'button', class: 'tab-link', 'data-nav': 'mais', 'aria-haspopup': 'dialog', onClick: openMore },
      icon('menu', { size: 22 }), h('span', { class: 'tab-link__label' }, 'Mais'))));
  const tabbar = document.getElementById('tabbar');
  tabbar.setAttribute('aria-label', 'Principal');
  tabbar.replaceChildren(tabs);
}

function openMore() {
  const sheet = openSheet({
    title: 'Mais',
    variant: 'side',
    render: () => h('ul', { class: 'more-list' },
      [...NAV.slice(4), { id: 'ajustes', label: 'Ajustes', icon: 'settings' }].map((item) => h('li', null,
        h('button', { type: 'button', class: 'more-link', onClick: () => { sheet.close(); go(item.id); } },
          icon(item.icon, { size: 20 }), h('span', null, item.label), icon('chevronRight', { size: 16 }))))),
  });
}

export function updateShell(route) {
  const name = route?.name;
  const active = name === 'area' ? 'tarefas' : name;
  document.querySelectorAll('[data-nav]').forEach((el) => {
    const on = el.dataset.nav === active || (el.dataset.nav === 'mais' && MORE.includes(active));
    if (el.tagName === 'A') {
      if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    }
    el.classList.toggle('is-active', on);
  });
  const n = openInboxItems().length;
  document.querySelectorAll('[data-badge="inbox"]').forEach((b) => {
    b.hidden = n === 0;
    b.textContent = n > 99 ? '99+' : String(n);
    b.setAttribute('aria-label', `${n} ${n === 1 ? 'item' : 'itens'}`);
  });
  document.querySelectorAll('[data-demo]').forEach((el) => { el.hidden = !state.settings.demo; });
}
