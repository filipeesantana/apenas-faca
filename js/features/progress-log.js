/**
 * Registrar progresso numa meta. Usado pelo "+ Adicionar" e pela página da meta.
 * Cada tipo pede a informação do jeito mais natural:
 *  valor → R$ (adicionar ou retirar) · tempo → horas e minutos · quantidade → número · etapas → marcar.
 */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { button, chipGroup, progressBar } from '../ui/components.js';
import { state, undo } from '../core/store.js';
import { activeGoals, addProgress, setCurrentValue, toggleStep, goalValueLine, progressOf, formatGoalValue, MILESTONE_TEXT } from '../domain/goals.js';
import { parseMoney, parseNumber, formatMinutes, formatPercent } from '../utils/numbers.js';
import { toast, toastError } from '../ui/toast.js';

/** Mostra feedback padronizado após um registro. */
export function progressFeedback(g, res, verb = 'Registrado') {
  if (!res) { toast('Nada mudou: o valor já era esse.'); return; }
  const top = res.crossed?.length ? Math.max(...res.crossed) : null;
  const delta = g.type === 'steps' ? null : res.goal.currentValue - g.currentValue;
  const amount = delta == null ? '' : `${delta >= 0 ? '+' : '−'} ${formatGoalValue(g, Math.abs(delta))} · `;
  const msg = res.completed ? `${MILESTONE_TEXT[100]} “${g.title}” chegou lá.` : `${verb}: ${amount}${formatPercent(progressOf(res.goal).ratio)}${top ? `. ${MILESTONE_TEXT[top]}` : ''}`;
  toast(msg, { tone: res.completed || top ? 'good' : null, action: { label: 'Desfazer', fn: () => undo(res.undo) } });
}

/** Formulário de progresso de uma meta (elemento). */
export function progressEntry(g, { onDone, compact = false } = {}) {
  if (g.type === 'steps') return stepsEntry(g, onDone);
  const wrap = h('div', { class: ['progress-entry', compact && 'is-compact'] });
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const fail = (msg) => { err.hidden = false; err.textContent = msg; };
  let mode = 'add';

  const submit = async (value, kind = mode) => {
    try {
      const res = kind === 'set' ? await setCurrentValue(g.id, value) : await addProgress(g.id, kind === 'withdraw' ? -value : value, { kind });
      progressFeedback(g, res, kind === 'withdraw' ? 'Retirada registrada' : kind === 'set' ? 'Valor corrigido' : 'Registrado');
      onDone?.(res);
    } catch (e) { toastError(e); }
  };

  if (g.type === 'money') {
    const input = h('input', { class: 'input input--lg', inputmode: 'decimal', 'data-key': `pe-money-${g.id}`, placeholder: '0,00', autocomplete: 'off', 'aria-label': 'Valor em reais' });
    const labelEl = h('label', { class: 'field__label', for: `pe-${g.id}` }, 'Quanto você guardou?');
    input.id = `pe-${g.id}`;
    add(wrap,
      chipGroup([{ value: 'add', label: 'Adicionar' }, { value: 'withdraw', label: 'Retirar' }, { value: 'set', label: 'Corrigir total' }], 'add', (v) => {
        mode = v || 'add';
        labelEl.textContent = { add: 'Quanto você guardou?', withdraw: 'Quanto saiu?', set: 'Qual é o valor total correto hoje?' }[mode];
      }, { label: 'Tipo de registro' }),
      h('form', {
        class: 'progress-entry__form', onSubmit: (e) => {
          e.preventDefault();
          const v = parseMoney(input.value);
          if (v == null || v < 0 || (mode !== 'set' && v === 0)) return fail('Não entendi o valor. Exemplos: 500 · 1.250,50');
          input.value = '';
          submit(v);
        },
      }, labelEl, h('div', { class: 'row-inline' }, h('div', { class: 'input-affix' }, h('span', { class: 'input-affix__prefix', 'aria-hidden': 'true' }, 'R$'), input), button('Salvar', { variant: 'primary', type: 'submit' }))),
      err);
  } else if (g.type === 'time') {
    const hours = h('input', { class: 'input input--num', inputmode: 'numeric', 'data-key': `pe-h-${g.id}`, placeholder: '0', 'aria-label': 'Horas', id: `pe-h-${g.id}` });
    const mins = h('input', { class: 'input input--num', inputmode: 'numeric', 'data-key': `pe-m-${g.id}`, placeholder: '0', 'aria-label': 'Minutos' });
    add(wrap,
      h('p', { class: 'field__label' }, 'Quanto tempo você dedicou?'),
      h('div', { class: 'quick-row' }, [15, 30, 45, 60, 90].map((m) => button(`+ ${formatMinutes(m)}`, { size: 'sm', onClick: () => submit(m, 'add') }))),
      h('form', {
        class: 'progress-entry__form', onSubmit: (e) => {
          e.preventDefault();
          const hh = hours.value.trim() ? parseNumber(hours.value) : 0;
          const mm = mins.value.trim() ? parseNumber(mins.value) : 0;
          if (hh == null || mm == null || hh < 0 || mm < 0) return fail('Use só números. Ex.: 1 hora e 30 minutos.');
          const total = Math.round(hh * 60 + mm);
          if (!total) return fail('Informe as horas, os minutos ou os dois.');
          hours.value = ''; mins.value = '';
          submit(total, 'add');
        },
      }, h('span', { class: 'muted small' }, 'Ou informe outro tempo:'),
      h('div', { class: 'row-inline' },
        h('label', { class: 'unit-input' }, hours, h('span', null, 'horas')),
        h('label', { class: 'unit-input' }, mins, h('span', null, 'minutos')),
        button('Salvar', { variant: 'primary', type: 'submit' }))),
      err);
  } else {
    const input = h('input', { class: 'input input--num', inputmode: 'decimal', 'data-key': `pe-n-${g.id}`, placeholder: '0', 'aria-label': `Quantidade${g.unit ? ` de ${g.unit}` : ''}` });
    const unit = g.unit || 'vezes';
    add(wrap,
      h('p', { class: 'field__label' }, `Quanto você avançou?`),
      h('div', { class: 'quick-row' }, [1, 2, 5].map((n) => button(`+ ${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`, { size: 'sm', variant: n === 1 ? 'primary' : 'secondary', onClick: () => submit(n, 'add') }))),
      h('form', {
        class: 'progress-entry__form', onSubmit: (e) => {
          e.preventDefault();
          const v = parseNumber(input.value);
          if (v == null || v <= 0) return fail('Informe um número maior que zero.');
          input.value = '';
          submit(v, 'add');
        },
      }, h('div', { class: 'row-inline' }, h('label', { class: 'unit-input' }, input, h('span', null, unit)), button('Salvar', { variant: 'primary', type: 'submit' }))),
      err);
  }
  if (g.type !== 'money') {
    const input = h('input', { class: 'input input--short', 'data-key': `pe-fix-${g.id}`, placeholder: g.type === 'time' ? 'Ex.: 8h20' : 'Ex.: 18', 'aria-label': 'Total correto' });
    add(wrap, h('details', { class: 'fix' },
      h('summary', null, 'Corrigir o total'),
      h('form', {
        class: 'row-inline', onSubmit: (e) => {
          e.preventDefault();
          const v = g.type === 'time' ? parseDurationLoose(input.value) : parseNumber(input.value);
          if (v == null || v < 0) return fail(g.type === 'time' ? 'Use o formato 8h20 ou só minutos (ex.: 500).' : 'Informe um número.');
          submit(v, 'set');
        },
      }, h('span', { class: 'muted small' }, `Hoje: ${formatGoalValue(g, g.currentValue)}. Total correto:`), input, button('Corrigir', { type: 'submit', size: 'sm' }))));
  }
  return wrap;
}

function parseDurationLoose(raw) {
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  const m = s.match(/^(\d+)(?:h|:)(\d{1,2})?/);
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
  const n = parseNumber(s.replace(/min$/, ''));
  return n == null ? null : Math.round(n);
}

function stepsEntry(g, onDone) {
  const pending = g.steps.filter((s) => !s.done);
  if (!pending.length) return h('p', { class: 'muted' }, 'Todas as etapas estão concluídas.');
  return h('div', { class: 'progress-entry' },
    h('p', { class: 'field__label' }, 'Qual etapa você concluiu?'),
    h('div', { class: 'choices' }, pending.map((st) => h('button', {
      type: 'button', class: 'choice choice--sm', onClick: async () => {
        try { const res = await toggleStep(g.id, st.id); progressFeedback(g, res, 'Etapa concluída'); onDone?.(res); } catch (e) { toastError(e); }
      },
    }, h('span', { class: 'choice__icon', 'aria-hidden': 'true' }, icon('check', { size: 16 })), h('span', { class: 'choice__title' }, st.title)))));
}

/** Folha "Registrar progresso": escolhe a meta (se preciso) e registra. */
export function openProgressLog(goalId = null) {
  let selected = goalId;
  const sheet = openSheet({
    title: 'Registrar progresso',
    render: () => {
      const goals = activeGoals();
      const g = selected ? state.goals.get(selected) : null;
      if (!goals.length && !g) return h('p', { class: 'muted' }, 'Você ainda não tem metas ativas.');
      if (!g) {
        return h('div', null,
          h('p', { class: 'add-menu__q' }, 'Qual meta você quer atualizar?'),
          h('div', { class: 'choices' }, goals.map((x) => h('button', { type: 'button', class: 'choice', onClick: () => { selected = x.id; sheet.refresh(); } },
            h('span', { class: 'choice__text' }, h('span', { class: 'choice__title' }, x.title), h('span', { class: 'choice__desc' }, `${goalValueLine(x)} · ${formatPercent(progressOf(x).ratio)}`)),
            icon('chevronRight', { size: 18 })))));
      }
      return h('div', { class: 'progress-log' },
        h('div', { class: 'progress-log__goal' },
          h('p', { class: 'progress-log__title' }, g.title),
          h('p', { class: 'muted small' }, `${goalValueLine(g)} · ${formatPercent(progressOf(g).ratio)}`),
          progressBar(progressOf(g).ratio, { key: `goal-${g.id}`, label: `Progresso de ${g.title}` })),
        progressEntry(g, { onDone: () => sheet.close() }),
        !goalId && goals.length > 1 && button('Escolher outra meta', { variant: 'ghost', size: 'sm', icon: 'arrowLeft', onClick: () => { selected = null; sheet.refresh(); } }));
    },
  });
  return sheet;
}

