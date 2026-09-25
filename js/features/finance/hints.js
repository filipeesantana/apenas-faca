/**
 * Sugestões contextuais: o Norte mostra a próxima possibilidade, não todas.
 * Regra: no máximo uma por tela, sempre com "Agora não" — e quem dispensa não vê de novo tão cedo.
 */
import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { button } from '../../ui/components.js';
import { toastError } from '../../ui/toast.js';
import { state } from '../../core/store.js';
import { formatMoney } from '../../utils/numbers.js';
import { activeGoals, progressOf } from '../../domain/goals.js';
import { incomeMonthly, monthSummary, thisMonth, hasExpenses, adjustableCategories, dismissHint, hintDismissed, financeEnabled } from '../../domain/money.js';
import { plansStatus, plannedTotal, hasPlans } from '../../domain/finance-plan.js';
import { openSimulator } from './simulator.js';
import { openIncomeForm } from './money-form.js';
import { openProgressLog } from '../progress-log.js';

const moneyGoals = () => activeGoals().filter((g) => g.type === 'money' && progressOf(g).remaining > 0);

/** Lista priorizada de sugestões válidas agora (a tela usa a primeira). */
export function financeHints() {
  if (!financeEnabled()) return [];
  const out = [];
  const income = incomeMonthly();
  const s = monthSummary(thisMonth());
  const goals = moneyGoals();
  const planned = plannedTotal();
  const available = income.has ? income.cents - s.spent : null;

  // O plano pede mais do que o disponível registrado.
  if (planned > 0 && available != null && planned > available && income.has) {
    const diff = planned - available;
    const goal = plansStatus()[0]?.goal;
    out.push({
      key: 'plano-acima',
      title: `Seu plano pede cerca de ${formatMoney(diff)} a mais por mês do que o valor disponível registrado.`,
      line: `Planejado para metas: ${formatMoney(planned)} · disponível neste mês: ${formatMoney(Math.max(0, available))}.`,
      actions: [goal && { label: 'Simular caminhos', primary: true, run: () => openSimulator(goal.id) }].filter(Boolean),
    });
  }

  // Renda informada + meta de dinheiro sem plano.
  if (income.has && goals.length && !hasPlans()) {
    out.push({
      key: 'renda-plano',
      title: 'Agora que sua renda está registrada, o Norte pode mostrar quanto uma meta representa do seu mês.',
      line: `Renda de referência: ${formatMoney(income.cents)} por mês.`,
      actions: [{ label: 'Ver caminhos', primary: true, run: () => openSimulator(goals[0].id) }],
    });
  }

  // Gastos marcados como ajustáveis pelo próprio usuário.
  const adj = adjustableCategories();
  if (adj.length && goals.length) {
    const total = adj.reduce((a, c) => a + c.avgMonth, 0);
    out.push({
      key: 'ajustaveis',
      title: `Você indicou margem para ajuste em ${adj.length === 1 ? 'uma categoria' : `${adj.length} categorias`}.`,
      line: `Média somada: ${formatMoney(total)} por mês. Dá para simular uma redução e ver o efeito numa meta — sem mudar nada de verdade.`,
      actions: [{ label: 'Simular ajuste', primary: true, run: () => openSimulator(goals[0].id) }],
    });
  }

  // Gastos registrados, renda desconhecida.
  if (!income.has && hasExpenses()) {
    out.push({
      key: 'sem-renda',
      title: 'Informar sua renda permite ver quanto cada gasto e cada meta representam do mês.',
      line: 'Fica só neste navegador, como o resto dos seus dados.',
      actions: [{ label: 'Informar renda', primary: true, run: () => openIncomeForm() }],
    });
  }

  // Contribuição abaixo do plano no mês.
  for (const p of plansStatus()) {
    if (p.planned > 0 && p.missing > 0 && p.done > 0) {
      out.push({
        key: `abaixo:${p.goal.id}`,
        title: `Sua contribuição para “${p.goal.title}” está ${formatMoney(p.missing)} abaixo do planejado neste mês.`,
        line: `Planejado: ${formatMoney(p.planned)} · registrado: ${formatMoney(p.done)}.`,
        actions: [
          { label: 'Registrar aporte', primary: true, run: () => openProgressLog(p.goal.id) },
          { label: 'Rever plano', run: () => openSimulator(p.goal.id) },
        ],
      });
      break;
    }
  }

  return out.filter((x) => !hintDismissed(x.key));
}

/** Sugestão para uma meta específica (tela da meta). */
export function goalHint(goal) {
  if (goal.type !== 'money' || goal.status !== 'active') return null;
  const income = incomeMonthly();
  const p = progressOf(goal);
  if (p.remaining <= 0) return null;
  const has = state.plans && [...state.plans.values()].some((x) => x.goalId === goal.id);
  if (has) return null;
  const key = `planejar:${goal.id}`;
  if (hintDismissed(key)) return null;
  return {
    key,
    title: 'Quer planejar como chegar lá?',
    line: `Faltam ${formatMoney(p.remaining)}. Dá para ver quanto por mês e em quanto tempo você chegaria lá${income.has ? ', e quanto isso representa da sua renda' : ''}.`,
    actions: [{ label: 'Simular caminho', primary: true, run: () => openSimulator(goal.id) }],
  };
}

/** Cartão discreto: nunca mais de um por tela. */
export function hintCard(hint) {
  if (!hint) return null;
  const card = h('div', { class: 'hint' },
    h('span', { class: 'hint__icon', 'aria-hidden': 'true' }, icon('spark', { size: 16 })),
    h('div', { class: 'hint__text' },
      h('p', { class: 'hint__title' }, hint.title),
      hint.line && h('p', { class: 'hint__line' }, hint.line),
      h('div', { class: 'hint__actions' },
        hint.actions.map((a) => button(a.label, { size: 'sm', variant: a.primary ? 'primary' : 'ghost', onClick: () => a.run() })),
        button('Agora não', { size: 'sm', variant: 'ghost', onClick: () => { card.remove(); dismissHint(hint.key).catch(toastError); } }))));
  return card;
}
