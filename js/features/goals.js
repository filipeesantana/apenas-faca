/**
 * Metas: lista e detalhe.
 * O detalhe reúne tudo sobre um objetivo numa só tela:
 * situação → próximo passo → registrar progresso → como chegar lá (cenários) → projeção → histórico.
 */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, iconButton, areaTag, progressBar, emptyState, sectionHead, pageHead, chipGroup } from '../ui/components.js';
import { projectionChart, scenarioList } from '../ui/charts.js';
import { labelWithHelp, helpTip, entenda, HELP } from '../ui/help.js';
import { confirmDialog } from '../ui/sheet.js';
import { toast, toastError } from '../ui/toast.js';
import { state, undo } from '../core/store.js';
import { eventsOf } from '../core/events.js';
import { go } from '../core/router.js';
import {
  allGoals, progressOf, goalValueLine, remainingText, milestoneMessage, paceOf, formatGoalValue,
  toggleStep, addStep, removeStep, archiveGoal, restoreGoal, deleteGoal, updateGoal, lastMovementAt, GOAL_TYPES,
} from '../domain/goals.js';
import { adapterFor, horizonEnd, requiredRate, horizonScenarios, paceScenarios, timeToFinish, paceInputFor, rateText, projectionModel } from '../domain/planning.js';
import { tasksForGoal, isOpen, nextStepOf } from '../domain/tasks.js';
import { formatPercent, formatMoney, parseMoney, parseNumber, formatMinutes } from '../utils/numbers.js';
import { formatMonthYear, formatDayLong, formatDateTime, formatDay, formatMonthShort, dayKey, daysSince, today, DAY } from '../utils/dates.js';
import { pickCopy } from '../content/microcopy.js';
import { openGoalForm } from './goal-form.js';
import { openTaskForm } from './task-form.js';
import { taskRow, taskList } from './task-row.js';
import { progressEntry, progressFeedback } from './progress-log.js';

/* ======================= Lista ======================= */

const isIdle = (g) => {
  const last = lastMovementAt(g);
  return Date.now() - g.createdAt > 14 * DAY && !tasksForGoal(g.id).some(isOpen) && (!last || daysSince(last) > 30);
};

export function goalsView(route) {
  const goals = allGoals();
  const filterIdle = route.query.f === 'paradas';
  let active = goals.filter((g) => g.status === 'active').sort((a, b) => b.updatedAt - a.updatedAt);
  if (filterIdle) active = active.filter(isIdle);
  const done = goals.filter((g) => g.status === 'done').sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  const archived = goals.filter((g) => g.status === 'archived');
  const stalled = goals.some((g) => g.status === 'active' && isIdle(g));

  const view = h('div', { class: 'view view--goals' },
    pageHead(labelWithHelp('Metas', HELP.meta, { className: '' }), pickCopy('goals', [!goals.length ? 'empty' : stalled ? 'stalled' : 'any']),
      button('Nova meta', { variant: 'primary', icon: 'plus', onClick: () => openGoalForm() })));

  if (!goals.length) {
    add(view, emptyState({
      icon: 'target', title: 'Nenhuma meta ainda.', text: pickCopy('emptyGoals'),
      actions: [button('Criar meta', { variant: 'primary', icon: 'plus', onClick: () => openGoalForm() })],
    }));
    return view;
  }
  if (filterIdle) {
    add(view, h('div', { class: 'filter-banner' },
      h('span', null, 'Mostrando: ', h('strong', null, 'metas sem tarefas nem progresso há mais de 30 dias')),
      button('Ver todas', { variant: 'ghost', size: 'sm', icon: 'x', onClick: () => go('metas') })));
  }
  add(view, active.length
    ? h('ul', { class: 'goal-list' }, active.map((g) => h('li', null, goalRow(g))))
    : emptyState({ icon: 'target', title: filterIdle ? 'Nenhuma meta parada.' : 'Nenhuma meta em andamento.', text: filterIdle ? 'Todas as metas ativas têm movimento recente ou um próximo passo.' : 'Quando quiser começar algo novo, é só criar.', compact: true }));

  for (const [label, list] of [['Concluídas', done], ['Arquivadas', archived]]) {
    if (!list.length) continue;
    add(view, h('details', { class: 'fold' },
      h('summary', null, sectionHead(label, { count: list.length, level: 'span' })),
      h('ul', { class: 'goal-list' }, list.map((g) => h('li', null, goalRow(g))))));
  }
  return view;
}

/** Linha de meta: nome, valores, barra, próximo passo e situação do ritmo. */
export function goalRow(g, { compact = false } = {}) {
  const p = progressOf(g);
  const pace = paceOf(g);
  const next = g.status === 'active' ? nextStepOf(g.id) : null;
  const warn = pace?.offPace || pace?.datePassed;
  let status = null;
  if (g.status === 'done') status = `Concluída${g.completedAt ? ` em ${formatDay(dayKey(g.completedAt))}` : ''}`;
  else if (g.status === 'archived') status = 'Arquivada';
  else if (pace?.datePassed) status = 'A data escolhida já passou';
  else if (pace?.offPace) status = `Abaixo do ritmo · precisa de ${rateText(g, pace.neededPerDay)}`;
  else if (pace?.neededPerDay != null) status = `Precisa de ${rateText(g, pace.neededPerDay)} até ${formatMonthShort(g.targetDate)}`;
  else if (pace?.recent?.perDay > 0) status = `Ritmo recente: ${rateText(g, pace.recent.perDay)}`;

  return h('a', { class: ['goal-row', compact && 'is-compact', g.status !== 'active' && 'is-muted'], href: `#/metas/${g.id}` },
    h('div', { class: 'goal-row__head' },
      h('span', { class: 'goal-row__title' }, g.title),
      h('span', { class: 'goal-row__pct' }, formatPercent(p.ratio))),
    h('div', { class: 'goal-row__value' }, h('span', null, goalValueLine(g)), areaTag(g.areaId)),
    progressBar(p.ratio, { key: `goal-${g.id}`, size: compact ? 'sm' : null, label: `Progresso de ${g.title}`, tone: warn ? 'warn' : null }),
    (next || status || (g.status === 'active' && !compact)) && h('div', { class: 'goal-row__foot' },
      g.status === 'active' && h('span', { class: ['goal-row__next', !next && 'is-missing'] }, icon(next ? 'arrowRight' : 'info', { size: 13 }), next ? `Próximo passo: ${next.title}` : 'Sem próximo passo definido'),
      status && h('span', { class: ['goal-row__status', warn && 'is-warn'] }, status)));
}

/* ======================= Detalhe ======================= */

const ui = { goalId: null, horizon: null, customDate: '', customPace: '' };

export function goalDetailView(route) {
  const g = state.goals.get(route.param);
  if (!g) {
    return h('div', { class: 'view' }, emptyState({ icon: 'target', title: 'Esta meta não existe mais.', text: 'Ela pode ter sido excluída.', actions: [button('Ver metas', { onClick: () => go('metas') })] }));
  }
  if (ui.goalId !== g.id) Object.assign(ui, { goalId: g.id, horizon: null, customDate: '', customPace: '' });
  const p = progressOf(g);
  const active = g.status === 'active';

  const view = h('div', { class: 'view view--wide view--goal' },
    h('a', { class: 'back-link', href: '#/metas' }, icon('chevronLeft', { size: 16 }), 'Metas'));

  add(view, h('header', { class: 'goal-head' },
    h('div', { class: 'goal-head__meta' },
      h('span', { class: 'type-tag' }, icon(GOAL_TYPES[g.type].icon, { size: 13 }), GOAL_TYPES[g.type].label),
      areaTag(g.areaId, { link: true }),
      g.targetDate && h('span', { class: 'meta-muted' }, `até ${formatDayLong(g.targetDate)}`),
      g.status === 'done' && h('span', { class: 'pill pill--ok' }, icon('check', { size: 12 }), 'concluída'),
      g.status === 'archived' && h('span', { class: 'pill' }, 'arquivada')),
    h('div', { class: 'goal-head__row' },
      h('h1', { class: 'page-title' }, g.title),
      active && g.type !== 'steps' && button('Registrar progresso', {
        variant: 'primary', icon: 'plus',
        onClick: () => {
          const box = document.getElementById('registrar');
          box?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
          box?.classList.remove('is-pulse'); void box?.offsetWidth; box?.classList.add('is-pulse');
          setTimeout(() => box?.querySelector('input:not([type=hidden])')?.focus({ preventScroll: true }), 250);
        },
      }),
      active && g.type === 'steps' && button('Marcar etapa', { variant: 'primary', icon: 'check', onClick: () => document.querySelector('.steps .step:not(.is-done) .check')?.focus() }))));

  const layout = h('div', { class: 'goal-layout' });
  const main = h('div', { class: 'goal-layout__main' });
  const side = h('div', { class: 'goal-layout__side' });
  add(layout, main, side);
  add(view, layout);

  add(main, summaryCard(g, p));
  if (active && g.type !== 'steps') add(main, h('section', { class: 'card section', id: 'registrar' }, sectionHead('Registrar progresso'), progressEntry(g, { compact: true })));
  if (active) add(main, nextStepSection(g));
  if (g.type === 'steps') add(main, stepsSection(g));
  if (g.type !== 'steps') {
    const chart = projectionSection(g);
    if (chart) add(main, chart);
  }
  if (active && p.remaining > 0) add(main, planningSection(g, route.query.ver === 'plano'));

  add(side, historySection(g), manageSection(g));
  return view;
}

/** Últimos valores exibidos por meta: destacam brevemente o que mudou após um registro. */
const shown = new Map();

function summaryCard(g, p) {
  const stats = g.type === 'steps'
    ? [['Etapas', `${p.target}`], ['Concluídas', `${p.current}`], ['Faltam', `${p.remaining}`], ['Progresso', formatPercent(p.ratio)]]
    : [['Objetivo', formatGoalValue(g, p.target)], [g.type === 'money' ? 'Já tenho' : 'Feito', formatGoalValue(g, p.current)], ['Faltam', p.remaining > 0 ? formatGoalValue(g, p.remaining) : '—'], ['Progresso', formatPercent(p.ratio)]];
  const prev = shown.get(g.id);
  shown.set(g.id, stats.map((x) => x[1]));
  return h('section', { class: ['card goal-summary', g.status === 'done' && 'is-complete'] },
    g.status === 'done' && h('p', { class: 'goal-summary__done' }, icon('check', { size: 16 }), `Meta concluída${g.completedAt ? ` em ${formatDay(dayKey(g.completedAt), { withYear: true })}` : ''}.`),
    h('dl', { class: 'kv' }, stats.map(([k, v], i) => h('div', { class: ['kv__item', i === 3 && 'kv__item--accent', prev && prev[i] !== v && 'is-updated'] }, h('dt', null, k), h('dd', null, v)))),
    progressBar(p.ratio, { key: `goal-${g.id}`, size: 'lg', label: `Progresso de ${g.title}: ${formatPercent(p.ratio)}` }),
    h('p', { class: 'goal-summary__note' }, milestoneMessage(g), p.remaining > 0 && g.type !== 'steps' ? ` ${remainingText(g)}.` : ''));
}

function nextStepSection(g) {
  const next = nextStepOf(g.id);
  const others = tasksForGoal(g.id).filter((t) => isOpen(t) && t.id !== next?.id);
  const sec = h('section', { class: 'card section next-step' },
    sectionHead(labelWithHelp('Próximo passo', HELP.proximoPasso, { className: 'label' }),
      { action: next ? button('Outra tarefa', { variant: 'ghost', size: 'sm', icon: 'plus', onClick: () => openTaskForm({ goalId: g.id, areaId: g.areaId }) }) : null }));
  if (next) {
    add(sec, h('ul', { class: 'task-list' }, taskRow(next, { showGoal: false, showArea: false })));
  } else {
    add(sec, h('div', { class: 'next-step__empty' },
      h('p', null, pickCopy('nextStep')),
      h('p', { class: 'muted small' }, g.type === 'money' ? 'Ex.: “Separar R$ 600 neste mês”.' : g.type === 'time' ? 'Ex.: “Estudar 40 minutos na terça”.' : g.type === 'count' ? 'Ex.: “Assistir a próxima aula”.' : 'Ex.: “Agendar a próxima etapa”.'),
      button('Definir próximo passo', { variant: 'primary', icon: 'plus', onClick: () => openTaskForm({ goalId: g.id, areaId: g.areaId, nextStep: true }) })));
  }
  if (others.length) add(sec, h('p', { class: 'sub-label' }, 'Outras tarefas desta meta'), taskList(others, { showGoal: false, showArea: false }));
  return sec;
}

function stepsSection(g) {
  const input = h('input', { class: 'input', 'data-key': `add-step-${g.id}`, placeholder: 'Nova etapa', maxlength: 200, 'aria-label': 'Nova etapa' });
  return h('section', { class: 'card section' },
    sectionHead('Etapas', { count: `${progressOf(g).current} de ${g.steps.length}` }),
    h('ol', { class: 'steps' }, g.steps.map((st, i) => h('li', { class: ['step', st.done && 'is-done'] },
      h('button', {
        type: 'button', class: 'check', 'aria-pressed': String(st.done), 'data-key': `step-${st.id}`,
        'aria-label': st.done ? `Desmarcar: ${st.title}` : `Marcar como feita: ${st.title}`,
        onClick: async () => { try { const res = await toggleStep(g.id, st.id); if (res && st.done === false) progressFeedback(g, res, 'Etapa concluída'); } catch (err) { toastError(err); } },
      }, icon('check', { size: 14 })),
      h('span', { class: 'step__num', 'aria-hidden': 'true' }, i + 1),
      h('span', { class: 'step__title' }, st.title),
      st.doneAt && h('span', { class: 'meta-muted' }, formatDay(dayKey(st.doneAt))),
      iconButton('x', `Remover etapa: ${st.title}`, async () => {
        if (await confirmDialog({ title: 'Remover esta etapa?', message: st.title, confirmLabel: 'Remover', danger: true })) removeStep(g.id, st.id).catch(toastError);
      }, { class: 'icon-btn icon-btn--subtle' })))),
    g.status !== 'archived' && h('form', { class: 'inline-form inline-form--row', onSubmit: (e) => { e.preventDefault(); const v = input.value; input.value = ''; addStep(g.id, v).catch(toastError); } },
      input, button('Adicionar', { type: 'submit', icon: 'plus' })));
}

/* ---------- Como chegar lá: prazos, ritmos e comparação ---------- */

function selectedEnd(g) {
  if (ui.horizon === 'custom' && ui.customDate) return { endDate: ui.customDate, label: `até ${formatDayLong(ui.customDate)}` };
  const hs = adapterFor(g).horizons;
  const hz = hs.find((x) => x.id === ui.horizon);
  if (hz) return { endDate: horizonEnd(hz), months: hz.months || null, label: `em ${hz.label}`, id: hz.id };
  if (g.targetDate && g.targetDate > today()) {
    const match = hs.find((x) => horizonEnd(x) === g.targetDate);
    return { endDate: g.targetDate, months: match?.months || null, label: match ? `em ${match.label}` : `até ${formatDayLong(g.targetDate)}`, fromGoal: true, id: match?.id };
  }
  const mid = hs[Math.min(2, hs.length - 1)];
  return { endDate: horizonEnd(mid), months: mid.months || null, label: `em ${mid.label}`, id: mid.id };
}

function planningSection(g, focus) {
  const sel = selectedEnd(g);
  const r = requiredRate(g, sel.endDate, sel.months);
  const horizons = adapterFor(g).horizons;
  const pace = paceOf(g);
  const verb = g.type === 'money' ? 'adicionar' : 'avançar';

  const dateInput = h('input', {
    type: 'date', class: 'input input--date', min: today(), value: ui.customDate, 'aria-label': 'Outro prazo',
    onChange: (e) => { ui.customDate = e.target.value; ui.horizon = e.target.value ? 'custom' : null; rerender(); },
  });

  const sec = h('section', { class: ['card section planning', focus && 'is-focus'], id: 'plano' },
    sectionHead('Como posso chegar lá?'),
    h('p', { class: 'muted small' }, 'Escolha um prazo para ver o ritmo necessário.'),
    h('div', { class: 'due-picker' },
      chipGroup(horizons.map((x) => ({ value: x.id, label: x.label })), sel.id || (ui.horizon === 'custom' ? null : null), (v) => { ui.horizon = v; ui.customDate = ''; rerender(); }, { label: 'Prazo' }),
      h('label', { class: 'inline-label' }, 'Outro prazo', dateInput)));

  if (r.primary) {
    add(sec, h('div', { class: 'plan-result', 'aria-live': 'polite' },
      h('p', null, `Para ${g.type === 'money' ? 'atingir' : 'completar'} ${formatGoalValue(g, progressOf(g).target)} ${sel.label}, seria necessário ${verb}:`),
      h('p', { class: 'plan-result__main' }, r.primary),
      r.secondary && h('p', { class: 'plan-result__sub' }, r.secondary),
      pace?.recent && h('p', { class: 'plan-result__cmp' },
        `Sua média recente é de ${rateText(g, pace.recent.perDay)} — ${pace.recent.perDay >= r.perDay * 0.95 ? 'suficiente para esse prazo' : 'abaixo do necessário para esse prazo'}. `,
        helpTip(HELP.mediaRecente, { label: 'Média recente' })),
      !sel.fromGoal && sel.endDate !== g.targetDate && button('Usar este prazo na meta', {
        size: 'sm', icon: 'calendar',
        onClick: async () => { try { await updateGoal(g.id, { targetDate: sel.endDate }); toast(`Prazo da meta: ${formatDayLong(sel.endDate)}.`); } catch (err) { toastError(err); } },
      })));
  } else if (r.invalid) {
    add(sec, h('p', { class: 'form-error' }, 'Escolha uma data no futuro.'));
  }

  // Comparação entre prazos
  const hsc = horizonScenarios(g).filter((x) => x.perDay);
  add(sec, h('h3', { class: 'sub-label' }, 'Comparando prazos'),
    scenarioList(hsc.map((x) => ({ id: x.id, label: x.label, value: x.short, weight: x.perDay })), {
      label: 'Ritmo necessário para cada prazo', selectedId: sel.id,
      onSelect: (row) => { ui.horizon = row.id; ui.customDate = ''; rerender(); },
    }),
    h('p', { class: 'muted small' }, 'Barras maiores indicam um ritmo mais puxado.'));

  // Cenários por ritmo
  const ps = paceScenarios(g);
  const input = paceInputFor(g);
  const custom = customPaceResult(g, input);
  add(sec, h('h3', { class: 'sub-label' }, 'E se eu mantiver um ritmo?'),
    ps.length ? h('ul', { class: 'pace-list' }, ps.map((c) => h('li', null, h('span', null, c.label), h('span', { class: 'pace-list__arrow', 'aria-hidden': 'true' }, '→'), h('strong', null, c.text), h('span', { class: 'meta-muted' }, `(${c.endLabel})`)))) : null,
    h('form', {
      class: 'inline-form inline-form--row', onSubmit: (e) => { e.preventDefault(); rerender(); },
    }, h('label', { class: 'inline-label' }, input.label,
      h('input', { class: 'input input--short', inputmode: 'decimal', 'data-key': `pace-${g.id}`, placeholder: input.placeholder, value: ui.customPace, onInput: (e) => { ui.customPace = e.target.value; } })),
    button('Calcular', { type: 'submit', size: 'sm' })),
    custom && h('p', { class: 'plan-result__custom', 'aria-live': 'polite' }, custom));

  add(sec, entenda('Como esses números são calculados',
    h('p', null, 'Ritmo necessário = quanto falta ÷ tempo até o prazo. Para prazos em meses, o valor mensal é exato (como uma parcela); o semanal é aproximado.'),
    h('p', null, 'A média recente considera os avanços registrados nos últimos até 90 dias, sem contar correções. Ela só aparece depois de pelo menos 3 semanas e 2 registros.'),
    h('p', null, 'São estimativas. Mudam conforme você registra.')));
  return sec;
}

function customPaceResult(g, input) {
  if (!ui.customPace.trim()) return null;
  const raw = input.kind === 'money' ? parseMoney(ui.customPace) : parseNumber(ui.customPace);
  if (!(raw > 0)) return 'Informe um número maior que zero.';
  const res = timeToFinish(g, input.toPerDay(raw));
  if (!res) return null;
  return `Nesse ritmo, levaria ${res.text} — por volta de ${res.endLabel}.`;
}

function rerender() { window.dispatchEvent(new CustomEvent('app:rerender')); }

/* ---------- Projeção ---------- */

function projectionSection(g) {
  const evs = eventsOf(g.id).filter((e) => e.type === 'goal.progress');
  const initial = eventsOf(g.id).find((e) => e.type === 'goal.created')?.metadata?.initial || 0;
  const history = [{ t: g.createdAt, v: initial, start: true }, ...evs.map((e) => ({ t: e.createdAt, v: e.metadata.after, delta: e.metadata.delta, kind: e.metadata.kind }))];
  const pace = paceOf(g);
  const sel = g.status === 'active' && progressOf(g).remaining > 0 ? selectedEnd(g) : null;
  const model = projectionModel(g, { endDate: sel?.endDate, history, recentPerDay: pace?.recent?.perDay || null });
  const fmt = (v) => (g.type === 'money' ? formatMoney(Math.round(v / 100) * 100) : g.type === 'time' ? formatMinutes(v) : formatGoalValue(g, Math.round(v)));
  const lines = [];
  if (sel) lines.push(`A linha tracejada mostra o ritmo necessário para chegar a ${formatGoalValue(g, model.target)} ${sel.label}.`);
  if (pace?.recent?.perDay > 0 && pace.projectionDays) lines.push(`A linha pontilhada usa sua média recente (${rateText(g, pace.recent.perDay)}): nesse ritmo, a meta tende a ser atingida por volta de ${formatMonthYear(new Date(Date.now() + pace.projectionDays * DAY))}.`);
  else if (g.status === 'active' && progressOf(g).remaining > 0) lines.push('Ainda não há histórico suficiente para projetar seu ritmo. Com algumas semanas de registros, a linha do ritmo recente aparece.');
  const label = `Evolução de ${g.title}: ${formatGoalValue(g, model.current)} de ${formatGoalValue(g, model.target)}. ${lines.join(' ')}`;
  return h('section', { class: 'card section' },
    sectionHead(history.length > 1 ? 'Evolução e projeção' : 'Projeção'),
    projectionChart({
      history, model, formatValue: fmt, formatDate: (t) => formatMonthShort(new Date(t)), label,
      pointTip: (pt) => `${formatDay(dayKey(pt.t))} · ${pt.start ? `início: ${formatGoalValue(g, pt.v)}` : `${pt.kind === 'correction' ? 'correção' : pt.delta >= 0 ? `+ ${formatGoalValue(g, pt.delta)}` : `− ${formatGoalValue(g, -pt.delta)}`} (total ${formatGoalValue(g, pt.v)})`}`,
    }),
    history.length > 1 && h('p', { class: 'chart-hint' }, 'Toque ou passe o cursor nos pontos para ver cada registro.'),
    lines.map((l) => h('p', { class: 'chart-note' }, l)),
    h('p', { class: 'chart-note muted' }, 'Projeções são estimativas, não certezas.'));
}

/* ---------- Histórico e gestão ---------- */

function describeEvent(g, e) {
  const m = e.metadata || {};
  const fmt = (v) => formatGoalValue(g, Math.abs(v));
  switch (e.type) {
    case 'goal.created': return m.initial ? `Criada com ${formatGoalValue(g, m.initial)}` : 'Criada';
    case 'goal.progress':
      if (m.kind === 'correction') return `Correção: ${formatGoalValue(g, m.before)} → ${formatGoalValue(g, m.after)}`;
      if (m.kind === 'withdraw') return `Retirada: − ${fmt(m.delta)}`;
      return `+ ${fmt(m.delta)}${m.taskId ? ' (tarefa concluída)' : ''}`;
    case 'goal.step': return m.done ? `Etapa feita: ${m.title}` : `Etapa desmarcada: ${m.title}`;
    case 'goal.milestone': return `Marco de ${m.pct}% atingido`;
    case 'goal.completed': return 'Meta concluída';
    case 'goal.reopened': return 'Voltou para em andamento';
    case 'goal.archived': return 'Arquivada';
    case 'goal.restored': return 'Restaurada';
    case 'goal.edited': return m.added ? `Etapa adicionada: ${m.added}` : m.removed ? `Etapa removida: ${m.removed}` : (m.fields || []).includes('targetDate') ? 'Prazo alterado' : 'Editada';
    default: return e.type;
  }
}

function historySection(g) {
  const evs = eventsOf(g.id).slice().reverse();
  return h('section', { class: 'card section' },
    sectionHead('Histórico', { count: evs.length }),
    h('ol', { class: 'timeline timeline--goal' }, evs.slice(0, 40).map((e) => h('li', { class: e.type === 'goal.milestone' || e.type === 'goal.completed' ? 'is-mark' : null },
      h('span', { class: 'timeline__text' }, describeEvent(g, e), e.metadata?.note && h('span', { class: 'meta-muted' }, ` — ${e.metadata.note}`)),
      h('time', { class: 'timeline__time', datetime: new Date(e.createdAt).toISOString() }, formatDateTime(e.createdAt))))),
    evs.length > 40 && h('p', { class: 'muted small' }, `Mostrando os 40 registros mais recentes de ${evs.length}.`));
}

function manageSection(g) {
  return h('section', { class: 'manage' },
    button('Editar', { variant: 'ghost', icon: 'edit', onClick: () => openGoalForm({ goalId: g.id }) }),
    g.status === 'archived'
      ? button('Restaurar', { variant: 'ghost', icon: 'undo', onClick: () => restoreGoal(g.id).catch(toastError) })
      : button('Arquivar', { variant: 'ghost', icon: 'archive', onClick: async () => { const token = await archiveGoal(g.id); toast('Meta arquivada. O histórico continua guardado.', { action: { label: 'Desfazer', fn: () => undo(token) } }); } }),
    button('Excluir', {
      variant: 'ghost-danger', icon: 'trash',
      onClick: async () => {
        const ok = await confirmDialog({ title: 'Excluir esta meta?', message: 'O progresso registrado deixa de aparecer. Se só quer tirá-la da frente, prefira “Arquivar”.', confirmLabel: 'Excluir', danger: true });
        if (!ok) return;
        const token = await deleteGoal(g.id);
        go('metas');
        toast('Meta excluída.', { action: { label: 'Desfazer', fn: () => undo(token) } });
      },
    }));
}

