/** Campos reutilizáveis de formulário: prazo humano, importância, duração, meta ligada. */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chipGroup } from '../ui/components.js';
import { labelWithHelp, helpTip, HELP } from '../ui/help.js';
import { DUE_PRESETS, IMPORTANCE, ESTIMATES } from '../domain/tasks.js';
import { activeGoals } from '../domain/goals.js';
import { formatDayLong, distanceText, today } from '../utils/dates.js';
import { formatMinutes, parseDuration } from '../utils/numbers.js';

/** Prazo com leitura humana imediata: "30 de setembro de 2026 · Faltam 9 dias." */
export function dueField(value, onChange, { label = 'Prazo', allowPast = false } = {}) {
  let current = value || null;
  const readout = h('p', { class: 'due-readout', 'aria-live': 'polite' });
  const presetOf = (d) => DUE_PRESETS.find((p) => p.date() === d)?.id || null;
  const dateInput = h('input', {
    type: 'date', class: 'input input--date', 'aria-label': 'Escolher uma data', value: current || '', min: allowPast ? null : today(),
    onChange: (e) => set(e.target.value || null, true),
  });
  const chips = chipGroup(
    [...DUE_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: 'none', label: 'Sem prazo' }],
    current ? presetOf(current) : 'none',
    (v) => set(v === 'none' || !v ? null : DUE_PRESETS.find((p) => p.id === v).date()),
    { label },
  );
  function paint() {
    readout.replaceChildren(...(current
      ? [icon('calendar', { size: 15 }), h('strong', null, formatDayLong(current)), ' · ', distanceText(current)]
      : [h('span', { class: 'muted' }, 'Sem prazo. Tudo bem — dá para definir depois.')]));
  }
  function set(d, fromInput = false) {
    current = d;
    if (!fromInput) dateInput.value = d || '';
    const pid = d ? presetOf(d) : 'none';
    chips.querySelectorAll('.chip').forEach((c, i) => c.setAttribute('aria-pressed', String(([...DUE_PRESETS.map((p) => p.id), 'none'][i]) === pid)));
    paint();
    onChange(d);
  }
  paint();
  return h('div', { class: 'field' }, h('span', { class: 'field__label' }, label), h('div', { class: 'due-picker' }, chips, dateInput), readout);
}

export function importanceField(value, onChange) {
  return h('div', { class: 'field' },
    labelWithHelp('Importância', HELP.importancia),
    h('p', { class: 'field__hint' }, 'Quanto isso realmente importa?'),
    chipGroup(IMPORTANCE, value || 'normal', (v) => onChange(v || 'normal'), { label: 'Importância' }));
}

export function estimateField(value, onChange) {
  const other = h('input', {
    class: 'input input--short input--sm', placeholder: 'Outro (ex.: 1h30)', 'aria-label': 'Outra duração',
    value: value && !ESTIMATES.includes(value) ? formatMinutes(value) : '',
    onChange: (e) => { const m = parseDuration(e.target.value); onChange(m > 0 ? m : null); },
  });
  return h('div', { class: 'field' },
    labelWithHelp('Quanto tempo leva?', HELP.duracao),
    h('div', { class: 'due-picker' },
      chipGroup(ESTIMATES.map((m) => ({ value: m, label: formatMinutes(m) })), ESTIMATES.includes(value) ? value : null, (v) => { other.value = ''; onChange(v); }, { label: 'Duração estimada', allowNone: true }),
      other));
}

/** Meta relacionada + "é o próximo passo desta meta". */
export function goalField(goalId, nextStep, onChange) {
  const goals = activeGoals();
  if (!goals.length) return null;
  let g = goalId || '';
  let ns = !!nextStep;
  const toggle = h('label', { class: ['switch', !g && 'is-disabled'] },
    h('input', { type: 'checkbox', checked: ns, disabled: !g, onChange: (e) => { ns = e.target.checked; onChange(g || null, ns); } }),
    h('span', { class: 'switch__track', 'aria-hidden': 'true' }),
    h('span', { class: 'switch__label' }, 'É o próximo passo desta meta'));
  const check = h('div', { class: 'switch-field' }, h('div', { class: 'switch-field__row' }, toggle, helpTip(HELP.proximoPasso)));
  const select = h('select', {
    class: 'input', 'aria-label': 'Meta relacionada',
    onChange: (e) => {
      g = e.target.value;
      const input = check.querySelector('input');
      input.disabled = !g;
      toggle.classList.toggle('is-disabled', !g);
      if (!g) { ns = false; input.checked = false; }
      onChange(g || null, ns);
    },
  }, h('option', { value: '' }, 'Nenhuma'), goals.map((x) => h('option', { value: x.id, selected: x.id === goalId }, x.title)));
  return h('div', { class: 'field' }, labelWithHelp('Faz parte de uma meta?', HELP.meta), select, check);
}
