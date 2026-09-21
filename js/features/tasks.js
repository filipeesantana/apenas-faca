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
  hoje: { label: 'Para hoje', test: (t) => t.dueDate === today() },
  semana: { label: 'Esta semana', test: (t) => !!t.dueDate && t.dueDate >= today() && t.dueDate <= endOfWeek() },
  'sem-prazo': { label: 'Sem prazo', test: (t) => !t.dueDate },
  importantes: { label: 'Alta importância', test: (t) => t.importance === 'high' },
  travadas: { label: 'Adiadas 2+ vezes', test: (t) => (t.postponedCount || 0) >= 2 },
  metas: { label: 'Ligadas a metas', test: (t) => !!t.goalId },
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

  const doneCount = allTasks().filter((t) => t.status === 'done' && t.completedAt >= daysAgoTs(59)).length;
  const droppedCount = allTasks().filter((t) => t.status === 'dropped' && t.droppedAt >= daysAgoTs(59)).length;
  add(view, h('div', { class: 'toolbar' },
    segmented([
      { value: 'abertas', label: 'Abertas', count: open.length },
      { value: 'concluidas', label: 'Concluídas', count: doneCount },
      { value: 'canceladas', label: 'Canceladas', count: droppedCount },
    ], tab, (v) => go(buildHash({ ...q, ver: v === 'abertas' ? null : v, f: null })), { label: 'Mostrar' }),
    areaFilter(q, areaId)));

  if (tab === 'abertas' && open.length) {
    const base = areaId ? open.filter((t) => t.areaId === areaId) : open;
    add(view, h('div', { class: 'filter-chips', role: 'group', 'aria-label': 'Filtros rápidos' },
      Object.entries(SPECIAL).map(([id, f]) => {
        const n = base.filter(f.test).length;
        if (!n && special !== id) return null;
        return h('button', {
          type: 'button', class: 'chip chip--sm', 'aria-pressed': String(special === id),
          onClick: () => go(buildHash({ ...q, f: special === id ? null : id })),
        }, f.label, h('span', { class: 'chip__count' }, n));
      })));
  }

  if (tab === 'abertas' && (special || areaId)) {
    let n = open;
    if (areaId) n = n.filter((t) => t.areaId === areaId);
    if (special) n = n.filter(SPECIAL[special].test);
    add(view, h('div', { class: 'active-filters', role: 'status' },
      h('strong', null, n.length === 1 ? '1 resultado' : `${n.length} resultados`),
      special && h('button', { type: 'button', class: 'filter-tag', 'aria-label': `Remover filtro ${SPECIAL[special].label}`, onClick: () => go(buildHash({ ...q, f: null })) }, SPECIAL[special].label, icon('x', { size: 13 })),
      areaId && h('button', { type: 'button', class: 'filter-tag', 'aria-label': `Remover filtro ${getArea(areaId).name}`, onClick: () => go(buildHash({ ...q, area: null })) }, getArea(areaId).name, icon('x', { size: 13 })),
      special && areaId && h('button', { type: 'button', class: 'link-btn', onClick: () => go('tarefas') }, 'Limpar filtros')));
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
