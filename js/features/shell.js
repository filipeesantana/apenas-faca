/**
 * Estrutura fixa.
 * Desktop: barra lateral com "+ Adicionar" sempre visível.
 * Celular: barra superior + abas inferiores com "Adicionar" no centro (rótulo + ícone).
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { brandMark } from '../ui/components.js';
import { openSheet } from '../ui/sheet.js';
import { state } from '../core/store.js';
import { go } from '../core/router.js';
import { openInboxItems } from '../domain/inbox.js';
import { openAddMenu } from './add-menu.js';

const NAV = [
  { id: 'inicio', label: 'Início', icon: 'home' },
  { id: 'tarefas', label: 'Tarefas', icon: 'tasks' },
  { id: 'metas', label: 'Metas', icon: 'target' },
  { id: 'anotacoes', label: 'Anotações', icon: 'note' },
  { id: 'progresso', label: 'Progresso', icon: 'trend' },
  { id: 'analises', label: 'Análises', icon: 'lens' },
];
const FOOT = [
  { id: 'ajuda', label: 'Ajuda', icon: 'info' },
  { id: 'ajustes', label: 'Ajustes', icon: 'settings' },
];
const MORE = ['anotacoes', 'progresso', 'analises', 'ajuda', 'ajustes'];

function badge() { return h('span', { class: 'badge', 'data-badge': 'inbox', hidden: true }); }

function sideLink(item) {
  return h('a', { class: 'side-link', href: `#/${item.id}`, 'data-nav': item.id },
    icon(item.icon, { size: 19 }), h('span', { class: 'side-link__label' }, item.label), item.id === 'anotacoes' && badge());
}

export function buildShell() {
  document.getElementById('sidebar').replaceChildren(
    h('a', { class: 'brand', href: '#/inicio', 'aria-label': 'Norte — Início' }, brandMark()),
    h('button', { type: 'button', class: 'btn btn--accent btn--block add-btn', onClick: () => openAddMenu() },
      icon('plus'), h('span', null, 'Adicionar'), h('kbd', { class: 'kbd', 'aria-hidden': 'true' }, 'N')),
    h('nav', { class: 'side-nav', 'aria-label': 'Principal' }, h('ul', null, NAV.map((item) => h('li', null, sideLink(item))))),
    h('div', { class: 'sidebar__foot' },
      h('ul', null, FOOT.map((item) => h('li', null, sideLink(item)))),
      h('div', { class: 'demo-flag', 'data-demo': '', hidden: true }, icon('layers', { size: 14 }), 'Dados de exemplo')));

  document.getElementById('topbar').replaceChildren(
    h('a', { class: 'brand brand--sm', href: '#/inicio', 'aria-label': 'Norte — Início' }, brandMark()),
    h('div', { class: 'topbar__actions' },
      h('span', { class: 'demo-flag', 'data-demo': '', hidden: true }, 'exemplo'),
      h('a', { class: 'icon-btn', href: '#/ajuda', 'aria-label': 'Ajuda', title: 'Ajuda' }, icon('info', { size: 21 }))));

  const tab = (item) => h('li', null, h('a', { class: 'tab-link', href: `#/${item.id}`, 'data-nav': item.id },
    icon(item.icon, { size: 22 }), h('span', { class: 'tab-link__label' }, item.label)));
  const tabbar = document.getElementById('tabbar');
  tabbar.setAttribute('aria-label', 'Principal');
  tabbar.replaceChildren(h('ul', null,
    tab(NAV[0]), tab(NAV[1]),
    h('li', null, h('button', { type: 'button', class: 'tab-add', onClick: () => openAddMenu(), 'aria-haspopup': 'dialog' },
      h('span', { class: 'tab-add__circle', 'aria-hidden': 'true' }, icon('plus', { size: 24 })), h('span', { class: 'tab-link__label' }, 'Adicionar'))),
    tab(NAV[2]),
    h('li', null, h('button', { type: 'button', class: 'tab-link', 'data-nav': 'mais', 'aria-haspopup': 'dialog', onClick: openMore },
      icon('menu', { size: 22 }), h('span', { class: 'tab-link__label' }, 'Mais'), badge()))));
}

function openMore() {
  const sheet = openSheet({
    title: 'Mais',
    render: () => h('ul', { class: 'more-list' },
      [...NAV.slice(3), ...FOOT].map((item) => h('li', null,
        h('button', { type: 'button', class: 'more-link', onClick: () => { sheet.close(); go(item.id); } },
          icon(item.icon, { size: 20 }), h('span', null, item.label),
          item.id === 'anotacoes' && openInboxItems().length ? h('span', { class: 'badge' }, String(openInboxItems().length)) : null,
          icon('chevronRight', { size: 16 }))))),
  });
}

export function updateShell(route) {
  const name = route?.name === 'entrada' ? 'anotacoes' : route?.name;
  const active = name === 'area' ? 'tarefas' : name;
  document.querySelectorAll('[data-nav]').forEach((el) => {
    const on = el.dataset.nav === active || (el.dataset.nav === 'mais' && MORE.includes(active));
    if (el.tagName === 'A') { if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); }
    el.classList.toggle('is-active', on);
  });
  const n = openInboxItems().length;
  document.querySelectorAll('[data-badge="inbox"]').forEach((b) => {
    b.hidden = n === 0;
    b.textContent = n > 99 ? '99+' : String(n);
    b.setAttribute('aria-label', `${n} ${n === 1 ? 'anotação' : 'anotações'} esperando decisão`);
  });
  document.querySelectorAll('[data-demo]').forEach((el) => { el.hidden = !state.settings.demo; });
}
