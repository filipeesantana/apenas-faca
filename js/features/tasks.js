/** Página Tarefas: criação rapidíssima, grupos por prazo, filtros úteis. */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, chipGroup, segmented, emptyState, sectionHead, pageHead } from '../ui/components.js';
import { go } from '../core/router.js';
import { allTasks, openTasks, isOverdue, groupOpenTasks, createTask, DUE_PRESETS } from '../domain/tasks.js';
import { rankTasks } from '../domain/priority.js';
import { listAreas, getArea } from '../domain/areas.js';
import { endOfWeek, dayKey, daysAgoTs, formatDay, formatDayLong, distanceText, today, diffDays } from '../utils/dates.js';
import { toast, toastError } from '../ui/toast.js';
import { taskList } from './task-row.js';
import { openReview } from './review.js';
import { openTaskSheet } from './task-sheet.js';
import { capitalize } from '../utils/helpers.js';
import { labelWithHelp, HELP } from '../ui/help.js';
import { pickCopy } from '../content/microcopy.js';
import { openTaskForm } from './task-form.js';

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
  travadas: { label: 'Adiadas 2 vezes ou mais', test: (t) => (t.postponedCount || 0) >= 2 },
  'sem-prazo': { label: 'Sem prazo', test: (t) => !t.dueDate },
  importantes: { label: 'Alta importância', test: (t) => t.importance === 'high' },
  semana: { label: 'Prazo nesta semana', test: (t) => t.dueDate && t.dueDate <= endOfWeek() },
};

/** Rascunho da criação rápida (sobrevive a re-renderizações). */
const draft = { dueDate: null, dueId: null };

function buildHash(query) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString();
  return `tarefas${qs ? `?${qs}` : ''}`;
}

export function tasksView(route) {
  const q = route.query;
  const tab = ['concluidas', 'canceladas'].includes(q.ver) ? q.ver : 'abertas';
  const areaId = q.area && getArea(q.area) ? q.area : null;
  const special = SPECIAL[q.f] ? q.f : null;

  const open = openTasks();
  const view = h('div', { class: 'view view--tasks' },
    pageHead(labelWithHelp('Tarefas', HELP.tarefa, { className: '' }),
      `${open.length ? `${open.length} ${open.length === 1 ? 'aberta' : 'abertas'} · ` : ''}${pickCopy('tasks', [open.length >= 20 ? 'overloaded' : !open.length ? 'clear' : 'any'])}`,
      [open.length >= 5 && button('Revisar meu plano', { icon: 'refresh', onClick: () => openReview() }),
        button('Nova tarefa', { variant: 'primary', icon: 'plus', onClick: () => openTaskForm({ areaId }) })]),
    quickAdd(areaId));

  add(view, h('div', { class: 'toolbar' },
    segmented([
      { value: 'abertas', label: 'Abertas' },
      { value: 'concluidas', label: 'Concluídas' },
      { value: 'canceladas', label: 'Canceladas' },
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
  const readout = h('span', { class: 'quick-add__readout' });
  const paint = () => readout.replaceChildren(draft.dueDate ? `${capitalize(formatDayLong(draft.dueDate))} · ${distanceText(draft.dueDate)}` : '');
  const input = h('input', {
    class: 'quick-add__input', 'data-key': 'quick-add', placeholder: 'Adicionar tarefa… Ex.: Pagar internet', maxlength: 300,
    'aria-label': 'Nome da nova tarefa', autocomplete: 'off',
    onInput: (e) => form.classList.toggle('has-text', !!e.target.value.trim()),
    onKeydown: (e) => { if (e.key === 'Escape') { e.target.value = ''; form.classList.remove('has-text'); } },
  });
  const dateInput = h('input', {
    type: 'date', class: 'input input--date', 'aria-label': 'Escolher data', min: today(),
    value: draft.dueId === 'custom' ? draft.dueDate : '',
    onChange: (e) => { draft.dueDate = e.target.value || null; draft.dueId = e.target.value ? 'custom' : null; dueChips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); paint(); },
  });
  const dueChips = chipGroup(DUE_PRESETS.map((p) => ({ value: p.id, label: p.label })), draft.dueId === 'custom' ? null : draft.dueId, (v) => {
    draft.dueId = v;
    draft.dueDate = v ? DUE_PRESETS.find((p) => p.id === v).date() : null;
    dateInput.value = '';
    paint();
  }, { label: 'Prazo', allowNone: true });
  paint();

  const form = h('form', {
    class: ['quick-add', draft.dueDate && 'has-text'],
    onSubmit: async (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      input.value = '';
      form.classList.remove('has-text');
      const payload = { title, dueDate: draft.dueDate, areaId };
      Object.assign(draft, { dueDate: null, dueId: null });
      try {
        const t = await createTask(payload);
        toast('Tarefa adicionada.', { action: { label: 'Detalhes', fn: () => openTaskSheet(t.id) } });
      } catch (err) { toastError(err); }
    },
  },
  h('div', { class: 'quick-add__row' },
    h('span', { class: 'quick-add__icon', 'aria-hidden': 'true' }, icon('plus')),
    input,
    button('Adicionar', { variant: 'primary', type: 'submit', size: 'sm' })),
  h('div', { class: 'quick-add__extras' },
    h('span', { class: 'quick-add__hint' }, 'Prazo (opcional):'), dueChips, dateInput, readout,
    button('Adicionar detalhes', {
      variant: 'ghost', size: 'sm', icon: 'plus',
      onClick: () => { const title = input.value; input.value = ''; form.classList.remove('has-text'); openTaskForm({ title, dueDate: draft.dueDate, areaId, showDetails: true }); },
    })));
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
      title: allTasks().length ? 'Nada pendente por aqui.' : 'Nenhuma tarefa ainda.',
      text: pickCopy('emptyTasks'),
      actions: [button('Adicionar tarefa', { variant: 'primary', icon: 'plus', onClick: () => openTaskForm() })],
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
      title: status === 'done' ? 'Nenhuma tarefa concluída nos últimos 60 dias.' : 'Nenhuma tarefa cancelada.',
      text: status === 'done' ? 'Quando você concluir algo, aparece aqui.' : 'Quando uma tarefa perde o sentido, use “Cancelar tarefa”. Ela vem para cá, e o histórico fica registrado.',
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
