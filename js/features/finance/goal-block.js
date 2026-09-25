/**
 * Bloco financeiro na tela da meta: aparece só quando faz sentido.
 * Sem plano → uma sugestão discreta. Com plano → planejado × realizado do mês.
 */
import { h, add } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { button, sectionHead, progressBar } from '../../ui/components.js';
import { labelWithHelp, HELP } from '../../ui/help.js';
import { toast, toastError } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/sheet.js';
import { state, commit } from '../../core/store.js';
import { formatMoney, formatPercent } from '../../utils/numbers.js';
import { progressOf } from '../../domain/goals.js';
import { incomeMonthly, monthLabel, thisMonth } from '../../domain/money.js';
import { planFor, planAmount, realizedFor, removePlan } from '../../domain/finance-plan.js';
import { openSimulator, savedScenarios } from './simulator.js';
import { goalHint, hintCard } from './hints.js';
import { openProgressLog } from '../progress-log.js';

export function goalFinanceBlock(g) {
  if (g.type !== 'money') return null;
  const plan = planFor(g.id);
  if (!plan) {
    const hint = g.status === 'active' ? hintCard(goalHint(g)) : null;
    const saved = savedScenarios(g.id);
    if (!hint && !saved.length) return null;
    const box = h('section', { class: 'goal-finance' });
    if (hint) add(box, hint);
    if (saved.length) add(box, savedBox(g, saved));
    return box;
  }

  const income = incomeMonthly();
  const planned = planAmount(plan, income);
  const done = realizedFor(g.id, thisMonth());
  const p = progressOf(g);
  const missing = Math.max(0, planned - done);
  const sec = h('section', { class: 'card section goal-plan' },
    sectionHead(labelWithHelp('Plano financeiro', HELP.planoMeta, { className: 'label' }), {
      action: button('Rever caminhos', { size: 'sm', variant: 'ghost', icon: 'lens', onClick: () => openSimulator(g.id) }),
    }),
    h('p', { class: 'goal-plan__main' },
      `Você planejou guardar ${formatMoney(planned)} por mês`,
      plan.mode === 'percent' ? ` (${plan.percent}% da renda registrada)` : '',
      plan.months ? ` · previsão de ${plan.months} ${plan.months === 1 ? 'mês' : 'meses'}` : '',
      '.'),
    h('div', { class: 'goal-plan__month' },
      h('p', null, `Em ${monthLabel(thisMonth())}: `, h('strong', null, formatMoney(done)), ` de ${formatMoney(planned)}`,
        missing > 0 ? ` · faltam ${formatMoney(missing)}` : ' · planejado alcançado'),
      progressBar(planned ? Math.min(1, done / planned) : 0, { key: `plan-${g.id}`, size: 'sm', label: 'Planejado × realizado no mês' })),
    income.has && planned > 0 && h('p', { class: 'muted small' }, `${formatPercent(planned / income.cents)} da renda registrada (${formatMoney(income.cents)} por mês).`),
    p.remaining > 0 && h('div', { class: 'row-actions' },
      button('Registrar aporte', { variant: 'primary', size: 'sm', icon: 'plus', onClick: () => openProgressLog(g.id) }),
      button('Remover plano', { size: 'sm', variant: 'ghost', onClick: async () => {
        const ok = await confirmDialog({ title: 'Remover este plano?', message: 'A meta e o histórico continuam como estão. Só o valor planejado por mês deixa de existir.', confirmLabel: 'Remover' });
        if (ok) removePlan(plan.id).then(() => toast('Plano removido.')).catch(toastError);
      } })));
  const saved = savedScenarios(g.id);
  if (saved.length) add(sec, savedBox(g, saved));
  return sec;
}

function savedBox(g, saved) {
  return h('div', { class: 'goal-plan__saved' },
    h('p', { class: 'sub-label' }, 'Cenários salvos'),
    h('ul', { class: 'scen-chips' }, saved.map((sc) => h('li', null,
      h('button', { type: 'button', class: 'chip', onClick: () => openSimulator(g.id) },
        icon('lens', { size: 14 }), sc.name),
      h('button', {
        type: 'button', class: 'icon-btn icon-btn--subtle', 'aria-label': `Excluir cenário ${sc.name}`,
        onClick: async () => {
          const ok = await confirmDialog({ title: 'Excluir este cenário?', message: `“${sc.name}” é só uma simulação — a meta não muda.`, confirmLabel: 'Excluir', danger: true });
          if (ok) commit({ del: { scenarios: [sc.id] } }).catch(toastError);
        },
      }, icon('x', { size: 14 }))))));
}

export const hasMoneyGoals = () => [...state.goals.values()].some((g) => g.type === 'money' && g.status === 'active');
