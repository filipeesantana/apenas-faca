/**
 * Criar/editar meta, de forma progressiva:
 * 1. Qual é sua meta? → 2. Como você quer acompanhar? → 3. números → 4. quando (opcional).
 * Ao escolher um prazo, o Norte já mostra o ritmo necessário.
 */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { chipGroup, button, field } from '../ui/components.js';
import { labelWithHelp, HELP } from '../ui/help.js';
import { state } from '../core/store.js';
import { GOAL_TYPES, createGoal, updateGoal, parseGoalValue, formatGoalValue } from '../domain/goals.js';
import { adapterFor, horizonEnd, requiredRate } from '../domain/planning.js';
import { inboxToGoalChange } from '../domain/inbox.js';
import { listAreas } from '../domain/areas.js';
import { formatMoney, formatCount, formatMinutes } from '../utils/numbers.js';
import { today, formatDayLong, distanceText } from '../utils/dates.js';
import { toast, toastError } from '../ui/toast.js';
import { go } from '../core/router.js';

const TYPE_ORDER = ['money', 'count', 'time', 'steps'];
const LABELS = {
  money: { target: 'Qual é o valor objetivo?', current: 'Quanto você já tem?', ph: '40.000', phCur: '0' },
  count: { target: 'Quantos no total?', current: 'Quantos você já fez?', ph: '40', phCur: '0' },
  time: { target: 'Quantas horas no total?', current: 'Quanto tempo você já fez?', ph: '60h', phCur: 'Ex.: 8h20' },
};

function displayValue(type, v) {
  if (v == null) return '';
  if (type === 'money') return formatMoney(v).replace(/R\$\s?/, '');
  if (type === 'time') return formatMinutes(v);
  return formatCount(v);
}

/** Interpreta a meta de tempo: número puro = horas ("60" → 60h). */
function parseTarget(type, raw) {
  if (type === 'time' && /^\s*\d+([.,]\d+)?\s*$/.test(raw)) return Math.round(Number(raw.replace(',', '.')) * 60);
  return parseGoalValue(type, raw);
}

export function openGoalForm({ title = '', goalId = null, fromInboxId = null, onDone } = {}) {
  const editing = goalId ? state.goals.get(goalId) : null;
  const d = editing
    ? { title: editing.title, type: editing.type, target: displayValue(editing.type, editing.targetValue), current: '', unit: editing.unit || '', steps: [], targetDate: editing.targetDate || '', horizon: null, areaId: editing.areaId }
    : { title, type: null, target: '', current: '', unit: '', steps: [''], targetDate: '', horizon: null, areaId: null };
  let error = '';
  let saving = false;
  // Prévia do ritmo necessário (atualizada enquanto a pessoa digita).
  const preview = h('div', { class: 'rate-preview', 'aria-live': 'polite' });

  const sheet = openSheet({
    title: editing ? 'Editar meta' : 'Nova meta',
    focus: editing ? null : '[data-key="goal-title"]',
    render: () => {
      const form = h('form', { class: 'goal-form', novalidate: true, onSubmit: (e) => { e.preventDefault(); save(); } });
      add(form, h('div', { class: 'field' },
        labelWithHelp('Qual é sua meta?', HELP.meta, { tag: 'label', forId: 'goal-title' }),
        h('input', {
          id: 'goal-title', class: 'input input--lg', 'data-key': 'goal-title', value: d.title, maxlength: 200, placeholder: 'Ex.: Comprar um carro', autocomplete: 'off',
          onInput: (e) => { const had = !!d.title.trim(); d.title = e.target.value; if (had !== !!d.title.trim()) sheet.refresh(); },
        })));

      if (d.title.trim() || editing) {
        add(form, h('fieldset', { class: 'fieldset' },
          h('legend', { class: 'field__label' }, 'Como você quer acompanhar?'),
          h('div', { class: 'type-cards' }, TYPE_ORDER.map((t) => h('button', {
            type: 'button', class: 'type-card', 'aria-pressed': String(d.type === t), disabled: !!editing && d.type !== t,
            onClick: () => { d.type = t; error = ''; sheet.refresh(); },
          },
          h('span', { class: 'type-card__icon', 'aria-hidden': 'true' }, icon(GOAL_TYPES[t].icon, { size: 20 })),
          h('span', { class: 'type-card__title' }, GOAL_TYPES[t].label),
          h('span', { class: 'type-card__desc' }, GOAL_TYPES[t].desc)))),
          editing && h('p', { class: 'hint' }, 'O tipo não muda depois de criada. Para outro tipo, crie uma nova meta.')));
      }

      const L = LABELS[d.type];
      if (L) {
        const targetInput = h('input', { class: 'input', inputmode: d.type === 'time' ? 'text' : 'decimal', 'data-key': 'goal-target', value: d.target, placeholder: L.ph, onInput: (e) => { d.target = e.target.value; updatePreview(); } });
        const currentInput = h('input', { class: 'input', inputmode: d.type === 'time' ? 'text' : 'decimal', 'data-key': 'goal-current', value: d.current, placeholder: L.phCur, onInput: (e) => { d.current = e.target.value; updatePreview(); } });
        const affix = (el) => (d.type === 'money' ? h('div', { class: 'input-affix' }, h('span', { class: 'input-affix__prefix', 'aria-hidden': 'true' }, 'R$'), el) : el);
        add(form, h('div', { class: 'grid-2' },
          field(L.target, affix(targetInput), { hint: d.type === 'time' ? 'Em horas. Ex.: 60 ou 60h.' : null }),
          !editing && field(L.current, affix(currentInput), { hint: 'Opcional. Pode ser zero.' })));
        if (d.type === 'count') {
          add(form, field('De quê?', h('input', { class: 'input', 'data-key': 'goal-unit', value: d.unit, maxlength: 30, placeholder: 'aulas, livros, treinos, km…', onInput: (e) => { d.unit = e.target.value; } }), { hint: 'Use o plural. Ex.: “aulas”.' }));
        }
      } else if (d.type === 'steps' && !editing) {
        const list = h('ol', { class: 'steps-edit' }, d.steps.map((st, i) => h('li', null, h('input', {
          class: 'input', 'data-key': `goal-step-${i}`, value: st, placeholder: i === 0 ? 'Primeira etapa' : 'Próxima etapa', maxlength: 200, 'aria-label': `Etapa ${i + 1}`,
          onInput: (e) => { d.steps[i] = e.target.value; },
          onKeydown: (e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (d.steps[i].trim()) { d.steps.splice(i + 1, 0, ''); sheet.refresh(); focusKey(`goal-step-${i + 1}`); } }
            else if (e.key === 'Backspace' && !d.steps[i] && d.steps.length > 1) { e.preventDefault(); d.steps.splice(i, 1); sheet.refresh(); focusKey(`goal-step-${Math.max(i - 1, 0)}`); }
          },
        }))));
        add(form, h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Quais são as etapas?'), list,
          button('Adicionar etapa', { variant: 'ghost', icon: 'plus', size: 'sm', onClick: () => { d.steps.push(''); sheet.refresh(); focusKey(`goal-step-${d.steps.length - 1}`); } }),
          h('p', { class: 'hint' }, 'Enter adiciona a próxima. Dá para mudar depois.')));
      }

      if (d.type) {
        const dateInput = h('input', { type: 'date', class: 'input input--date', value: d.targetDate, min: editing ? null : today(), 'aria-label': 'Escolher uma data', onChange: (e) => { d.targetDate = e.target.value; d.horizon = null; sheet.refresh(); } });
        const horizons = adapterFor({ type: d.type }).horizons;
        add(form, h('div', { class: 'field' },
          h('span', { class: 'field__label' }, 'Quando você quer chegar lá?'),
          h('div', { class: 'due-picker' },
            chipGroup([...horizons.map((x) => ({ value: x.id, label: x.label })), { value: 'none', label: 'Sem data' }], d.horizon || (d.targetDate ? null : 'none'), (v) => {
              const hz = horizons.find((x) => x.id === v);
              d.horizon = hz ? v : null;
              d.targetDate = hz ? horizonEnd(hz) : '';
              sheet.refresh();
            }, { label: 'Prazo da meta' }),
            dateInput),
          h('p', { class: 'due-readout' }, d.targetDate ? [icon('calendar', { size: 15 }), h('strong', null, formatDayLong(d.targetDate)), ' · ', distanceText(d.targetDate)] : h('span', { class: 'muted' }, 'Sem data também vale. Você pode ver cenários depois.')),
          preview));
        add(form, h('div', { class: 'field' }, labelWithHelp('Área (opcional)', HELP.area),
          chipGroup(listAreas().map((a) => ({ value: a.id, label: a.name, color: a.color })), d.areaId, (v) => { d.areaId = v; }, { label: 'Área', allowNone: true, className: 'chips--areas' })));
        updatePreview();
      }

      if (error) add(form, h('p', { class: 'form-error', role: 'alert' }, error));
      add(form, h('div', { class: 'form-actions' },
        button('Cancelar', { variant: 'ghost', onClick: () => sheet.close() }),
        button(editing ? 'Salvar' : 'Criar meta', { variant: 'primary', type: 'submit', attrs: { disabled: !d.type || !d.title.trim() || saving } })));
      return form;
    },
  });

  function updatePreview() {
    preview.replaceChildren();
    if (!d.type || !d.targetDate) return;
    const tmp = buildPreviewGoal();
    if (!tmp) return;
    const hz = adapterFor(tmp).horizons.find((x) => x.id === d.horizon);
    const r = requiredRate(tmp, d.targetDate, hz?.months || null);
    if (r.done || r.invalid) return;
    preview.append(icon('trend', { size: 15 }), h('span', null, 'Para chegar lá nesse prazo: ', h('strong', null, r.primary), r.secondary ? ` (${r.secondary})` : '', '.'));
  }
  function buildPreviewGoal() {
    if (d.type === 'steps') {
      const n = editing ? editing.steps.filter((x) => !x.done).length : d.steps.filter((x) => x.trim()).length;
      return n ? { type: 'steps', steps: Array.from({ length: n }, () => ({ done: false })) } : null;
    }
    const target = parseTarget(d.type, d.target);
    if (!target) return null;
    const current = editing ? editing.currentValue : (d.current.trim() ? parseGoalValue(d.type, d.current) || 0 : 0);
    return { type: d.type, targetValue: target, currentValue: current, unit: d.unit };
  }

  function focusKey(key) { requestAnimationFrame(() => sheet.panel.querySelector(`[data-key="${key}"]`)?.focus()); }
  const fail = (msg) => { error = msg; sheet.refresh(); };

  async function save() {
    error = '';
    const payload = { title: d.title.trim(), type: d.type, targetDate: d.targetDate || null, areaId: d.areaId };
    if (!payload.title) return fail('Dê um nome para a meta. Ex.: “Comprar um carro”.');
    if (d.type !== 'steps') {
      payload.targetValue = parseTarget(d.type, d.target);
      if (!payload.targetValue || payload.targetValue <= 0) {
        return fail({ money: 'Informe o valor objetivo. Ex.: 40.000', count: 'Informe quantos. Ex.: 40', time: 'Informe as horas. Ex.: 60' }[d.type]);
      }
      if (!editing) {
        payload.currentValue = d.current.trim() ? parseGoalValue(d.type, d.current) : 0;
        if (payload.currentValue == null || payload.currentValue < 0) return fail('O valor atual não ficou claro. Confira o número digitado.');
        if (payload.currentValue >= payload.targetValue) return fail(`O valor atual já alcança o objetivo (${formatGoalValue(payload, payload.currentValue)}). Confira os números.`);
      }
      if (d.type === 'count') payload.unit = d.unit.trim();
    } else if (!editing) {
      payload.steps = d.steps.map((x) => x.trim()).filter(Boolean);
      if (!payload.steps.length) return fail('Escreva pelo menos uma etapa.');
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
        go(`metas/${goal.id}`);
        toast('Meta criada. Agora defina o próximo passo.');
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
