/** Página de uma área: tarefas, metas e atividade relacionadas. */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, emptyState, sectionHead, pageHead } from '../ui/components.js';
import { state } from '../core/store.js';
import { lastActivityByArea } from '../core/events.js';
import { go } from '../core/router.js';
import { getArea } from '../domain/areas.js';
import { openTasks, createTask } from '../domain/tasks.js';
import { rankTasks } from '../domain/priority.js';
import { relativeTime, daysAgoTs } from '../utils/dates.js';
import { plural } from '../utils/numbers.js';
import { toastError, toast } from '../ui/toast.js';
import { taskList } from './task-row.js';
import { goalRow } from './goals.js';

export function areaView(route) {
  const area = getArea(route.param);
  if (!area) return h('div', { class: 'view' }, emptyState({ icon: 'info', title: 'Área não encontrada.', actions: [button('Voltar ao início', { onClick: () => go('inicio') })] }));

  const last = lastActivityByArea().get(area.id);
  const tasks = rankTasks(openTasks().filter((t) => t.areaId === area.id)).map((r) => r.task);
  const goals = [...state.goals.values()].filter((g) => g.areaId === area.id && g.status === 'active');
  const done30 = new Set(state.events.filter((e) => e.type === 'task.completed' && e.areaId === area.id && e.createdAt >= daysAgoTs(29)).map((e) => e.entityId)).size;

  const input = h('input', { class: 'input', 'data-key': `area-add-${area.id}`, placeholder: `Nova tarefa em ${area.name}`, 'aria-label': `Nova tarefa em ${area.name}`, maxlength: 300 });
  return h('div', { class: 'view view--area' },
    h('button', { type: 'button', class: 'back-link', onClick: () => (history.length > 1 ? history.back() : go('inicio')) }, icon('chevronLeft', { size: 16 }), 'Voltar'),
    pageHead(h('span', { class: 'area-title', 'data-color': area.color }, h('span', { class: 'area-dot area-dot--lg', 'aria-hidden': 'true' }), area.name),
      last ? `Última atividade ${relativeTime(last)} · ${plural(done30, 'tarefa concluída', 'tarefas concluídas')} em 30 dias` : 'Sem atividade registrada ainda.'),
    h('section', { class: 'section' },
      sectionHead('Tarefas abertas', { count: tasks.length }),
      tasks.length ? taskList(tasks, { showArea: false }) : h('p', { class: 'muted' }, 'Nenhuma tarefa aberta nesta área.'),
      h('form', {
        class: 'inline-form inline-form--row',
        onSubmit: async (e) => {
          e.preventDefault();
          const title = input.value.trim();
          if (!title) return;
          input.value = '';
          try { await createTask({ title, areaId: area.id }); toast('Tarefa criada.'); } catch (err) { toastError(err); }
        },
      }, input, button('Adicionar', { type: 'submit', icon: 'plus' }))),
    h('section', { class: 'section' },
      sectionHead('Metas', { count: goals.length }),
      goals.length ? h('ul', { class: 'goal-list' }, goals.map((g) => h('li', null, goalRow(g)))) : h('p', { class: 'muted' }, 'Nenhuma meta ativa nesta área.')));
}
