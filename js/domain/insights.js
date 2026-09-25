/**
 * Motor de insights: regras determinísticas e explicáveis, sem IA.
 *
 * Cada insight:
 *  - key/signature: identidade e "tamanho" (deduplicação e cooldown ao ocultar);
 *  - category: classificação interna (acumulo, consistencia, execucao, direcao, ritmo, equilibrio, cuidados);
 *  - label: rótulo discreto para o usuário (Atrasos, Adiamentos, Ritmo, Metas…);
 *  - priority: severidade × 100 + magnitude (0–99) → ordem de relevância;
 *  - title + line: o que aparece fechado; facts, period, how, meaning: "Entender análise";
 *  - actions: o que fazer (a interface decide como executar cada tipo).
 * O escopo (tudo, área, meta, tarefas) filtra tarefas, metas e eventos antes das regras.
 */
import { state, commit } from '../core/store.js';
import { DAY, today, formatDay, formatMonthYear, daysSince, diffDays, dayKey } from '../utils/dates.js';
import { plural, timesText, formatPercent, formatMoney } from '../utils/numbers.js';
import { openTasks, isOverdue, tasksForGoal, isOpen } from './tasks.js';
import { activeGoals, paceOf, progressOf, lastMovementAt, MILESTONE_TEXT, formatGoalValue } from './goals.js';
import { rateText } from './planning.js';
import { openInboxItems } from './inbox.js';
import { lastActivityByArea } from '../core/events.js';
import { listAreas, getArea } from './areas.js';
import { completedIds, countType, recentCapacity, thisWeekLoad } from './stats.js';
import { financeEnabled, incomeMonthly, monthSummary, thisMonth, monthLabel, adjustableCategories, hasExpenses } from './money.js';
import { plansStatus, plannedTotal } from './finance-plan.js';

export const CATEGORIES = {
  execucao: { label: 'Execução' }, acumulo: { label: 'Acúmulo' }, consistencia: { label: 'Adiamentos' },
  direcao: { label: 'Metas' }, ritmo: { label: 'Ritmo' }, equilibrio: { label: 'Áreas' }, cuidados: { label: 'Backup' },
  dinheiro: { label: 'Dinheiro' },
};

const COOLDOWN = { 3: 2 * DAY, 2: 4 * DAY, 1: 7 * DAY };
const TONE = { 3: 'attention', 2: 'watch', 1: 'info' };
const NUM = ['nenhuma', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
const numF = (n) => NUM[n] || String(n);
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const mag = (n) => Math.max(0, Math.min(99, Math.round(n)));

function push(list, ins) {
  list.push({ tone: ins.positive ? 'good' : TONE[ins.severity], priority: ins.severity * 100 + (ins.magnitude || 0), ...ins });
}

/** Filtros por escopo — mesma semântica do motor de análise. */
function scoped(sel = { scope: 'tudo' }) {
  const scope = sel.scope || 'tudo';
  const taskOk = (t) => (scope === 'dinheiro' ? false : scope === 'area' ? t.areaId === sel.areaId : scope === 'meta' ? t.goalId === sel.goalId : true);
  const goalOk = (g) => (scope === 'tarefas' ? false : scope === 'dinheiro' ? g.type === 'money' : scope === 'area' ? g.areaId === sel.areaId : scope === 'meta' ? g.id === sel.goalId : true);
  const eventOk = (e) => (scope === 'dinheiro' ? e.entityType === 'money' : scope === 'tarefas' ? e.entityType === 'task' : scope === 'area' ? e.areaId === sel.areaId : scope === 'meta' ? (e.entityId === sel.goalId || e.metadata?.goalId === sel.goalId) : true);
  return { scope, taskOk, goalOk, eventOk, global: scope === 'tudo', money: scope === 'tudo' || scope === 'dinheiro', taskish: scope === 'tudo' || scope === 'tarefas' };
}

function scopedCounts(eventOk, from, to = Infinity) {
  let created = 0; const done = new Set();
  for (const e of state.events) {
    if (e.createdAt < from || e.createdAt >= to || !eventOk(e)) continue;
    if (e.type === 'task.created') created++;
    else if (e.type === 'task.completed') done.add(e.entityId);
  }
  return { created, done: done.size };
}

export function computeInsights(sel = { scope: 'tudo' }, now = Date.now()) {
  const S = scoped(sel);
  const list = [];
  const T = today();
  const open = openTasks().filter(S.taskOk);
  const goals = activeGoals().filter(S.goalOk);
  const appAgeDays = state.settings.firstRunAt ? (now - state.settings.firstRunAt) / DAY : 0;
  const where = S.scope === 'area' ? ` em ${getArea(sel.areaId)?.name || 'nesta área'}` : S.scope === 'meta' ? ' desta meta' : '';

  /* ----- Atrasos ----- */
  const overdue = open.filter((t) => isOverdue(t, T)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (overdue.length) {
    const first = overdue[0];
    const oldest = diffDays(first.dueDate, T);
    const many = overdue.length >= 8;
    push(list, {
      key: `overdue:${S.scope}`, category: 'acumulo', label: 'Atrasos', severity: overdue.length >= 5 ? 3 : 2, magnitude: mag(overdue.length * 6 + oldest), signature: overdue.length,
      title: overdue.length === 1 ? `1 tarefa${where} passou do prazo.` : many ? `Existem ${overdue.length} pendências acumuladas${where}.` : `${overdue.length} tarefas${where} passaram do prazo.`,
      line: many ? 'Você não precisa resolver tudo agora. Comece pelas que merecem mais atenção.' : `A mais antiga é “${first.title}”, atrasada há ${oldest === 1 ? '1 dia' : `${oldest} dias`}.`,
      items: overdue.map((t) => t.id),
      facts: [{ v: overdue.length, l: overdue.length === 1 ? 'atrasada' : 'atrasadas' }, { v: oldest === 1 ? '1 dia' : `${oldest} dias`, l: 'de atraso na mais antiga' }],
      period: 'Situação de hoje.',
      how: [`Tarefas abertas com prazo anterior a hoje: ${overdue.length}.`, `A mais antiga venceu em ${formatDay(first.dueDate)}.`],
      meaning: 'Prazos vencidos pedem uma decisão: fazer, escolher uma nova data realista ou cancelar o que perdeu sentido.',
      actions: overdue.length === 1
        ? [{ label: 'Ver tarefa', type: 'openTask', id: first.id, primary: true }]
        : [{ label: 'Revisar tarefas', type: 'review', ids: overdue.map((t) => t.id), primary: true }, { label: 'Ver na lista', href: '#/tarefas?f=atrasadas' }],
    });
  }

  /* ----- Acúmulo ----- */
  if (S.scope !== 'meta') {
    const c = scopedCounts(S.eventOk, now - 14 * DAY);
    if (c.created >= 8 && c.created > c.done * 1.5 + 2) {
      push(list, {
        key: `accumulation:${S.scope}`, category: 'acumulo', label: 'Acúmulo', group: 'review', severity: 2, magnitude: mag((c.created - c.done) * 3), signature: Math.round(c.created / Math.max(c.done, 1)),
        title: `Sua lista está crescendo${where}.`,
        line: `${c.created} tarefas criadas e ${c.done} concluídas nos últimos 14 dias.`,
        facts: [{ v: c.created, l: 'criadas' }, { v: c.done, l: 'concluídas' }, { v: `+${c.created - c.done}`, l: 'na lista' }],
        period: 'Últimos 14 dias.',
        how: ['Nos últimos 14 dias:', `${c.created} tarefas foram criadas.`, `${c.done} foram concluídas.`, `Portanto, as pendências aumentaram em cerca de ${c.created - c.done} (sem contar as canceladas).`],
        meaning: 'Quando entra mais do que sai, a lista fica mais difícil de ler. Revisar ajuda a manter só o que ainda faz sentido.',
        actions: [{ label: 'Revisar pendências', type: 'review', primary: true }],
      });
    } else if (open.length >= 25) {
      push(list, {
        key: `backlog:${S.scope}`, category: 'acumulo', label: 'Acúmulo', group: 'review', severity: 2, magnitude: mag(open.length), signature: Math.floor(open.length / 5),
        title: `Existem ${open.length} tarefas abertas${where}.`, line: 'Uma lista longa costuma esconder o que importa.',
        facts: [{ v: open.length, l: 'abertas' }], period: 'Situação de hoje.',
        how: [`Tarefas pendentes ou em andamento: ${open.length}.`],
        meaning: 'Algumas podem já não fazer sentido. Revisar uma por vez deixa a lista mais leve.',
        actions: [{ label: 'Revisar meu plano', type: 'review', primary: true }],
      });
    }
  }

  if (S.global) {
    const inbox = openInboxItems();
    const oldestDays = inbox.length ? daysSince(inbox[0].createdAt) : 0;
    if (inbox.length >= 5 || (inbox.length && oldestDays >= 3)) {
      push(list, {
        key: 'inbox', category: 'acumulo', label: 'Anotações', severity: inbox.length >= 10 ? 2 : 1, magnitude: mag(inbox.length * 4 + oldestDays), signature: Math.floor(inbox.length / 3),
        title: `${plural(inbox.length, 'anotação espera', 'anotações esperam')} uma decisão.`,
        line: oldestDays >= 3 ? `A mais antiga está guardada há ${oldestDays} dias.` : 'Decidir o que cada uma é leva poucos minutos.',
        facts: [{ v: inbox.length, l: 'anotações' }], period: 'Situação de hoje.',
        how: [`Anotações ainda não organizadas: ${inbox.length}.`],
        meaning: 'Anotações são temporárias: viram tarefa, meta ou lembrete.',
        actions: [{ label: 'Organizar agora', type: 'organize', primary: true }],
      });
    }
  }

  /* ----- Adiamentos ----- */
  const from14 = now - 14 * DAY;
  open.filter((t) => (t.postponedCount || 0) >= 3).sort((a, b) => b.postponedCount - a.postponedCount).slice(0, 2).forEach((t) => {
    const recent = state.events.filter((e) => e.entityId === t.id && e.type === 'task.postponed' && e.createdAt >= from14).length;
    push(list, {
      key: `stuck:${t.id}`, category: 'consistencia', label: 'Adiamentos', severity: 2, magnitude: mag(t.postponedCount * 12 + recent * 5), signature: t.postponedCount,
      title: recent >= 2 ? `“${t.title}” foi adiada ${timesText(recent)} nos últimos 14 dias.` : `“${t.title}” já foi adiada ${timesText(t.postponedCount)}.`,
      line: 'Talvez esteja grande demais, pouco clara ou já não importe.',
      facts: [{ v: t.postponedCount, l: 'adiamentos no total' }, { v: recent, l: 'nos últimos 14 dias' }], period: 'Todo o histórico da tarefa.',
      how: [`Adiamentos no total: ${t.postponedCount}.`, `Nos últimos 14 dias: ${recent}.`, 'Conta como adiamento empurrar um prazo que já tinha chegado.'],
      meaning: 'Adiar de novo raramente resolve. Vale fazer agora, dividir em algo menor, escolher uma data realista ou cancelar.',
      actions: [
        { label: 'Escolher o que fazer', type: 'review', ids: [t.id], primary: true },
        { label: 'Ver tarefa', type: 'openTask', id: t.id },
      ],
    });
  });
  if (S.taskish) {
    const dropped30 = countType('task.dropped', now - 30 * DAY);
    const done30 = completedIds(now - 30 * DAY).size;
    if (dropped30 >= 6 && dropped30 >= done30 * 0.5) {
      push(list, {
        key: 'dropped', category: 'consistencia', label: 'Cancelamentos', severity: 1, magnitude: mag(dropped30 * 3), signature: Math.floor(dropped30 / 3),
        title: `${dropped30} tarefas foram canceladas nos últimos 30 dias.`, line: 'Cancelar é saudável; se acontece muito, talvez valha criar tarefas menores.',
        facts: [{ v: dropped30, l: 'canceladas' }, { v: done30, l: 'concluídas' }], period: 'Últimos 30 dias.',
        how: [`Canceladas em 30 dias: ${dropped30}.`, `Concluídas no mesmo período: ${done30}.`],
        meaning: 'Muitos cancelamentos podem indicar tarefas criadas por impulso ou grandes demais.',
        actions: [{ label: 'Ver canceladas', href: '#/tarefas?ver=canceladas', primary: true }],
      });
    }
  }

  /* ----- Planejamento e execução ----- */
  if (S.taskish) {
    const cap = recentCapacity();
    const load = thisWeekLoad();
    if (cap && load.planned >= Math.max(cap.avgDone * 1.5, cap.avgDone + 5)) {
      push(list, {
        key: 'capacity', category: 'execucao', label: 'Planejamento', severity: 2, magnitude: mag((load.planned - cap.avgDone) * 4), signature: Math.floor(load.planned / 3),
        title: 'O plano desta semana está acima do seu ritmo recente.',
        line: `${load.planned} tarefas com prazo nesta semana; você conclui em média ${Math.round(cap.avgDone)} por semana.`,
        facts: [{ v: load.planned, l: 'nesta semana' }, { v: Math.round(cap.avgDone), l: 'média por semana' }], period: `Semana atual e últimas ${cap.weeks} semanas completas.`,
        how: [`Tarefas com prazo nesta semana: ${load.planned} (${load.done} já concluídas).`, `Média de conclusões nas últimas ${cap.weeks} semanas: ${Math.round(cap.avgDone * 10) / 10} por semana.`],
        meaning: 'Não significa que não dá para fazer. É um sinal para rever quantidade, prazos ou importância.',
        actions: [{ label: 'Revisar esta semana', type: 'reviewWeek', primary: true }],
      });
    }
    const done7 = completedIds(now - 7 * DAY).size;
    const donePrev7 = completedIds(now - 14 * DAY, now - 7 * DAY).size;
    if (appAgeDays >= 14 && done7 + donePrev7 >= 3) {
      push(list, {
        key: 'momentum', category: 'execucao', label: 'Execução', group: 'momentum', severity: 1, magnitude: 0, signature: `${done7}-${donePrev7}`,
        title: `${cap1(plural(done7, 'tarefa concluída', 'tarefas concluídas'))} nos últimos 7 dias.`,
        line: `Nos 7 dias anteriores ${donePrev7 === 1 ? 'foi 1' : `foram ${donePrev7}`}.`,
        facts: [{ v: done7, l: 'últimos 7 dias' }, { v: donePrev7, l: '7 dias anteriores' }], period: 'Últimos 14 dias, em duas metades.',
        how: ['Contamos tarefas distintas concluídas em cada período de 7 dias.'],
        meaning: 'É só um registro do que aconteceu, sem julgamento.',
        actions: [{ label: 'Ver progresso', href: '#/progresso' }],
      });
    }
  }

  /* ----- Metas: paradas, sem próximo passo, fora do ritmo ----- */
  const idle = []; const noStep = []; const stalled = [];
  for (const g of goals) {
    const last = lastMovementAt(g);
    const hasOpenTask = tasksForGoal(g.id).some(isOpen);
    const age = (now - g.createdAt) / DAY;
    const since = last ? daysSince(last) : Math.floor(age);
    if (age >= 14 && !hasOpenTask && since > 30) idle.push({ g, since });
    else if (!hasOpenTask && age >= 2) noStep.push(g);
    if (age >= 21 && since >= 21 && hasOpenTask) stalled.push({ g, since });
  }
  if (idle.length) {
    push(list, {
      key: `idleGoals:${S.scope}`, category: 'direcao', label: 'Metas paradas', severity: idle.length >= 2 ? 2 : 1, magnitude: mag(idle.length * 15 + Math.max(...idle.map((x) => x.since)) / 3), signature: idle.length,
      title: idle.length === 1 ? `“${idle[0].g.title}” não tem tarefas nem progresso há ${idle[0].since} dias.` : `${cap1(numF(idle.length))} das suas ${goals.length} metas ativas estão paradas.`,
      line: 'Sem tarefas abertas e sem progresso registrado nos últimos 30 dias.',
      goalItems: idle.map((x) => x.g.id),
      facts: [{ v: idle.length, l: idle.length === 1 ? 'meta parada' : 'metas paradas' }, { v: goals.length, l: 'ativas' }], period: 'Últimos 30 dias.',
      how: idle.map((x) => `“${x.g.title}”: sem movimento há ${x.since} dias e sem tarefas abertas.`),
      meaning: 'Uma meta sem próximo passo tende a ficar só na intenção. Defina uma ação pequena — ou arquive, se deixou de importar.',
      actions: idle.length === 1
        ? [{ label: 'Definir próximo passo', type: 'newNextStep', id: idle[0].g.id, primary: true }, { label: 'Registrar progresso', type: 'logProgress', id: idle[0].g.id }]
        : [{ label: 'Revisar metas', href: '#/metas?f=paradas', primary: true }],
    });
  }
  if (noStep.length) {
    push(list, {
      key: `noNextStep:${S.scope}`, category: 'direcao', label: 'Próximo passo', severity: noStep.length >= 2 ? 2 : 1, magnitude: mag(noStep.length * 12), signature: noStep.length,
      title: noStep.length === 1 ? `“${noStep[0].title}” não tem próximo passo.` : `${cap1(numF(noStep.length))} metas ativas não têm nenhuma tarefa relacionada.`,
      line: 'Uma tarefa concreta é o que transforma a meta em ação.',
      goalItems: noStep.map((g) => g.id),
      facts: [{ v: noStep.length, l: noStep.length === 1 ? 'meta sem tarefa' : 'metas sem tarefa' }], period: 'Situação de hoje.',
      how: noStep.map((g) => `“${g.title}”: nenhuma tarefa aberta ligada a ela.`),
      meaning: 'O próximo passo aparece junto da meta e na tela inicial, para não ser esquecido.',
      actions: noStep.length === 1 ? [{ label: 'Definir próximo passo', type: 'newNextStep', id: noStep[0].id, primary: true }] : [{ label: 'Ver metas', href: '#/metas?f=sem-passo', primary: true }],
    });
  }
  stalled.sort((a, b) => b.since - a.since).slice(0, 2).forEach(({ g, since }) => {
    push(list, {
      key: `stalled:${g.id}`, category: 'direcao', label: 'Metas', severity: since >= 30 ? 2 : 1, magnitude: mag(since), signature: Math.floor(since / 7),
      title: `“${g.title}” não registra progresso há ${since} dias.`,
      line: 'Ela tem tarefas abertas, mas nenhum avanço registrado recentemente.',
      facts: [{ v: `${since} dias`, l: 'sem progresso' }, { v: formatPercent(progressOf(g).ratio), l: 'concluído' }], period: 'Desde o último registro.',
      how: [`Último registro de progresso ou etapa: há ${since} dias.`, `Progresso atual: ${formatPercent(progressOf(g).ratio)}.`],
      meaning: 'Se você avançou e não registrou, atualize o valor. Se não avançou, talvez o próximo passo precise ser menor.',
      actions: [{ label: 'Registrar progresso', type: 'logProgress', id: g.id, primary: true }, { label: 'Revisar meta', href: `#/metas/${g.id}` }],
    });
  });
  for (const g of goals) {
    const pace = paceOf(g, now);
    if (!pace) continue;
    if (pace.datePassed) {
      push(list, {
        key: `goaldate:${g.id}`, category: 'ritmo', label: 'Ritmo', severity: 2, magnitude: mag(-pace.daysLeft), signature: g.targetDate,
        title: `A data da meta “${g.title}” já passou.`, line: `Ela está em ${formatPercent(progressOf(g).ratio)}.`,
        facts: [{ v: formatPercent(progressOf(g).ratio), l: 'concluído' }, { v: `${-pace.daysLeft} dias`, l: 'após a data' }], period: 'Situação de hoje.',
        how: [`Data escolhida: ${formatDay(g.targetDate, { withYear: true })}.`, `Progresso atual: ${formatPercent(progressOf(g).ratio)}.`],
        meaning: 'Escolher um novo prazo realista mantém a projeção útil.',
        actions: [{ label: 'Ver planejamento', href: `#/metas/${g.id}?ver=plano`, primary: true }],
      });
    } else if (pace.offPace) {
      const ratio = pace.recent.perDay / pace.neededPerDay;
      push(list, {
        key: `offpace:${g.id}`, category: 'ritmo', label: 'Ritmo', severity: 2, magnitude: mag((1 - ratio) * 80), signature: Math.round(ratio * 10),
        title: `“${g.title}” está abaixo do ritmo necessário.`,
        line: `Necessário: ${rateText(g, pace.neededPerDay)} · média recente: ${rateText(g, pace.recent.perDay)}.`,
        facts: [{ v: rateText(g, pace.neededPerDay), l: 'necessário' }, { v: rateText(g, pace.recent.perDay), l: 'média recente' }], period: `Média dos últimos ${pace.recent.windowDays} dias.`,
        how: [`Faltam ${formatGoalValue(g, pace.remaining)} em ${pace.daysLeft} dias (até ${formatDay(g.targetDate, { withYear: true })}).`, 'Ritmo necessário = quanto falta ÷ tempo restante.', `Média recente = avanços registrados nos últimos ${pace.recent.windowDays} dias (correções não entram).`],
        meaning: `Mantendo o ritmo atual, a data de ${formatMonthYear(g.targetDate)} fica apertada. Dá para ajustar o prazo ou o valor por período.`,
        actions: [{ label: 'Ver projeção', href: `#/metas/${g.id}?ver=plano`, primary: true }],
      });
    }
  }
  const recentMilestones = state.events.filter((e) => e.type === 'goal.milestone' && e.createdAt >= now - 3 * DAY && e.metadata.pct < 100 && goals.some((g) => g.id === e.entityId));
  const latest = new Map(); for (const e of recentMilestones) latest.set(e.entityId, e);
  for (const e of latest.values()) {
    push(list, {
      key: `milestone:${e.entityId}:${e.metadata.pct}`, category: 'ritmo', label: 'Marco', severity: 1, positive: true, magnitude: 0, signature: 1,
      title: `“${e.label}” chegou a ${e.metadata.pct}%.`, line: MILESTONE_TEXT[e.metadata.pct],
      facts: [{ v: `${e.metadata.pct}%`, l: 'atingido' }], period: 'Últimos 3 dias.',
      how: [`Marco registrado em ${formatDay(dayKey(e.createdAt))}.`], meaning: 'Um registro do avanço, sem outra ação necessária.',
      actions: [{ label: 'Ver meta', href: `#/metas/${e.entityId}` }],
    });
  }

  /* ----- Tarefas sem meta: só quando há motivo real ----- */
  if (S.global && goals.length && noStep.length + idle.length > 0) {
    const unlinked = open.filter((t) => !t.goalId);
    if (unlinked.length >= 10 && unlinked.length / open.length >= 0.7) {
      push(list, {
        key: 'unlinked', category: 'direcao', label: 'Metas e tarefas', severity: 1, magnitude: mag(unlinked.length), signature: Math.floor(unlinked.length / 5),
        title: `${unlinked.length} tarefas abertas não estão ligadas a nenhuma meta.`,
        line: 'Isso não é necessariamente ruim — mas algumas metas estão sem tarefas.',
        facts: [{ v: unlinked.length, l: 'sem meta' }, { v: open.length, l: 'abertas' }], period: 'Situação de hoje.',
        how: [`Tarefas abertas: ${open.length}.`, `Sem meta relacionada: ${unlinked.length}.`, `Metas sem tarefa aberta: ${noStep.length + idle.length}.`],
        meaning: 'Muitas tarefas existem só para resolver o dia a dia. O sinal aqui é outro: há metas sem ação, e talvez alguma dessas tarefas faça parte delas.',
        actions: [{ label: 'Ver metas', href: '#/metas', primary: true }],
      });
    }
  }

  /* ----- Áreas esquecidas ----- */
  if ((S.global || S.scope === 'area') && appAgeDays >= 14) {
    const last = lastActivityByArea();
    const allGoals = activeGoals();
    const all = openTasks();
    const areas = S.scope === 'area' ? listAreas().filter((a) => a.id === sel.areaId) : listAreas();
    const neglected = [];
    for (const area of areas) {
      const tasksIn = all.filter((t) => t.areaId === area.id).length;
      const goalsIn = allGoals.filter((g) => g.areaId === area.id).length;
      if (!tasksIn && !goalsIn) continue;
      const ts = last.get(area.id);
      const days = ts ? daysSince(ts) : Math.floor(appAgeDays);
      if (days >= 14) neglected.push({ area, days, tasksIn, goalsIn });
    }
    neglected.sort((a, b) => b.days - a.days).slice(0, 2).forEach(({ area, days, tasksIn, goalsIn }) => {
      const parts = [tasksIn && plural(tasksIn, 'tarefa aberta', 'tarefas abertas'), goalsIn && plural(goalsIn, 'meta ativa', 'metas ativas')].filter(Boolean);
      push(list, {
        key: `neglected:${area.id}`, category: 'equilibrio', label: 'Áreas', severity: days >= 30 ? 2 : 1, magnitude: mag(days), signature: Math.floor(days / 7),
        title: `${area.name} não registra atividade há ${days} dias.`, line: `Existem ${parts.join(' e ')} nessa área.`,
        facts: [{ v: `${days} dias`, l: 'sem atividade' }], period: 'Desde o último registro na área.',
        how: ['Atividade = criar, começar ou concluir tarefas e registrar progresso em metas da área.', `Último registro: há ${days} dias.`],
        meaning: 'Pode ser uma escolha consciente. Se não for, uma tarefa pequena já retoma a área.',
        actions: [{ label: 'Ver área', href: `#/area/${area.id}`, primary: true }],
      });
    });
  }

  /* ----- Dinheiro (só com a camada financeira ativada) ----- */
  if (S.money && financeEnabled()) {
    // No máximo dois pontos de dinheiro por vez: o Norte sugere, não inunda a tela.
    const fin = [];
    const income = incomeMonthly();
    const ms = monthSummary(thisMonth());
    const plans = plansStatus();
    const planned = plannedTotal();
    const availableNow = income.has ? income.cents - ms.spent : null;

    // O plano pede mais do que o disponível registrado.
    if (planned > 0 && availableNow != null && planned > availableNow) {
      const diff = planned - availableNow;
      const goal = plans[0]?.goal;
      push(fin, {
        key: 'fin-plano-acima', category: 'dinheiro', label: 'Dinheiro', severity: 2, magnitude: mag(Math.min(99, diff / 1000)), signature: Math.round(diff / 10000),
        title: `Seu plano para metas pede cerca de ${formatMoney(diff)} a mais por mês do que o valor disponível registrado.`,
        line: `Planejado: ${formatMoney(planned)} · disponível em ${monthLabel(thisMonth())}: ${formatMoney(Math.max(0, availableNow))}.`,
        facts: [{ v: formatMoney(planned), l: 'planejado para metas' }, { v: formatMoney(Math.max(0, availableNow)), l: 'disponível registrado' }],
        period: `Mês de ${monthLabel(thisMonth())}.`,
        how: [`Renda registrada: ${formatMoney(income.cents)}.`, `Saídas registradas no mês: ${formatMoney(ms.spent)}.`, `Disponível = renda − saídas = ${formatMoney(availableNow)}.`, `Planejado para metas: ${formatMoney(planned)}.`],
        meaning: 'Isso não quer dizer que o plano está errado. Pode ser que falte registrar alguma entrada, ou que valha ajustar o valor mensal ou o prazo.',
        actions: [
          goal && { label: 'Simular caminhos', type: 'simulate', id: goal.id, primary: true },
          { label: 'Ver finanças', href: '#/financas' },
        ].filter(Boolean),
        goalItems: goal ? [goal.id] : [],
      });
    }

    // Contribuição abaixo do planejado no mês.
    for (const p of plans) {
      if (p.planned > 0 && p.missing > 0 && new Date(now).getDate() >= 15) {
        push(fin, {
          key: `fin-abaixo:${p.goal.id}`, category: 'dinheiro', label: 'Dinheiro', severity: p.done > 0 ? 1 : 2, magnitude: mag(Math.min(99, p.missing / 1000)), signature: Math.round(p.missing / 10000),
          title: `A contribuição para “${p.goal.title}” está ${formatMoney(p.missing)} abaixo do planejado neste mês.`,
          line: `Planejado: ${formatMoney(p.planned)} · registrado até agora: ${formatMoney(p.done)}.`,
          facts: [{ v: formatMoney(p.planned), l: 'planejado no mês' }, { v: formatMoney(p.done), l: 'registrado' }],
          period: `Mês de ${monthLabel(thisMonth())}.`,
          how: [`Plano da meta: ${formatMoney(p.planned)} por mês.`, `Avanços registrados neste mês: ${formatMoney(p.done)}.`],
          meaning: 'Pode ser só falta de registro. Se o valor não couber mais no mês, dá para simular outro caminho.',
          actions: [
            { label: 'Registrar aporte', type: 'logProgress', id: p.goal.id, primary: true },
            { label: 'Rever caminhos', type: 'simulate', id: p.goal.id },
          ],
          goalItems: [p.goal.id],
        });
        break;
      }
    }

    // Quanto da renda foi para metas (fato, sem julgamento).
    if (income.has && ms.toGoals > 0) {
      push(fin, {
        key: 'fin-metas-renda', category: 'dinheiro', label: 'Dinheiro', severity: 1, magnitude: 5, positive: true, signature: Math.round((ms.toGoals / income.cents) * 100),
        title: `${formatPercent(ms.toGoals / income.cents)} da renda registrada foi para metas em ${monthLabel(thisMonth())}.`,
        line: `${formatMoney(ms.toGoals)} destinados a metas neste mês.`,
        facts: [{ v: formatMoney(ms.toGoals), l: 'para metas' }, { v: formatMoney(income.cents), l: 'renda registrada' }],
        period: `Mês de ${monthLabel(thisMonth())}.`,
        how: [`Avanços positivos em metas de dinheiro no mês: ${formatMoney(ms.toGoals)}.`, `Renda de referência: ${formatMoney(income.cents)}.`],
        meaning: 'É só perspectiva. Não existe um percentual “certo” — quem decide é você.',
        actions: [{ label: 'Ver finanças', href: '#/financas', primary: true }],
      });
    }

    // Margem de ajuste indicada pelo próprio usuário.
    const adj = adjustableCategories();
    const moneyGoal = goals.find((g) => g.type === 'money' && progressOf(g).remaining > 0);
    if (adj.length && moneyGoal && hasExpenses()) {
      const total = adj.reduce((a, c) => a + c.avgMonth, 0);
      push(fin, {
        key: 'fin-ajustaveis', category: 'dinheiro', label: 'Dinheiro', severity: 1, magnitude: 3, signature: adj.length,
        title: `Você marcou ${formatMoney(total)} por mês em gastos com margem para ajuste.`,
        line: 'Dá para simular uma redução e ver o efeito numa meta — nada muda de verdade.',
        facts: adj.slice(0, 3).map((c) => ({ v: formatMoney(c.avgMonth), l: `média em ${c.categoryId}` })),
        period: 'Média dos meses registrados.',
        how: ['Somente categorias que você marcou com margem (pequena, moderada ou alta) entram nessa conta.', 'Gastos marcados como “não mexer” ficam de fora sempre.'],
        meaning: 'O Norte não escolhe onde economizar. Ele só mostra o que você mesmo indicou como ajustável.',
        actions: [{ label: 'Simular ajuste', type: 'simulate', id: moneyGoal.id, primary: true }],
      });
    }
    fin.sort((a, b) => b.priority - a.priority);
    for (const x of fin.slice(0, 2)) list.push(x);
  }

  /* ----- Backup ----- */
  if (S.global) {
    const lastExport = state.settings.lastExportAt;
    if (appAgeDays >= 14 && state.tasks.size + state.goals.size >= 5 && (!lastExport || now - lastExport > 30 * DAY)) {
      push(list, {
        key: 'backup', category: 'cuidados', label: 'Backup', severity: 1, magnitude: 0, signature: lastExport ? 1 : 0,
        title: lastExport ? 'Seu último backup tem mais de 30 dias.' : 'Você ainda não fez um backup.',
        line: 'Seus dados ficam só neste navegador.',
        facts: [], period: 'Situação de hoje.', how: [lastExport ? `Último backup: há ${daysSince(lastExport)} dias.` : 'Nenhum backup exportado ainda.'],
        meaning: 'Um arquivo de backup protege contra limpeza de dados do navegador ou troca de aparelho.',
        actions: [{ label: 'Exportar backup', type: 'export', primary: true }],
      });
    }
  }

  return finalizeList(list, now);
}

function finalizeList(list, now) {
  const seen = new Set();
  const insightState = state.settings.insightState || {};
  return list
    .filter((i) => (seen.has(i.key) ? false : seen.add(i.key)))
    .map((i) => {
      const s = insightState[i.key];
      return { ...i, suppressed: !!s && s.signature === i.signature && now - s.dismissedAt < COOLDOWN[i.severity] };
    })
    .sort((a, b) => b.priority - a.priority);
}

export function dismissInsight(ins) {
  const now = Date.now();
  const current = state.settings.insightState || {};
  const pruned = Object.fromEntries(Object.entries(current).filter(([, v]) => now - v.dismissedAt < 60 * DAY));
  pruned[ins.key] = { dismissedAt: now, signature: ins.signature };
  return commit({ settings: { insightState: pruned } });
}

/** Tela inicial: no máximo `limit` insights que pedem ação. */
export function homeInsights(limit = 2, excludeKeys = []) {
  return computeInsights({ scope: 'tudo' }).filter((i) => !i.suppressed && i.group !== 'momentum' && i.category !== 'cuidados' && !i.positive && !excludeKeys.some((k) => i.key.startsWith(k))).slice(0, limit);
}

/**
 * "O que vale fazer agora": no máximo 2 ações, derivadas dos insights mais relevantes.
 * Frases factuais, sem cobrança.
 */
export function nextActions(insights, limit = 2) {
  const out = [];
  for (const i of insights) {
    if (out.length >= limit) break;
    if (i.suppressed || i.positive || !i.actions?.length) continue;
    const a = i.actions.find((x) => x.primary) || i.actions[0];
    let text;
    if (i.key.startsWith('overdue')) text = i.items.length === 1 ? 'Decidir o que fazer com a tarefa atrasada é provavelmente o melhor ponto de partida.' : `Revisar as ${i.items.length} tarefas atrasadas é provavelmente o melhor ponto de partida.`;
    else if (i.key.startsWith('stuck')) text = `${i.title.replace(/\.$/, '')}. Vale decidir o que fazer com ela.`;
    else if (i.key.startsWith('offpace') || i.key.startsWith('goaldate')) text = `${i.title} Veja o planejamento para ajustar prazo ou ritmo.`;
    else if (i.key.startsWith('stalled')) text = i.title;
    else if (i.key.startsWith('noNextStep') || i.key.startsWith('idleGoals')) text = i.title;
    else if (i.key.startsWith('accumulation') || i.key.startsWith('backlog')) text = `${i.title} Uma revisão rápida ajuda a manter só o que importa.`;
    else if (i.key === 'capacity') text = 'O plano desta semana está acima do seu ritmo recente. Revisar agora evita frustração no fim da semana.';
    else if (i.key === 'inbox') text = i.title;
    else continue;
    out.push({ text, action: a, key: i.key });
  }
  return out;
}

