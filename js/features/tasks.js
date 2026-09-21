/** Página Tarefas: criação rapidíssima, grupos por prazo, filtros úteis. */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, chipGroup, segmented, emptyState, sectionHead, pageHead } from '../ui/components.js';
import { go } from '../core/router.js';
import { allTasks, openTasks, isOverdue, groupOpenTasks, createTask, DUE_PRESETS } from '../domain/tasks.js';
import { rankTasks } from '../domain/priority.js';
import { listAreas, getArea } from '../domain/areas.js';
import { dayKey, daysAgoTs, formatDay, today, diffDays } from '../utils/dates.js';
import { toast, toastError } from '../ui/toast.js';
import { taskList } from './task-row.js';
import { openReview } from './review.js';
import { openTaskSheet } from './task-sheet.js';
import { capitalize } from '../utils/helpers.js';

const GROUPS = [
  ['doing', 'Em andamento'],
  ['overdue', 'Atrasadas'],
  ['today', 'Hoje'],
  ['soon', 'Próximos 7 dias'],
  ['later', 'Mais adiante'],
  ['none', 'Sem prazo'],
];

const SPECIAL = {
  atrasadas: { label: 'Atrasadas', test: (t) => isOverdue(t) },
  travadas: { label: 'Adiadas 3 vezes ou mais', test: (t) => (t.postponedCount || 0) >= 3 },
  'sem-prazo': { label: 'Sem prazo', test: (t) => !t.dueDate },
  importantes: { label: 'Importantes', test: (t) => t.importance === 'high' },
};

/** Rascunho da criação rápida (sobrevive a re-renderizações). */
const draft = { dueDate: null, dueId: null, areaId: null, importance: 'normal' };

function buildHash(query) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString();
  return `tarefas${qs ? `?${qs}` : ''}`;
}

export function tasksView(route) {
  const q = route.query;
  const tab = ['concluidas', 'deixadas'].includes(q.ver) ? q.ver : 'abertas';
  const areaId = q.area && getArea(q.area) ? q.area : null;
  const special = SPECIAL[q.f] ? q.f : null;

  const open = openTasks();
  const view = h('div', { class: 'view view--tasks' },
    pageHead('Tarefas', open.length ? `${open.length} ${open.length === 1 ? 'aberta' : 'abertas'}` : 'Coisas que você precisa fazer.',
      open.length >= 8 && button('Revisar lista', { icon: 'refresh', onClick: () => openReview() })),
    quickAdd(areaId));

  add(view, h('div', { class: 'toolbar' },
    segmented([
      { value: 'abertas', label: 'Abertas' },
      { value: 'concluidas', label: 'Concluídas' },
      { value: 'deixadas', label: 'Deixadas de lado' },
    ], tab, (v) => go(buildHash({ ...q, ver: v === 'abertas' ? null : v, f: null })), { label: 'Mostrar' }),
    areaFilter(q, areaId)));

  if (special && tab === 'abertas') {
    add(view, h('div', { class: 'filter-banner' },
      h('span', null, 'Mostrando: ', h('strong', null, SPECIAL[special].label)),
      button('Limpar filtro', { variant: 'ghost', size: 'sm', icon: 'x', onClick: () => go(buildHash({ ...q, f: null })) })));
  }

  if (tab === 'abertas') add(view, openList(open, { areaId, special }));
  else add(view, closedList(tab, areaId));
  return view;
}

function areaFilter(q, areaId) {
  const areas = listAreas();
  if (!areas.length) return null;
  const select = h('select', {
    class: 'input input--select', 'aria-label': 'Filtrar por área',
    onChange: (e) => go(buildHash({ ...q, area: e.target.value || null })),
  }, h('option', { value: '' }, 'Todas as áreas'), areas.map((a) => h('option', { value: a.id, selected: a.id === areaId }, a.name)));
  return select;
}

function quickAdd(areaId) {
  if (areaId && draft.areaId == null) draft.areaId = areaId;
  const input = h('input', {
    class: 'quick-add__input', 'data-key': 'quick-add', placeholder: 'Adicionar tarefa… (ex.: Estudar Python)', maxlength: 300,
    'aria-label': 'Nova tarefa', autocomplete: 'off',
    onInput: (e) => form.classList.toggle('has-text', !!e.target.value.trim()),
    onKeydown: (e) => { if (e.key === 'Escape') { e.target.value = ''; form.classList.remove('has-text'); } },
  });
  const dateInput = h('input', {
    type: 'date', class: 'input input--date', 'aria-label': 'Escolher data', min: today(),
    value: draft.dueId === 'custom' ? draft.dueDate : '',
    onChange: (e) => { draft.dueDate = e.target.value || null; draft.dueId = e.target.value ? 'custom' : null; dueChips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); },
  });
  const dueChips = chipGroup(DUE_PRESETS.map((p) => ({ value: p.id, label: p.label })), draft.dueId === 'custom' ? null : draft.dueId, (v) => {
    draft.dueId = v;
    draft.dueDate = v ? DUE_PRESETS.find((p) => p.id === v).date() : null;
    dateInput.value = '';
  }, { label: 'Prazo', allowNone: true });

  const form = h('form', {
    class: ['quick-add', (draft.dueDate || draft.importance === 'high') && 'has-text'],
    onSubmit: async (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      input.value = '';
      form.classList.remove('has-text');
      const payload = { title, dueDate: draft.dueDate, areaId: draft.areaId, importance: draft.importance };
      Object.assign(draft, { dueDate: null, dueId: null, importance: 'normal', areaId: areaId || null });
      try {
        const t = await createTask(payload);
        toast(`Tarefa criada${t.dueDate ? '' : ' — sem prazo, e tudo bem'}.`, { action: { label: 'Detalhes', fn: () => openTaskSheet(t.id) } });
      } catch (err) { toastError(err); }
    },
  },
  h('div', { class: 'quick-add__row' },
    h('span', { class: 'quick-add__icon', 'aria-hidden': 'true' }, icon('plus')),
    input,
    button('Adicionar', { variant: 'primary', type: 'submit', size: 'sm' })),
  h('div', { class: 'quick-add__extras' },
    h('span', { class: 'quick-add__hint' }, 'Opcional:'),
    dueChips, dateInput,
    h('label', { class: 'toggle-chip' },
      h('input', { type: 'checkbox', checked: draft.importance === 'high', onChange: (e) => { draft.importance = e.target.checked ? 'high' : 'normal'; } }),
      h('span', null, icon('flag', { size: 14 }), 'Importante')),
    h('select', {
      class: 'input input--select input--sm', 'aria-label': 'Área',
      onChange: (e) => { draft.areaId = e.target.value || null; },
    }, h('option', { value: '' }, 'Sem área'), listAreas().map((a) => h('option', { value: a.id, selected: a.id === draft.areaId }, a.name)))));
  return form;
}

function openList(open, { areaId, special }) {
  let tasks = open;
  if (areaId) tasks = tasks.filter((t) => t.areaId === areaId);
  if (special) tasks = tasks.filter(SPECIAL[special].test);

  if (!tasks.length) {
    if (special || areaId) {
      return emptyState({ icon: 'check', title: 'Nada por aqui com esse filtro.', compact: true, actions: [button('Ver todas', { onClick: () => go('tarefas') })] });
    }
    return emptyState({
      icon: 'check',
      title: allTasks().length ? 'Nada pendente por aqui.' : 'Sua lista está vazia.',
      text: 'Se alguma coisa está ocupando sua cabeça, coloque na caixa de entrada — ou escreva uma tarefa acima.',
      actions: [button('Tirar algo da cabeça', { variant: 'primary', icon: 'inbox', onClick: () => go('entrada') })],
    });
  }

  const order = new Map(rankTasks(tasks).map((r, i) => [r.task.id, i]));
  const groups = groupOpenTasks(tasks);
  const wrap = h('div', { class: 'task-groups' });
  for (const [key, label] of GROUPS) {
    const list = groups[key];
    if (!list.length) continue;
    list.sort((a, b) => (key === 'soon' || key === 'later' ? a.dueDate.localeCompare(b.dueDate) : 0) || order.get(a.id) - order.get(b.id));
    add(wrap, h('section', { class: ['task-group', `task-group--${key}`], 'aria-labelledby': `g-${key}` },
      sectionHead(label, { count: list.length, id: `g-${key}` }),
      taskList(list, { showArea: !areaId })));
  }
  return wrap;
}

function closedList(tab, areaId) {
  const status = tab === 'concluidas' ? 'done' : 'dropped';
  const field = status === 'done' ? 'completedAt' : 'droppedAt';
  const since = daysAgoTs(59);
  let tasks = allTasks().filter((t) => t.status === status && t[field] >= since);
  if (areaId) tasks = tasks.filter((t) => t.areaId === areaId);
  tasks.sort((a, b) => b[field] - a[field]);
  if (!tasks.length) {
    return emptyState({
      icon: status === 'done' ? 'check' : 'ban',
      title: status === 'done' ? 'Nenhuma tarefa concluída nos últimos 60 dias.' : 'Nada foi deixado de lado.',
      text: status === 'done' ? 'Quando você concluir algo, aparece aqui.' : 'Quando uma tarefa perde o sentido, dá para escolher “Não vou fazer”. Ela vem para cá.',
      compact: true,
    });
  }
  const byDay = new Map();
  for (const t of tasks) {
    const k = dayKey(t[field]);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(t);
  }
  const ref = today();
  return h('div', { class: 'task-groups' }, [...byDay.entries()].map(([day, list]) => {
    const d = diffDays(day, ref);
    const label = d === 0 ? 'Hoje' : d === 1 ? 'Ontem' : capitalize(formatDay(day));
    return h('section', { class: 'task-group' }, sectionHead(label, { count: list.length }), taskList(list, { showArea: !areaId }));
  }), h('p', { class: 'muted small center' }, 'Mostrando os últimos 60 dias.'));
}
