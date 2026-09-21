/**
 * Norte — ponto de entrada.
 * Inicializa o banco, monta a estrutura e renderiza a tela da rota atual.
 * Qualquer mudança nos dados re-renderiza a tela atual (preservando foco e digitação).
 */
import { load, subscribe, state } from './core/store.js';
import { parseHash, onRoute, go } from './core/router.js';
import { swap, h } from './ui/dom.js';
import { hidePopover, syncPopover } from './ui/popover.js';
import { isEditable } from './utils/helpers.js';
import { ensureInitialized } from './domain/areas.js';
import { buildShell, updateShell } from './features/shell.js';
import { homeView } from './features/home.js';
import { inboxView } from './features/inbox.js';
import { tasksView } from './features/tasks.js';
import { goalsView, goalDetailView } from './features/goals.js';
import { progressView } from './features/progress.js';
import { analyticsView } from './features/analytics.js';
import { areaView } from './features/area.js';
import { settingsView, applyTheme } from './features/settings.js';
import { openAddMenu } from './features/add-menu.js';
import { helpView } from './features/help.js';
import { openOrganizer } from './features/inbox-organizer.js';
import { openReview } from './features/review.js';

const VIEWS = {
  inicio: { render: homeView, title: 'Início' },
  anotacoes: { render: inboxView, title: 'Anotações' },
  entrada: { render: inboxView, title: 'Anotações' },
  ajuda: { render: helpView, title: 'Ajuda' },
  tarefas: { render: tasksView, title: 'Tarefas' },
  metas: { render: (r) => (r.param ? goalDetailView(r) : goalsView(r)), title: 'Metas' },
  progresso: { render: progressView, title: 'Progresso' },
  analises: { render: analyticsView, title: 'Análises' },
  area: { render: areaView, title: 'Área' },
  ajustes: { render: settingsView, title: 'Ajustes' },
};

const main = document.getElementById('main');
let current = parseHash();
let lastScreen = null;

/**
 * Várias mudanças de dados no mesmo instante (ex.: concluir + registrar evento)
 * viram UMA renderização no próximo quadro.
 */
let pending = 0;
function scheduleRender() {
  if (pending) return;
  pending = requestAnimationFrame(() => { pending = 0; render(current, false); });
}

function render(route, isNavigation) {
  if (pending) { cancelAnimationFrame(pending); pending = 0; }
  const view = VIEWS[route.name];
  if (!view) { go('inicio'); return; }
  current = route;
  let node;
  try {
    node = view.render(route);
  } catch (err) {
    console.error(err);
    node = h('div', { class: 'view' }, h('div', { class: 'empty' },
      h('p', { class: 'empty__title' }, 'Esta tela encontrou um problema.'),
      h('p', { class: 'empty__text' }, 'Seus dados estão salvos. Tente voltar ao início ou recarregar a página.'),
      h('a', { class: 'btn btn--secondary', href: '#/inicio' }, 'Voltar ao início')));
  }
  // Mudar só filtros/período (mesma tela) atualiza no lugar: sem voltar ao topo e sem animação de entrada.
  const screen = `${route.name}/${route.param || ''}`;
  const sameScreen = screen === lastScreen;
  lastScreen = screen;
  if (isNavigation) hidePopover(true);
  swap(main, node);
  updateShell(route);
  syncPopover();
  if (isNavigation) {
    document.title = `${view.title} · Norte`;
    if (!sameScreen) {
      main.classList.remove('view-enter');
      void main.offsetWidth;
      main.classList.add('view-enter');
      window.scrollTo({ top: 0 });
    }
    handleIntents(route);
  }
}

/** Parâmetros que disparam ações (ex.: #/entrada?organizar=1) — executados uma vez. */
function handleIntents(route) {
  if ((route.name === 'anotacoes' || route.name === 'entrada') && route.query.organizar) {
    history.replaceState(null, '', '#/anotacoes');
    openOrganizer();
  }
  if (route.name === 'tarefas' && route.query.revisar) {
    history.replaceState(null, '', '#/tarefas');
    openReview();
  }
  if (route.name === 'metas' && route.param && route.query.ver === 'plano') {
    requestAnimationFrame(() => document.getElementById('plano')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
}

function bindShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isEditable(document.activeElement) || document.body.classList.contains('has-sheet')) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openAddMenu(); }
  });
}

function renderFatal(err) {
  console.error(err);
  document.getElementById('app').replaceChildren(h('div', { class: 'fatal' },
    h('h1', null, 'Não foi possível abrir seus dados.'),
    h('p', null, 'O armazenamento local do navegador não respondeu.'),
    h('p', { class: 'muted' }, 'Isso costuma acontecer em janelas anônimas de alguns navegadores ou quando o armazenamento está bloqueado. Tente uma janela normal, feche outras abas do aplicativo e recarregue.'),
    h('button', { class: 'btn btn--primary', onClick: () => location.reload() }, 'Recarregar')));
}

async function boot() {
  try {
    await load();
    await ensureInitialized();
  } catch (err) {
    renderFatal(err);
    return;
  }
  applyTheme(state.settings.theme);
  buildShell();
  onRoute((route) => render(route, true));
  subscribe(scheduleRender);
  window.addEventListener('app:rerender', scheduleRender);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(state.settings.theme));
  bindShortcuts();
  render(parseHash(), true);
  document.documentElement.classList.add('is-ready');
  navigator.storage?.persist?.().catch(() => {});
}

boot();
