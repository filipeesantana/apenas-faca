/**
 * Registrar dinheiro que entrou ou saiu — o mais rápido possível, quase tudo em botões.
 * A leitura do gasto (natureza e margem para ajuste) é sempre do usuário.
 */
import { h, add } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { button, chipGroup, runWithButton } from '../../ui/components.js';
import { labelWithHelp, HELP } from '../../ui/help.js';
import { toast, toastError } from '../../ui/toast.js';
import { state } from '../../core/store.js';
import { formatMoney, parseMoney } from '../../utils/numbers.js';
import { today, addDays, formatDayLong, toISODate, parseISODate } from '../../utils/dates.js';
import { openTaskForm } from '../task-form.js';
import {
  OUT_CATEGORIES, IN_CATEGORIES, NATURES, FLEX_LEVELS, FREQS,
  addTransaction, addRecurring, removeRecurring, enableFinance, financeEnabled, categoryLabel,
} from '../../domain/money.js';

/** Fluxo curto: entrou/saiu → quanto → onde → como você considera. */
export function openMoneyEntry({ kind = null, categoryId = null } = {}) {
  const d = {
    kind, amount: '', date: today(), categoryId, label: '',
    nature: 'necessario', flex: 'unknown', repeat: 'none',
  };
  let error = '';
  const sheet = openSheet({
    title: 'Movimentação financeira',
    key: 'money-entry',
    focus: '[data-key="money-amount"]',
    render: () => (d.kind ? formStep() : kindStep()),
  });

  function kindStep() {
    const pick = (k) => { d.kind = k; d.categoryId = null; d.nature = k === 'out' ? 'necessario' : null; sheet.refresh(); };
    return h('div', { class: 'add-menu' },
      h('p', { class: 'add-menu__q' }, 'Registre dinheiro que entrou ou saiu.'),
      h('div', { class: 'choices' },
        choice('trend', 'Entrou', 'Salário, freelance, benefício, venda…', () => pick('in')),
        choice('trendDown', 'Saiu', 'Uma despesa, uma compra, uma conta…', () => pick('out'))));
  }

  function formStep() {
    const out = d.kind === 'out';
    const cats = out ? OUT_CATEGORIES : IN_CATEGORIES;
    const amount = h('input', {
      class: 'input input--lg input--money', inputmode: 'decimal', 'data-key': 'money-amount', value: d.amount,
      placeholder: 'Ex.: 120,00', 'aria-label': 'Valor', onInput: (e) => { d.amount = e.target.value; },
    });
    const dateInput = h('input', {
      type: 'date', class: 'input input--date', value: d.date, max: today(), 'aria-label': 'Data',
      onChange: (e) => { d.date = e.target.value || today(); sheet.refresh(); },
    });
    const labelInput = h('input', {
      class: 'input', value: d.label, maxlength: 60, 'data-key': 'money-label',
      placeholder: out ? 'Ex.: mercado do mês' : 'Ex.: salário da empresa', 'aria-label': 'Descrição (opcional)',
      onInput: (e) => { d.label = e.target.value; },
    });

    const form = h('form', {
      class: 'money-form', novalidate: true,
      onSubmit: (e) => { e.preventDefault(); save(e.submitter || form.querySelector('[data-role="save"]')); },
    },
    h('div', { class: 'money-form__kind' },
      h('span', { class: ['pill', out ? 'pill--out' : 'pill--in'] }, icon(out ? 'trendDown' : 'trend', { size: 14 }), out ? 'Saiu' : 'Entrou'),
      button('Trocar', { variant: 'ghost', size: 'sm', onClick: () => { d.kind = null; sheet.refresh(); } })),
    h('div', { class: 'field' },
      h('label', { class: 'field__label', for: id(amount, 'money-amount-input') }, 'Quanto?'),
      h('div', { class: 'sim__row' }, h('span', { class: 'sim__prefix' }, 'R$'), amount),
      error && h('p', { class: 'field-error' }, error)),
    h('div', { class: 'field' },
      h('span', { class: 'field__label' }, 'Quando?'),
      h('div', { class: 'due-picker' },
        chipGroup([{ value: today(), label: 'Hoje' }, { value: addDays(today(), -1), label: 'Ontem' }], d.date, (v) => { d.date = v; sheet.refresh(); }, { label: 'Data' }),
        dateInput),
      h('p', { class: 'due-readout' }, icon('calendar', { size: 15 }), formatDayLong(d.date))),
    h('div', { class: 'field' },
      h('span', { class: 'field__label' }, out ? 'Onde?' : 'De onde veio?'),
      chipGroup(cats.map((c) => ({ value: c.id, label: c.label })), d.categoryId, (v) => { d.categoryId = v; }, { label: 'Categoria', className: 'chips--lg' })),
    h('div', { class: 'field' },
      h('label', { class: 'field__label', for: id(labelInput, 'money-label-input') }, 'Descrição (opcional)'), labelInput));

    if (out) {
      add(form,
        h('div', { class: 'field' },
          labelWithHelp('Como você considera este gasto?', HELP.natureza),
          chipGroup(NATURES.map((n) => ({ value: n.id, label: n.label })), d.nature, (v) => { d.nature = v; }, { label: 'Natureza', className: 'chips--lg' }),
          h('p', { class: 'field__hint' }, 'Só você define isso. O Norte não classifica gastos como necessários ou supérfluos.')),
        h('div', { class: 'field' },
          labelWithHelp('Aceitaria ajustar este gasto numa simulação?', HELP.flexibilidade),
          chipGroup(FLEX_LEVELS.map((f) => ({ value: f.id, label: f.label })), d.flex, (v) => { d.flex = v; }, { label: 'Margem para ajuste', className: 'chips--lg' }),
          h('p', { class: 'field__hint' }, 'Gastos marcados como “Não mexer” nunca aparecem em simulações de redução.')));
    }

    add(form,
      h('div', { class: 'field' },
        h('span', { class: 'field__label' }, 'Isso se repete?'),
        chipGroup([{ value: 'none', label: 'Não' }, ...FREQS.map((f) => ({ value: f.id, label: f.label }))], d.repeat, (v) => { d.repeat = v; }, { label: 'Repetição' }),
        h('p', { class: 'field__hint' }, 'Repetições ficam como previsão. O valor só conta como realizado quando você confirma.')),
      h('div', { class: 'form-actions' },
        button('Cancelar', { variant: 'ghost', onClick: () => sheet.close() }),
        button('Salvar', { variant: 'primary', type: 'submit', icon: 'check', attrs: { 'data-role': 'save' } })));
    return form;
  }

  async function save(btn) {
    const cents = parseMoney(d.amount);
    if (!(cents > 0)) { error = 'Informe um valor maior que zero.'; sheet.refresh(); return; }
    error = '';
    await runWithButton(btn, async () => {
      if (!financeEnabled()) await enableFinance('movimentacao');
      await addTransaction({
        kind: d.kind, amountCents: cents, date: d.date, categoryId: d.categoryId || 'outro',
        label: d.label, nature: d.nature, flex: d.flex,
      });
      if (d.repeat !== 'none') {
        await addRecurring({
          kind: d.kind, amountCents: cents, label: d.label, categoryId: d.categoryId || 'outro',
          nature: d.nature, flex: d.flex, freq: d.repeat,
        });
      }
      sheet.close();
      toast(`${d.kind === 'in' ? 'Entrada' : 'Saída'} de ${formatMoney(cents)} registrada${d.repeat !== 'none' ? ' e marcada como recorrente' : ''}.`);
    }, { busy: 'Salvando…' }).catch(toastError);
  }

  return sheet;
}

/** Renda: o Norte pergunta uma vez e nunca obriga. */
export function openIncomeForm({ onDone } = {}) {
  const d = { amount: '', freq: 'month', categoryId: 'salario', label: '', variable: false };
  let error = '';
  const sheet = openSheet({
    title: 'Informar renda',
    key: 'income-form',
    focus: '[data-key="income-amount"]',
    render: () => {
      const amount = h('input', {
        class: 'input input--lg input--money', inputmode: 'decimal', 'data-key': 'income-amount', value: d.amount,
        placeholder: 'Ex.: 3.500', 'aria-label': 'Quanto entra', onInput: (e) => { d.amount = e.target.value; },
      });
      const labelInput = h('input', {
        class: 'input', value: d.label, maxlength: 40, 'data-key': 'income-label', placeholder: 'Ex.: salário da empresa',
        'aria-label': 'Nome (opcional)', onInput: (e) => { d.label = e.target.value; },
      });
      return h('form', {
        class: 'money-form', novalidate: true,
        onSubmit: (e) => { e.preventDefault(); save(e.submitter || document.querySelector('[data-role="save-income"]')); },
      },
      h('p', { class: 'muted' }, 'Serve para o Norte mostrar quanto um plano representa do seu mês. Fica só neste navegador, como o resto dos seus dados.'),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: id(amount, 'income-amount-input') }, d.variable ? 'Quanto costuma entrar por mês?' : 'Quanto entra?'),
        h('div', { class: 'sim__row' }, h('span', { class: 'sim__prefix' }, 'R$'), amount),
        error && h('p', { class: 'field-error' }, error)),
      h('div', { class: 'field' },
        h('span', { class: 'field__label' }, 'Com que frequência?'),
        chipGroup([...FREQS.map((f) => ({ value: f.id, label: f.label })), { value: 'variable', label: 'Minha renda varia' }],
          d.variable ? 'variable' : d.freq,
          (v) => { if (v === 'variable') { d.variable = true; } else { d.variable = false; d.freq = v; } sheet.refresh(); },
          { label: 'Frequência', className: 'chips--lg' }),
        d.variable && h('p', { class: 'field__hint' }, 'O Norte usa este valor como referência para planejar e, quando houver histórico, a média dos meses registrados. Renda futura nunca é tratada como garantida.')),
      h('div', { class: 'field' },
        h('span', { class: 'field__label' }, 'De onde vem?'),
        chipGroup(IN_CATEGORIES.map((c) => ({ value: c.id, label: c.label })), d.categoryId, (v) => { d.categoryId = v; }, { label: 'Tipo', className: 'chips--lg' })),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: id(labelInput, 'income-label-input') }, 'Nome (opcional)'), labelInput),
      h('div', { class: 'form-actions' },
        button('Agora não', { variant: 'ghost', onClick: () => sheet.close() }),
        button('Salvar renda', { variant: 'primary', type: 'submit', icon: 'check', attrs: { 'data-role': 'save-income' } })));
    },
  });

  async function save(btn) {
    const cents = parseMoney(d.amount);
    if (!(cents > 0)) { error = 'Informe um valor maior que zero.'; sheet.refresh(); return; }
    error = '';
    await runWithButton(btn, async () => {
      if (!financeEnabled()) await enableFinance('renda');
      await addRecurring({
        kind: 'in', amountCents: cents, label: d.label || categoryLabel(d.categoryId, 'in'),
        categoryId: d.categoryId, freq: d.variable ? 'month' : d.freq, variable: d.variable,
      });
      sheet.close();
      toast('Renda registrada como previsão do mês.', {
        action: {
          label: 'Registrar a entrada deste mês',
          fn: () => addTransaction({ kind: 'in', amountCents: cents, categoryId: d.categoryId, label: d.label || categoryLabel(d.categoryId, 'in') })
            .then(() => toast('Entrada registrada.')).catch(toastError),
        },
        duration: 9000,
      });
      onDone?.();
    }).catch(toastError);
  }
  return sheet;
}

/** Previsões que se repetem: entradas e saídas. Confirmar transforma previsão em realizado. */
export function openRecurringSheet() {
  const sheet = openSheet({
    title: 'Entradas e saídas recorrentes',
    key: 'recurring',
    render: () => {
      const items = [...state.recurring.values()].filter((r) => r.active !== false);
      if (!items.length) {
        return h('div', { class: 'empty empty--compact' },
          h('p', { class: 'empty__title' }, 'Nada recorrente por enquanto.'),
          h('p', { class: 'empty__text' }, 'Ao registrar uma movimentação, marque “isso se repete” para ela aparecer aqui como previsão.'),
          h('div', { class: 'empty__actions' }, button('Registrar movimentação', { variant: 'primary', icon: 'plus', onClick: () => { sheet.close(); openMoneyEntry(); } })));
      }
      return h('div', { class: 'recur' },
        h('p', { class: 'muted small' }, 'Estas são previsões. Confirmar cria a movimentação real do mês — assim nada é contado duas vezes.'),
        h('ul', { class: 'recur__list' }, items.map((r) => h('li', { class: 'recur__row' },
          h('div', null,
            h('p', { class: 'recur__name' }, r.label || categoryLabel(r.categoryId, r.kind)),
            h('p', { class: 'meta-muted' }, `${r.kind === 'in' ? 'Entrada' : 'Saída'} · ${FREQS.find((f) => f.id === r.freq)?.label || 'Mensal'}${r.variable ? ' · varia' : ''}`)),
          h('p', { class: ['recur__value', r.kind === 'in' ? 'is-in' : 'is-out'] }, formatMoney(r.amountCents)),
          h('div', { class: 'recur__actions' },
            button('Confirmar este mês', { size: 'sm', onClick: async () => {
              try {
                const t = await addTransaction({ kind: r.kind, amountCents: r.amountCents, categoryId: r.categoryId, label: r.label, nature: r.nature, flex: r.flex, recurringId: r.id });
                toast(`${formatMoney(t.amountCents)} registrados hoje como realizado.`);
                sheet.refresh();
              } catch (err) { toastError(err); }
            } }),
            r.kind === 'out' && button('Criar tarefa para pagar', { size: 'sm', variant: 'ghost', icon: 'plus', onClick: () => {
              sheet.close();
              openTaskForm({
                title: `Pagar ${r.label || categoryLabel(r.categoryId, 'out')}`,
                dueDate: nextDue(r),
              });
            } }),
            button('Remover', { size: 'sm', variant: 'ghost', onClick: async () => {
              try { await removeRecurring(r.id); sheet.refresh(); } catch (err) { toastError(err); }
            } }))))),
        h('div', { class: 'row-actions' },
          button('Registrar movimentação', { icon: 'plus', onClick: () => { sheet.close(); openMoneyEntry(); } })));
    },
  });
  return sheet;
}

/** Próxima data provável de um compromisso recorrente (nunca cria nada sozinho). */
function nextDue(r) {
  if (r.freq !== 'month') return addDays(today(), 7);
  const day = r.dayOfMonth || Number(today().slice(8, 10));
  const d = parseISODate(today());
  const candidate = new Date(d.getFullYear(), d.getMonth(), Math.min(day, 28));
  if (toISODate(candidate) < today()) candidate.setMonth(candidate.getMonth() + 1);
  return toISODate(candidate);
}

function choice(ic, title, desc, onClick) {
  return h('button', { type: 'button', class: 'choice', onClick },
    h('span', { class: 'choice__icon', 'aria-hidden': 'true' }, icon(ic, { size: 20 })),
    h('span', { class: 'choice__text' }, h('span', { class: 'choice__title' }, title), h('span', { class: 'choice__desc' }, desc)),
    icon('chevronRight', { size: 18 }));
}

function id(el, value) { el.id = el.id || value; return el.id; }
