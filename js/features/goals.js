/** Página Metas (lista) e detalhe de meta. */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, iconButton, areaTag, progressBar, emptyState, sectionHead, pageHead } from '../ui/components.js';
import { stepLineChart } from '../ui/charts.js';
import { confirmDialog } from '../ui/sheet.js';
import { toast, toastError } from '../ui/toast.js';
import { state, undo } from '../core/store.js';
import { eventsOf } from '../core/events.js';
import { go } from '../core/router.js';
import {
  allGoals, progressOf, goalValueLine, remainingText, milestoneMessage, paceOf, rateText, projectionText,
  addProgress, setCurrentValue, toggleStep, addStep, removeStep, archiveGoal, restoreGoal, deleteGoal,
  MILESTONE_TEXT, formatGoalValue,
} from '../domain/goals.js';
import { tasksForGoal, isOpen, createTask } from '../domain/tasks.js';
import { formatMoney, formatCount, formatPercent, parseMoney, parseNumber } from '../utils/numbers.js';
import { formatMonthYear, formatDayLong, formatDateTime, formatDay, dayKey } from '../utils/dates.js';
import { openGoalForm } from './goal-form.js';
import { taskList } from './task-row.js';

/* ---------- Lista ---------- */

export function goalsView() {
  const goals = allGoals();
  const active = goals.filter((g) => g.status === 'active').sort((a, b) => b.updatedAt - a.updatedAt);
  const done = goals.filter((g) => g.status === 'done').sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  const archived = goals.filter((g) => g.status === 'archived');

  const view = h('div', { class: 'view view--goals' },
    pageHead('Metas', 'O que você está construindo.', button('Nova meta', { variant: 'primary', icon: 'plus', onClick: () => openGoalForm() })));

  if (!goals.length) {
    add(view, emptyState({
      icon: 'target',
      title: 'Nenhuma meta ainda.',
      text: 'Metas são coisas que você quer alcançar com o tempo — juntar um valor, terminar um curso, cumprir as etapas de algo. O sistema acompanha o caminho por você.',
      actions: [button('Criar primeira meta', { variant: 'primary', icon: 'plus', onClick: () => openGoalForm() })],
    }));
    return view;
  }

  if (active.length) add(view, h('div', { class: 'goal-grid' }, active.map(goalCard)));
  else add(view, emptyState({ icon: 'target', title: 'Nenhuma meta em andamento.', text: 'Quando quiser começar algo novo, é só criar.', compact: true }));

  if (done.length) {
    add(view, h('details', { class: 'fold' },
      h('summary', null, sectionHead('Concluídas', { count: done.length, level: 'span' })),
      h('div', { class: 'goal-grid' }, done.map(goalCard))));
  }
  if (archived.length) {
    add(view, h('details', { class: 'fold' },
      h('summary', null, sectionHead('Arquivadas', { count: archived.length, level: 'span' })),
      h('div', { class: 'goal-grid' }, archived.map(goalCard))));
  }
  return view;
}

export function goalCard(g) {
  const p = progressOf(g);
  const pace = paceOf(g);
  let hint = null;
  if (g.status === 'done') hint = `Concluída${g.completedAt ? ` em ${formatDay(dayKey(g.completedAt))}` : ''}.`;
  else if (g.status === 'archived') hint = 'Arquivada.';
  else if (pace?.datePassed) hint = 'A data escolhida já passou.';
  else if (pace?.offPace) hint = `Abaixo do ritmo: precisa de ${rateText(g, pace.neededPerDay)}.`;
  else if (pace?.avgPerDay > 0) hint = `Ritmo recente: ${rateText(g, pace.avgPerDay)}.`;
  else if (g.type === 'steps' && p.remaining > 0) hint = `Próxima: ${g.steps.find((s) => !s.done)?.title}`;
  else hint = milestoneMessage(g);

  return h('a', { class: ['goal-card', g.status !== 'active' && 'is-muted'], href: `#/metas/${g.id}` },
    h('div', { class: 'goal-card__top' }, areaTag(g.areaId) || h('span'), g.targetDate && h('span', { class: 'meta-muted' }, `até ${formatMonthYear(g.targetDate)}`)),
    h('h3', { class: 'goal-card__title' }, g.title),
    h('p', { class: 'goal-card__value' }, goalValueLine(g)),
    progressBar(p.ratio, { key: `goal-${g.id}`, label: `Progresso de ${g.title}`, tone: pace?.offPace || pace?.datePassed ? 'warn' : null }),
    h('div', { class: 'goal-card__foot' },
      h('span', { class: 'goal-card__pct' }, formatPercent(p.ratio)),
      h('span', { class: ['goal-card__hint', (pace?.offPace || pace?.datePassed) && 'is-warn'] }, hint)));
}

/* ---------- Detalhe ---------- */

const formState = { goalId: null, mode: null };

export function goalDetailView(route) {
  const g = state.goals.get(route.param);
  if (!g) {
    return h('div', { class: 'view' }, emptyState({
      icon: 'target', title: 'Esta meta não existe mais.', text: 'Ela pode ter sido excluída.',
      actions: [button('Ver metas', { onClick: () => go('metas') })],
    }));
  }
  if (formState.goalId !== g.id) { formState.goalId = g.id; formState.mode = null; }
  const p = progressOf(g);

  const view = h('div', { class: 'view view--goal' },
    h('a', { class: 'back-link', href: '#/metas' }, icon('chevronLeft', { size: 16 }), 'Metas'));

  add(view, h('header', { class: 'goal-hero' },
    h('div', { class: 'goal-hero__meta' }, areaTag(g.areaId, { link: true }),
      g.targetDate && h('span', { class: 'meta-muted' }, `até ${formatDayLong(g.targetDate)}`),
      g.status === 'done' && h('span', { class: 'pill pill--ok' }, icon('check', { size: 12 }), 'concluída'),
      g.status === 'archived' && h('span', { class: 'pill' }, 'arquivada')),
    h('h1', { class: 'page-title' }, g.title),
    h('div', { class: 'goal-hero__numbers' },
      h('span', { class: 'goal-hero__current' }, g.type === 'steps' ? `${p.current}/${p.target}` : formatGoalValue(g, p.current)),
      h('span', { class: 'goal-hero__target' }, g.type === 'steps' ? 'etapas' : `de ${formatGoalValue(g, p.target)}`)),
    progressBar(p.ratio, { key: `goal-${g.id}`, label: `Progresso de ${g.title}`, size: 'lg' }),
    h('div', { class: 'goal-hero__foot' },
      h('strong', null, formatPercent(p.ratio)),
      h('span', null, p.remaining > 0 ? remainingText(g) : 'Nada falta.'),
      h('span', { class: 'goal-hero__milestone' }, milestoneMessage(g)))));

  if (g.status !== 'archived') add(view, progressControls(g));
  if (g.type !== 'steps') add(view, paceSection(g));
  if (g.type !== 'steps') {
    const chart = historyChart(g);
    if (chart) add(view, h('section', { class: 'card section' }, sectionHead('Evolução'), chart));
  }
  add(view, linkedTasks(g), historySection(g), manageSection(g));
  return view;
}

function progressControls(g) {
  if (g.type === 'steps') return stepsSection(g);
  const isMoney = g.type === 'money';
  const box = h('section', { class: 'card section progress-controls' }, sectionHead('Adicionar progresso'));
  const modes = isMoney
    ? [['add', 'Adicionar aporte', 'plus'], ['withdraw', 'Retirada', 'arrowLeft'], ['set', 'Corrigir valor', 'edit']]
    : [['add', 'Adicionar', 'plus'], ['set', 'Corrigir valor', 'edit']];

  const buttons = h('div', { class: 'row-actions' });
  if (!isMoney) add(buttons, button(`+1${g.unit ? ` ${g.unit.replace(/s$/, '')}` : ''}`, { variant: 'primary', onClick: () => submitProgress(g, 'add', 1) }));
  for (const [mode, label, ic] of modes) {
    add(buttons, button(label, {
      variant: formState.mode === mode ? 'selected' : isMoney && mode === 'add' && !formState.mode ? 'primary' : 'secondary',
      icon: ic,
      attrs: { 'aria-expanded': String(formState.mode === mode) },
      onClick: () => { formState.mode = formState.mode === mode ? null : mode; rerenderSoon(); },
    }));
  }
  add(box, buttons);

  if (formState.mode) {
    const labelText = {
      add: isMoney ? 'Quanto você adicionou?' : 'Quanto você avançou?',
      withdraw: 'Quanto saiu?',
      set: isMoney ? 'Qual o valor correto hoje?' : 'Qual a quantidade correta hoje?',
    }[formState.mode];
    const amount = h('input', { class: 'input', inputmode: 'decimal', 'data-key': `amount-${g.id}`, id: `amount-${g.id}`, placeholder: isMoney ? '0,00' : '0', autocomplete: 'off' });
    const note = h('input', { class: 'input', 'data-key': `note-${g.id}`, placeholder: 'Observação (opcional)', maxlength: 140, 'aria-label': 'Observação' });
    const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
    add(box, h('form', {
      class: 'inline-form',
      onSubmit: (e) => {
        e.preventDefault();
        const v = isMoney ? parseMoney(amount.value) : parseNumber(amount.value);
        if (v == null || v < 0 || (formState.mode !== 'set' && v === 0)) {
          err.hidden = false;
          err.textContent = isMoney ? 'Não entendi o valor. Exemplos: 500 · 1.250,50' : 'Informe um número.';
          amount.focus();
          return;
        }
        submitProgress(g, formState.mode, v, note.value.trim());
      },
    },
    h('label', { class: 'field__label', for: amount.id }, labelText),
    h('div', { class: 'inline-form__row' },
      isMoney ? h('div', { class: 'input-affix' }, h('span', { class: 'input-affix__prefix', 'aria-hidden': 'true' }, 'R$'), amount) : amount,
      note,
      button('Salvar', { variant: 'primary', type: 'submit' })),
    err));
    requestAnimationFrame(() => { if (!box.contains(document.activeElement)) amount.focus({ preventScroll: true }); });
  }
  return box;
}

let rerenderTimer;
function rerenderSoon() {
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => window.dispatchEvent(new CustomEvent('app:rerender')), 0);
}

async function submitProgress(g, mode, value, note = '') {
  try {
    let res;
    if (mode === 'set') res = await setCurrentValue(g.id, value, note);
    else res = await addProgress(g.id, mode === 'withdraw' ? -value : value, { kind: mode, note });
    formState.mode = null;
    rerenderSoon();
    if (!res) { toast('O valor já era esse.'); return; }
    const delta = res.goal.currentValue - g.currentValue;
    const sign = delta >= 0 ? '+' : '−';
    const amountText = g.type === 'money' ? formatMoney(Math.abs(delta)) : formatCount(Math.abs(delta));
    const top = res.crossed.length ? Math.max(...res.crossed) : null;
    const msg = res.completed ? `${MILESTONE_TEXT[100]} “${g.title}” chegou lá.` : `${sign} ${amountText}${top ? ` · ${MILESTONE_TEXT[top]}` : ''}`;
    toast(msg, { tone: top || res.completed ? 'good' : null, action: { label: 'Desfazer', fn: () => undo(res.undo) } });
  } catch (err) { toastError(err); }
}

function stepsSection(g) {
  const addInput = h('input', { class: 'input', 'data-key': `add-step-${g.id}`, placeholder: 'Nova etapa', maxlength: 200, 'aria-label': 'Nova etapa' });
  return h('section', { class: 'card section' },
    sectionHead('Etapas'),
    h('ol', { class: 'steps' }, g.steps.map((st, i) => h('li', { class: ['step', st.done && 'is-done'] },
      h('button', {
        type: 'button', class: 'check', 'aria-pressed': String(st.done), 'data-key': `step-${st.id}`,
        'aria-label': st.done ? `Desmarcar: ${st.title}` : `Marcar como feita: ${st.title}`,
        onClick: async () => {
          try {
            const res = await toggleStep(g.id, st.id);
            const top = res?.crossed?.length ? Math.max(...res.crossed) : null;
            if (res?.completed) toast(`${MILESTONE_TEXT[100]} “${g.title}” chegou lá.`, { tone: 'good', action: { label: 'Desfazer', fn: () => undo(res.undo) } });
            else if (top) toast(MILESTONE_TEXT[top], { tone: 'good' });
          } catch (err) { toastError(err); }
        },
      }, icon('check', { size: 14 })),
      h('span', { class: 'step__num', 'aria-hidden': 'true' }, i + 1),
      h('span', { class: 'step__title' }, st.title),
      st.doneAt && h('span', { class: 'meta-muted' }, formatDay(dayKey(st.doneAt))),
      iconButton('x', `Remover etapa: ${st.title}`, async () => {
        if (await confirmDialog({ title: 'Remover esta etapa?', message: st.title, confirmLabel: 'Remover', danger: true })) removeStep(g.id, st.id).catch(toastError);
      }, { class: 'icon-btn icon-btn--subtle' })))),
    h('form', {
      class: 'inline-form inline-form--row',
      onSubmit: (e) => { e.preventDefault(); const v = addInput.value; addInput.value = ''; addStep(g.id, v).catch(toastError); },
    }, addInput, button('Adicionar', { type: 'submit', icon: 'plus' })));
}

function paceSection(g) {
  const pace = paceOf(g);
  const p = progressOf(g);
  const lines = [];
  if (g.status === 'done') lines.push('Meta concluída. O histórico continua disponível abaixo.');
  else if (g.status === 'archived') lines.push('Meta arquivada. Restaure para voltar a acompanhar.');
  else if (pace) {
    if (pace.datePassed) lines.push(`A data escolhida (${formatDayLong(g.targetDate)}) já passou. Você pode escolher uma nova data em “Editar”.`);
    else if (pace.neededPerDay != null) {
      lines.push(pace.daysLeft < 45
        ? `Para chegar a ${formatGoalValue(g, p.target)} até ${formatDayLong(g.targetDate)}, faltam ${formatGoalValue(g, p.remaining)} em ${pace.daysLeft} dias.`
        : `Para chegar a ${formatGoalValue(g, p.target)} até ${formatMonthYear(g.targetDate)}, seriam necessários aproximadamente ${rateText(g, pace.neededPerDay)}.`);
    }
    if (pace.insufficient) lines.push('Ainda não há histórico suficiente para estimar um ritmo. Com algumas semanas de registros, a estimativa aparece aqui.');
    else if (pace.avgPerDay <= 0) lines.push(`Nos últimos ${pace.windowDays} dias não houve avanço líquido.`);
    else {
      lines.push(`Sua média nos últimos ${pace.windowDays >= 85 ? '3 meses' : `${pace.windowDays} dias`} foi de ${rateText(g, pace.avgPerDay)}.`);
      const proj = projectionText(pace);
      if (proj) lines.push(proj);
    }
  }
  const tone = pace?.offPace || pace?.datePassed ? 'warn' : null;
  return h('section', { class: ['card section pace', tone && `pace--${tone}`] },
    sectionHead('Ritmo'),
    lines.map((l) => h('p', null, l)),
    pace?.offPace && h('p', { class: 'pace__note' }, icon('alert', { size: 14 }), 'No ritmo atual, a data escolhida fica apertada. Estimativas mudam conforme você registra.'));
}

function historyChart(g) {
  const evs = eventsOf(g.id).filter((e) => e.type === 'goal.progress');
  const initial = eventsOf(g.id).find((e) => e.type === 'goal.created')?.metadata?.initial || 0;
  if (!evs.length) return null;
  const points = [{ t: g.createdAt, v: initial }, ...evs.map((e) => ({ t: e.createdAt, v: e.metadata.after }))];
  const chart = stepLineChart(points, { target: progressOf(g).target, label: `Evolução de ${g.title}: de ${formatGoalValue(g, initial)} para ${formatGoalValue(g, g.currentValue)}.` });
  return h('div', null, chart,
    h('div', { class: 'linechart__axis' }, h('span', null, formatDay(dayKey(g.createdAt))), h('span', { class: 'legend legend--target' }, 'linha tracejada = meta'), h('span', null, 'hoje')));
}

function linkedTasks(g) {
  const tasks = tasksForGoal(g.id);
  const open = tasks.filter(isOpen);
  const input = h('input', { class: 'input', 'data-key': `goal-task-${g.id}`, placeholder: 'Próximo passo para esta meta', maxlength: 300, 'aria-label': 'Nova tarefa para esta meta' });
  return h('section', { class: 'card section' },
    sectionHead('Tarefas desta meta', { count: open.length || null }),
    open.length ? taskList(open, { showArea: false }) : h('p', { class: 'muted small' }, 'Nenhuma tarefa ligada. Qual é o próximo passo concreto?'),
    g.status === 'active' && h('form', {
      class: 'inline-form inline-form--row',
      onSubmit: async (e) => {
        e.preventDefault();
        const title = input.value.trim();
        if (!title) return;
        input.value = '';
        try { await createTask({ title, goalId: g.id, areaId: g.areaId }); toast('Tarefa criada.'); } catch (err) { toastError(err); }
      },
    }, input, button('Adicionar', { type: 'submit', icon: 'plus' })));
}

function describeEvent(g, e) {
  const m = e.metadata || {};
  const fmt = (v) => (g.type === 'money' ? formatMoney(Math.abs(v)) : formatCount(Math.abs(v)));
  switch (e.type) {
    case 'goal.created': return m.initial ? `Criada com ${formatGoalValue(g, m.initial)}` : 'Criada';
    case 'goal.progress':
      if (m.kind === 'correction') return `Correção: ${m.delta >= 0 ? '+' : '−'} ${fmt(m.delta)} (${formatGoalValue(g, m.before)} → ${formatGoalValue(g, m.after)})`;
      if (m.kind === 'withdraw') return `Retirada: − ${fmt(m.delta)}`;
      return `+ ${fmt(m.delta)}`;
    case 'goal.step': return m.done ? `Etapa feita: ${m.title}` : `Etapa desmarcada: ${m.title}`;
    case 'goal.milestone': return `Marco de ${m.pct}% atingido`;
    case 'goal.completed': return 'Meta concluída';
    case 'goal.reopened': return 'Voltou para em andamento';
    case 'goal.archived': return 'Arquivada';
    case 'goal.restored': return 'Restaurada';
    case 'goal.edited': return m.added ? `Etapa adicionada: ${m.added}` : m.removed ? `Etapa removida: ${m.removed}` : 'Editada';
    default: return e.type;
  }
}

function historySection(g) {
  const evs = eventsOf(g.id).slice().reverse();
  return h('section', { class: 'card section' },
    sectionHead('Histórico', { count: evs.length }),
    h('ol', { class: 'timeline timeline--goal' }, evs.slice(0, 50).map((e) => h('li', { class: e.type === 'goal.milestone' || e.type === 'goal.completed' ? 'is-mark' : null },
      h('span', { class: 'timeline__text' }, describeEvent(g, e), e.metadata?.note && h('span', { class: 'meta-muted' }, ` — ${e.metadata.note}`)),
      h('time', { class: 'timeline__time', datetime: new Date(e.createdAt).toISOString() }, formatDateTime(e.createdAt))))),
    evs.length > 50 && h('p', { class: 'muted small' }, `Mostrando os 50 registros mais recentes de ${evs.length}.`));
}

function manageSection(g) {
  return h('section', { class: 'manage' },
    button('Editar', { variant: 'ghost', icon: 'edit', onClick: () => openGoalForm({ goalId: g.id }) }),
    g.status === 'archived'
      ? button('Restaurar', { variant: 'ghost', icon: 'undo', onClick: () => restoreGoal(g.id).catch(toastError) })
      : button('Arquivar', {
        variant: 'ghost', icon: 'archive',
        onClick: async () => { const token = await archiveGoal(g.id); toast('Meta arquivada. Ela sai da lista, mas o histórico fica.', { action: { label: 'Desfazer', fn: () => undo(token) } }); },
      }),
    button('Excluir', {
      variant: 'ghost-danger', icon: 'trash',
      onClick: async () => {
        const ok = await confirmDialog({ title: 'Excluir esta meta?', message: 'Todo o progresso registrado deixa de aparecer. Se só quer tirá-la da frente, prefira “Arquivar”.', confirmLabel: 'Excluir', danger: true });
        if (!ok) return;
        const token = await deleteGoal(g.id);
        go('metas');
        toast('Meta excluída.', { action: { label: 'Desfazer', fn: () => undo(token) } });
      },
    }));
}
