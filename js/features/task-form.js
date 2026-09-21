/**
 * Criar tarefa: nome + prazo. Todo o resto fica em "Adicionar detalhes".
 * "Pagar internet" + Enter já salva.
 */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { chipGroup, button, field, runWithButton } from '../ui/components.js';
import { today } from '../utils/dates.js';
import { labelWithHelp, HELP } from '../ui/help.js';
import { createTask } from '../domain/tasks.js';
import { listAreas } from '../domain/areas.js';
import { toast, toastError } from '../ui/toast.js';
import { dueField, importanceField, estimateField, goalField } from './fields.js';
import { openTaskSheet } from './task-sheet.js';

export function openTaskForm(prefill = {}) {
  const d = {
    title: prefill.title || '', dueDate: prefill.dueDate || null, areaId: prefill.areaId || null,
    importance: 'normal', goalId: prefill.goalId || null, nextStep: !!prefill.nextStep, estimateMin: null, notes: '',
  };
  let details = !!(prefill.goalId || prefill.showDetails);
  const errors = {};
  let saving = false;

  const sheet = openSheet({
    title: prefill.goalId ? 'Próximo passo' : 'Nova tarefa',
    focus: '[data-key="tf-title"]',
    render: () => {
      const form = h('form', { class: 'task-form', novalidate: true, onSubmit: (e) => { e.preventDefault(); save(); } });
      add(form,
        h('div', { class: 'field' },
          labelWithHelp(prefill.goalId ? 'Qual é a próxima ação concreta?' : 'O que precisa ser feito?', HELP.tarefa, { tag: 'label', forId: 'tf-title' }),
          h('input', {
            id: 'tf-title', class: 'input input--lg', 'data-key': 'tf-title', value: d.title, maxlength: 300, autocomplete: 'off',
            placeholder: prefill.goalId ? 'Ex.: Separar R$ 600 neste mês' : 'Ex.: Pagar internet',
            'aria-invalid': errors.title ? 'true' : null, 'aria-describedby': errors.title ? 'tf-title-err' : null,
            onInput: (e) => { d.title = e.target.value; if (errors.title && d.title.trim()) { delete errors.title; e.target.removeAttribute('aria-invalid'); document.getElementById('tf-title-err')?.remove(); } },
          }),
          errors.title && h('p', { class: 'field-error', id: 'tf-title-err' }, errors.title)),
        h('div', null, dueField(d.dueDate, (v) => { d.dueDate = v; delete errors.due; }, { label: 'Tem prazo?' }),
          errors.due && h('p', { class: 'field-error' }, errors.due)));

      if (!details) {
        add(form, h('button', {
          type: 'button', class: 'disclosure', 'aria-expanded': 'false',
          onClick: () => { details = true; sheet.refresh(); },
        }, icon('plus', { size: 16 }), 'Adicionar detalhes', h('span', { class: 'muted' }, ' — área, importância, meta, duração, descrição')));
      } else {
        add(form, h('div', { class: 'details-block' },
          h('div', { class: 'field' }, labelWithHelp('Área', HELP.area),
            chipGroup(listAreas().map((a) => ({ value: a.id, label: a.name, color: a.color })), d.areaId, (v) => { d.areaId = v; }, { label: 'Área', allowNone: true, className: 'chips--areas' })),
          importanceField(d.importance, (v) => { d.importance = v; }),
          goalField(d.goalId, d.nextStep, (g, ns) => { d.goalId = g; d.nextStep = ns; }),
          estimateField(d.estimateMin, (v) => { d.estimateMin = v; }),
          field('Descrição (opcional)', h('textarea', { class: 'input', rows: 3, 'data-key': 'tf-notes', value: d.notes, placeholder: 'Detalhes, links, observações…', onInput: (e) => { d.notes = e.target.value; } }))));
      }
      add(form, h('div', { class: 'form-actions' },
        button('Cancelar', { variant: 'ghost', onClick: () => sheet.close() }),
        button('Adicionar tarefa', { variant: 'primary', type: 'submit', icon: 'check', attrs: { 'data-role': 'save' } })));
      return form;
    },
  });

  async function save() {
    if (saving) return;
    for (const k of Object.keys(errors)) delete errors[k];
    if (!d.title.trim()) errors.title = 'Escreva o que precisa ser feito. Ex.: “Pagar internet”.';
    if (d.dueDate && d.dueDate < today()) errors.due = 'Escolha hoje ou uma data futura.';
    if (Object.keys(errors).length) {
      sheet.refresh();
      requestAnimationFrame(() => sheet.panel.querySelector('[aria-invalid="true"], .field-error')?.scrollIntoView({ block: 'center' }));
      sheet.panel.querySelector('#tf-title')?.focus();
      return;
    }
    saving = true;
    const btn = sheet.panel.querySelector('[data-role="save"]');
    try {
      const t = await runWithButton(btn, () => createTask({ ...d, source: prefill.source || 'direct' }), { busy: 'Adicionando…' });
      sheet.close();
      toast(t.nextStep ? 'Próximo passo definido.' : 'Tarefa adicionada.', { action: { label: 'Ver', fn: () => openTaskSheet(t.id) } });
      prefill.onDone?.(t);
    } catch (err) { saving = false; toastError(err, { retry: save }); }
  }
  return sheet;
}

