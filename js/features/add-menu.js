/** "+ Adicionar": um único ponto de entrada, com cada opção explicada. */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { activeGoals } from '../domain/goals.js';
import { openTaskForm } from './task-form.js';
import { openGoalForm } from './goal-form.js';
import { openCapture } from './capture.js';
import { openProgressLog } from './progress-log.js';

export function openAddMenu() {
  const hasGoals = activeGoals().length > 0;
  const choose = (fn) => { sheet.close(); setTimeout(fn, 60); };
  const sheet = openSheet({
    title: 'Adicionar',
    variant: 'dialog',
    focus: '.choice',
    render: () => h('div', { class: 'add-menu' },
      h('p', { class: 'add-menu__q' }, 'O que deseja adicionar?'),
      h('div', { class: 'choices' },
        choice('tasks', 'Tarefa', 'Algo que precisa ser feito.', () => choose(() => openTaskForm())),
        choice('target', 'Meta', 'Algo que deseja alcançar.', () => choose(() => openGoalForm())),
        choice('note', 'Anotação rápida', 'Algo que deseja tirar da cabeça.', () => choose(() => openCapture())),
        choice('trend', 'Registrar progresso', hasGoals ? 'Atualizar uma meta existente.' : 'Crie uma meta primeiro para registrar progresso.', () => choose(() => openProgressLog()), !hasGoals))),
  });
  return sheet;
}

function choice(ic, title, desc, onClick, disabled = false) {
  return h('button', { type: 'button', class: 'choice', onClick, disabled },
    h('span', { class: 'choice__icon', 'aria-hidden': 'true' }, icon(ic, { size: 20 })),
    h('span', { class: 'choice__text' }, h('span', { class: 'choice__title' }, title), h('span', { class: 'choice__desc' }, desc)),
    icon('chevronRight', { size: 18 }));
}
