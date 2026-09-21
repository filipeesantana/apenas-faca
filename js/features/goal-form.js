/**
 * Criar/editar meta de forma progressiva:
 * 1. O que você quer alcançar? → 2. Como vai saber que chegou lá? → 3. números → 4. quando (opcional).
 */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { chipGroup, button, field } from '../ui/components.js';
import { state } from '../core/store.js';
import { createGoal, updateGoal } from '../domain/goals.js';
import { inboxToGoalChange } from '../domain/inbox.js';
import { listAreas } from '../domain/areas.js';
import { parseMoney, parseNumber, formatMoney, formatCount } from '../utils/numbers.js';
import { today } from '../utils/dates.js';
import { toast, toastError } from '../ui/toast.js';
import { go } from '../core/router.js';

const TYPES = [
  { value: 'money', title: 'Juntar um valor', desc: 'Ex.: R$ 40.000 para um carro', icon: 'coins' },
  { value: 'count', title: 'Completar uma quantidade', desc: 'Ex.: 40 aulas, 12 livros', icon: 'layers' },
  { value: 'steps', title: 'Cumprir etapas', desc: 'Ex.: tirar a habilitação', icon: 'steps' },
];

export function openGoalForm({ title = '', goalId = null, fromInboxId = null, onDone } = {}) {
  const editing = goalId ? state.goals.get(goalId) : null;
  const d = editing
    ? {
      title: editing.title, type: editing.type,
      target: editing.type === 'money' ? formatMoney(editing.targetValue).replace(/R\$\s?/, '') : editing.type === 'count' ? formatCount(editing.targetValue) : '',
      current: '', unit: editing.unit || '', steps: [], targetDate: editing.targetDate || '', areaId: editing.areaId,
    }
    : { title, type: null, target: '', current: '', unit: '', steps: [''], targetDate: '', areaId: null };
  let error = '';
  let saving = false;

  const sheet = openSheet({
    title: editing ? 'Editar meta' : 'Nova meta',
    focus: editing ? null : '[data-key="goal-title"]',
    render: () => {
      const form = h('form', { class: 'goal-form', novalidate: true, onSubmit: (e) => { e.preventDefault(); save(); } });

      add(form, field('O que você quer alcançar?', h('input', {
        class: 'input input--lg', 'data-key': 'goal-title', value: d.title, maxlength: 200, placeholder: 'Ex.: Comprar um carro',
        onInput: (e) => { const had = !!d.title.trim(); d.title = e.target.value; if (had !== !!d.title.trim()) sheet.refresh(); },
      })));

      if (d.title.trim() || editing) {
        add(form, h('fieldset', { class: 'fieldset' },
          h('legend', { class: 'field__label' }, 'Como você vai saber que chegou lá?'),
          h('div', { class: 'type-cards' }, TYPES.map((t) => h('button', {
            type: 'button', class: 'type-card', 'aria-pressed': String(d.type === t.value), disabled: !!editing && d.type !== t.value,
            onClick: () => { d.type = t.value; error = ''; sheet.refresh(); },
          }, h('span', { class: 'type-card__icon', 'aria-hidden': 'true' }, icon(t.icon, { size: 20 })),
          h('span', { class: 'type-card__title' }, t.title), h('span', { class: 'type-card__desc' }, t.desc)))),
          editing && h('p', { class: 'hint' }, 'O tipo não muda depois de criada. Para outro tipo, crie uma nova meta.')));
      }

      if (d.type === 'money') {
        add(form, h('div', { class: 'grid-2' },
          field('Quanto você quer juntar?', moneyInput('goal-target', d.target, (v) => { d.target = v; })),
          !editing && field('Quanto já tem?', moneyInput('goal-current', d.current, (v) => { d.current = v; }), { hint: 'Opcional. Pode ser zero.' })));
      } else if (d.type === 'count') {
        add(form, h('div', { class: 'grid-2' },
          field('Quantos?', h('input', { class: 'input', inputmode: 'decimal', 'data-key': 'goal-target', value: d.target, placeholder: '40', onInput: (e) => { d.target = e.target.value; } })),
          field('De quê?', h('input', { class: 'input', 'data-key': 'goal-unit', value: d.unit, maxlength: 30, placeholder: 'aulas, livros, km…', onInput: (e) => { d.unit = e.target.value; } }))),
        !editing && field('Quantos você já fez?', h('input', { class: 'input input--short', inputmode: 'decimal', 'data-key': 'goal-current', value: d.current, placeholder: '0', onInput: (e) => { d.current = e.target.value; } }), { hint: 'Opcional.' }));
      } else if (d.type === 'steps' && !editing) {
        const list = h('ol', { class: 'steps-edit' }, d.steps.map((s, i) => h('li', null,
          h('input', {
            class: 'input', 'data-key': `goal-step-${i}`, value: s, placeholder: i === 0 ? 'Primeira etapa' : 'Próxima etapa', maxlength: 200,
            'aria-label': `Etapa ${i + 1}`,
            onInput: (e) => { d.steps[i] = e.target.value; },
            onKeydown: (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (d.steps[i].trim()) { d.steps.splice(i + 1, 0, ''); sheet.refresh(); focusKey(`goal-step-${i + 1}`); }
              } else if (e.key === 'Backspace' && !d.steps[i] && d.steps.length > 1) {
                e.preventDefault(); d.steps.splice(i, 1); sheet.refresh(); focusKey(`goal-step-${Math.max(i - 1, 0)}`);
              }
            },
          }))));
        add(form, h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Quais são as etapas?'), list,
          button('Adicionar etapa', { variant: 'ghost', icon: 'plus', size: 'sm', onClick: () => { d.steps.push(''); sheet.refresh(); focusKey(`goal-step-${d.steps.length - 1}`); } }),
          h('p', { class: 'hint' }, 'Não precisa acertar tudo agora. Dá para mudar depois.')));
      }

      if (d.type) {
        add(form, 
          h('div', { class: 'grid-2' },
            field('Quando você quer chegar lá?', h('input', {
              type: 'date', class: 'input', value: d.targetDate, min: editing ? null : today(),
              onChange: (e) => { d.targetDate = e.target.value; },
            }), { hint: 'Opcional. Sem data também vale.' })),
          h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Área (opcional)'),
            chipGroup(listAreas().map((a) => ({ value: a.id, label: a.name, color: a.color })), d.areaId, (v) => { d.areaId = v; }, { label: 'Área', allowNone: true, className: 'chips--areas' })),
        );
      }

      if (error) add(form, h('p', { class: 'form-error', role: 'alert' }, error));
      add(form, h('div', { class: 'form-actions' },
        button('Cancelar', { variant: 'ghost', onClick: () => sheet.close() }),
        button(editing ? 'Salvar' : 'Criar meta', { variant: 'primary', type: 'submit', attrs: { disabled: !d.type || !d.title.trim() || saving } })));
      return form;
    },
  });

  function moneyInput(key, value, set) {
    return h('div', { class: 'input-affix' }, h('span', { class: 'input-affix__prefix', 'aria-hidden': 'true' }, 'R$'),
      h('input', { class: 'input', inputmode: 'decimal', 'data-key': key, value, placeholder: '0', onInput: (e) => set(e.target.value) }));
  }

  function focusKey(key) {
    requestAnimationFrame(() => sheet.panel.querySelector(`[data-key="${key}"]`)?.focus());
  }

  async function save() {
    error = '';
    const payload = { title: d.title.trim(), type: d.type, targetDate: d.targetDate || null, areaId: d.areaId };
    if (!payload.title) { error = 'Dê um nome para a meta.'; sheet.refresh(); return; }
    if (d.type === 'money') {
      payload.targetValue = parseMoney(d.target);
      if (!payload.targetValue || payload.targetValue <= 0) { error = 'Informe quanto você quer juntar (ex.: 40.000).'; sheet.refresh(); return; }
      if (!editing) {
        payload.currentValue = d.current.trim() ? parseMoney(d.current) : 0;
        if (payload.currentValue == null || payload.currentValue < 0) { error = 'O valor atual não ficou claro (ex.: 8.500).'; sheet.refresh(); return; }
      }
    } else if (d.type === 'count') {
      payload.targetValue = parseNumber(d.target);
      payload.unit = d.unit.trim();
      if (!payload.targetValue || payload.targetValue <= 0) { error = 'Informe quantos (ex.: 40).'; sheet.refresh(); return; }
      if (!editing) {
        payload.currentValue = d.current.trim() ? parseNumber(d.current) : 0;
        if (payload.currentValue == null || payload.currentValue < 0) { error = 'A quantidade atual não ficou clara.'; sheet.refresh(); return; }
      }
    } else if (d.type === 'steps' && !editing) {
      payload.steps = d.steps.map((s) => s.trim()).filter(Boolean);
      if (!payload.steps.length) { error = 'Escreva pelo menos uma etapa.'; sheet.refresh(); return; }
    }

    saving = true;
    try {
      if (editing) {
        const patch = { title: payload.title, targetDate: payload.targetDate, areaId: payload.areaId };
        if (d.type !== 'steps') patch.targetValue = payload.targetValue;
        if (d.type === 'count') patch.unit = payload.unit;
        await updateGoal(editing.id, patch);
        sheet.close();
        toast('Meta atualizada.');
      } else {
        const extra = fromInboxId ? (g) => inboxToGoalChange(fromInboxId, g.id) : undefined;
        const { goal } = await createGoal(payload, extra);
        sheet.close();
        toast('Meta criada. A primeira parte — decidir — já foi.', { action: { label: 'Ver meta', fn: () => go(`metas/${goal.id}`) } });
        onDone?.(goal);
      }
    } catch (err) {
      saving = false;
      toastError(err);
      sheet.refresh();
    }
  }
  return sheet;
}
