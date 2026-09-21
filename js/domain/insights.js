/**
 * Motor de insights: regras determinísticas → poucos alertas relevantes.
 *
 * Cada insight tem:
 *  - key: identidade estável (deduplicação);
 *  - category: execução · acúmulo · consistência · direção · ritmo · equilíbrio · cuidados;
 *  - severity: 3 atenção · 2 observar · 1 registro;
 *  - signature: "tamanho" do problema. Dispensado com a mesma assinatura → volta só após o cooldown;
 *  - how: linhas de "Como chegamos a isso?" (transparência);
 *  - actions: portas para ação (a interface decide como executar cada tipo).
 */
import { state, commit } from '../core/store.js';
import { DAY, today, formatDay, formatMonthYear, daysSince, diffDays } from '../utils/dates.js';
import { plural, timesText, formatPercent } from '../utils/numbers.js';
import { openTasks, isOverdue, stuckTasks, tasksForGoal, isOpen } from './tasks.js';
import { activeGoals, paceOf, progressOf, lastMovementAt, MILESTONE_TEXT, formatGoalValue } from './goals.js';
import { rateText } from './planning.js';
import { openInboxItems } from './inbox.js';
import { lastActivityByArea } from '../core/events.js';
import { listAreas } from './areas.js';
import { completedIds, countType, recentCapacity, thisWeekLoad } from './stats.js';

export const CATEGORIES = {
  execucao: { label: 'Execução', question: 'O que você está fazendo?' },
  acumulo: { label: 'Acúmulo', question: 'O que está ficando para trás?' },
  consistencia: { label: 'Consistência', question: 'O que está sendo adiado ou abandonado?' },
  direcao: { label: 'Direção', question: 'Suas ações estão ligadas às suas metas?' },
  ritmo: { label: 'Ritmo', question: 'As metas avançam no ritmo necessário?' },
  equilibrio: { label: 'Equilíbrio', question: 'Alguma área está esquecida?' },
  cuidados: { label: 'Cuidados', question: 'Seus dados estão protegidos?' },
};

const COOLDOWN = { 3: 2 * DAY, 2: 4 * DAY, 1: 7 * DAY };
const TONE = { 3: 'attention', 2: 'watch', 1: 'info' };
const NUM = ['nenhuma', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
const numF = (n) => NUM[n] || String(n);

function push(list, ins) { list.push({ tone: ins.positive ? 'good' : TONE[ins.severity], ...ins }); }

export function computeInsights(now = Date.now()) {
  const list = [];
  const T = today();
  const open = openTasks();
  const appAgeDays = state.settings.firstRunAt ? (now - state.settings.firstRunAt) / DAY : 0;

  /* ----- Acúmulo ----- */
  const overdue = open.filter((t) => isOverdue(t, T)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (overdue.length) {
    const first = overdue[0];
    const many = overdue.length >= 8;
    push(list, {
      key: 'overdue', category: 'acumulo', severity: overdue.length >= 5 ? 3 : 2, signature: overdue.length,
      title: overdue.length === 1 ? '1 tarefa passou do prazo.' : many ? `Existem ${overdue.length} pendências acumuladas.` : `${overdue.length} tarefas passaram do prazo.`,
      body: many
        ? 'Você não precisa resolver tudo agora. Comece pelas que merecem mais atenção — uma de cada vez.'
        : overdue.length === 1 ? `“${first.title}” estava prevista para ${formatDay(first.dueDate)}.` : `A mais antiga é “${first.title}”, prevista para ${formatDay(first.dueDate)}.`,
      items: overdue.map((t) => t.id),
      facts: [{ v: overdue.length, l: overdue.length === 1 ? 'atrasada' : 'atrasadas' }, { v: `${diffDays(first.dueDate, T)} dias`, l: 'a mais antiga' }],
      how: [`Tarefas abertas com prazo anterior a hoje: ${overdue.length}.`, `A mais antiga venceu em ${formatDay(first.dueDate)}.`],
      actions: overdue.length === 1
        ? [{ label: 'Ver tarefa', type: 'openTask', id: first.id, primary: true }]
        : [{ label: 'Ver tarefas', href: '#/tarefas?f=atrasadas', primary: true }, { label: many ? 'Revisar prioridades' : 'Revisar uma a uma', type: 'review', ids: overdue.map((t) => t.id) }],
    });
  }

  const from14 = now - 14 * DAY;
  const created14 = countType('task.created', from14);
  const done14 = completedIds(from14).size;
  if (created14 >= 8 && created14 > done14 * 1.5 + 2) {
    push(list, {
      key: 'accumulation', category: 'acumulo', group: 'review', severity: 2, signature: Math.round(created14 / Math.max(done14, 1)),
      title: `Você criou ${created14} tarefas nos últimos 14 dias e concluiu ${done14}.`,
      body: 'Sua lista está crescendo mais rapidamente do que está sendo reduzida.',
      facts: [{ v: created14, l: 'criadas' }, { v: done14, l: 'concluídas' }, { v: `+${created14 - done14}`, l: 'na lista' }],
      how: [`Nos últimos 14 dias:`, `${created14} tarefas foram criadas.`, `${done14} foram concluídas.`, `Sua lista aumentou em cerca de ${created14 - done14} itens nesse período (sem contar as canceladas).`],
      actions: [{ label: 'Revisar pendências', type: 'review', primary: true }, { label: 'Ver entradas e saídas', href: '#/analises?ver=fluxo' }],
    });
  } else if (open.length >= 25) {
    push(list, {
      key: 'backlog', category: 'acumulo', group: 'review', severity: 2, signature: Math.floor(open.length / 5),
      title: `Existem ${open.length} tarefas abertas.`,
      body: 'Uma lista longa costuma esconder o que importa. Algumas podem já não fazer sentido.',
      facts: [{ v: open.length, l: 'abertas' }],
      how: [`Tarefas pendentes ou em andamento: ${open.length}.`],
      actions: [{ label: 'Revisar meu plano', type: 'review', primary: true }],
    });
  }

  const inbox = openInboxItems();
  const oldestDays = inbox.length ? daysSince(inbox[0].createdAt) : 0;
  if (inbox.length >= 5 || (inbox.length && oldestDays >= 3)) {
    push(list, {
      key: 'inbox', category: 'acumulo', severity: inbox.length >= 10 ? 2 : 1, signature: Math.floor(inbox.length / 3),
      title: `${plural(inbox.length, 'anotação espera', 'anotações esperam')} uma decisão.`,
      body: oldestDays >= 3 ? `A mais antiga está guardada há ${oldestDays} dias. Decidir o que cada uma é leva poucos minutos.` : 'Decidir o que cada uma é leva poucos minutos.',
      facts: [{ v: inbox.length, l: 'anotações' }, oldestDays ? { v: `${oldestDays} dias`, l: 'a mais antiga' } : null].filter(Boolean),
      how: [`Anotações ainda não organizadas: ${inbox.length}.`],
      actions: [{ label: 'Organizar agora', type: 'organize', primary: true }],
    });
  }

  /* ----- Consistência ----- */
  for (const t of stuckTasks(3).slice(0, 2)) {
    const recent = state.events.filter((e) => e.entityId === t.id && e.type === 'task.postponed' && e.createdAt >= from14).length;
    push(list, {
      key: `stuck:${t.id}`, category: 'consistencia', severity: 2, signature: t.postponedCount,
      title: recent >= 2 ? `“${t.title}” foi adiada ${timesText(recent)} nos últimos 14 dias.` : `“${t.title}” já foi adiada ${timesText(t.postponedCount)}.`,
      body: 'Quando algo é adiado tantas vezes, geralmente está grande demais, pouco claro ou já não importa.',
      facts: [{ v: t.postponedCount, l: 'adiamentos' }, { v: recent, l: 'em 14 dias' }],
      how: [`Adiamentos no total: ${t.postponedCount}.`, `Nos últimos 14 dias: ${recent}.`, 'Conta como adiamento empurrar um prazo que já tinha chegado.'],
      actions: [
        { label: 'Ver tarefa', type: 'openTask', id: t.id },
        { label: 'Fazer agora', type: 'startTask', id: t.id, primary: true },
        { label: 'Escolher outra data', type: 'openTask', id: t.id },
        { label: 'Cancelar', type: 'dropTask', id: t.id },
      ],
    });
  }
  const dropped30 = countType('task.dropped', now - 30 * DAY);
  const done30 = completedIds(now - 30 * DAY).size;
  if (dropped30 >= 6 && dropped30 >= done30 * 0.5) {
    push(list, {
      key: 'dropped', category: 'consistencia', severity: 1, signature: Math.floor(dropped30 / 3),
      title: `Você cancelou ${dropped30} tarefas nos últimos 30 dias.`,
      body: 'Cancelar é saudável. Mas, se acontece muito, talvez valha criar tarefas menores ou mais claras.',
      facts: [{ v: dropped30, l: 'canceladas' }, { v: done30, l: 'concluídas' }],
      how: [`Canceladas em 30 dias: ${dropped30}.`, `Concluídas no mesmo período: ${done30}.`],
      actions: [{ label: 'Ver canceladas', href: '#/tarefas?ver=canceladas' }],
    });
  }

  /* ----- Execução ----- */
  const cap = recentCapacity();
  const load = thisWeekLoad();
  if (cap && load.planned >= Math.max(cap.avgDone * 1.5, cap.avgDone + 5)) {
    push(list, {
      key: 'capacity', category: 'execucao', severity: 2, signature: Math.floor(load.planned / 3),
      title: 'Seu plano para esta semana está bem acima do seu ritmo recente.',
      body: `Há ${load.planned} tarefas com prazo nesta semana. Nas últimas ${cap.weeks} semanas você concluiu, em média, ${Math.round(cap.avgDone)} por semana. Considere revisar quantidade, prazos ou importância.`,
      facts: [{ v: load.planned, l: 'nesta semana' }, { v: Math.round(cap.avgDone), l: 'média por semana' }],
      how: [`Tarefas com prazo nesta semana: ${load.planned} (${load.done} já concluídas).`, `Média de conclusões nas últimas ${cap.weeks} semanas completas: ${Math.round(cap.avgDone * 10) / 10} por semana.`],
      actions: [{ label: 'Revisar esta semana', type: 'reviewWeek', primary: true }, { label: 'Ver planejado × realizado', href: '#/progresso' }],
    });
  }
  const done7 = completedIds(now - 7 * DAY).size;
  const donePrev7 = completedIds(now - 14 * DAY, now - 7 * DAY).size;
  if (appAgeDays >= 14 && done7 + donePrev7 >= 3) {
    push(list, {
      key: 'momentum', category: 'execucao', group: 'momentum', severity: 1, signature: `${done7}-${donePrev7}`,
      title: `Nos últimos 7 dias você concluiu ${plural(done7, 'tarefa', 'tarefas')}.`,
      body: `Nos 7 dias anteriores ${donePrev7 === 1 ? 'foi 1' : `foram ${donePrev7}`}.`,
      facts: [{ v: done7, l: 'últimos 7 dias' }, { v: donePrev7, l: '7 dias anteriores' }],
      how: ['Contamos tarefas distintas concluídas em cada período de 7 dias.'],
      actions: [{ label: 'Ver progresso', href: '#/progresso' }],
    });
  }

  /* ----- Direção ----- */
  const goals = activeGoals();
  const idleGoals = goals.filter((g) => {
    if (now - g.createdAt < 14 * DAY) return false;
    const last = lastMovementAt(g);
    const hasOpenTask = tasksForGoal(g.id).some(isOpen);
    return !hasOpenTask && (!last || now - last > 30 * DAY);
  });
  if (idleGoals.length) {
    push(list, {
      key: 'idleGoals', category: 'direcao', severity: idleGoals.length >= 2 ? 2 : 1, signature: idleGoals.length,
      title: idleGoals.length === 1
        ? `“${idleGoals[0].title}” não tem tarefas nem progresso registrado nos últimos 30 dias.`
        : `${capitalizeFirst(numF(idleGoals.length))} das suas ${goals.length} metas ativas não possuem tarefas ou progresso registrado nos últimos 30 dias.`,
      body: 'Uma meta sem próximo passo tende a ficar só na intenção. Defina uma ação pequena — ou arquive, se ela deixou de importar.',
      goalItems: idleGoals.map((g) => g.id),
      facts: [{ v: idleGoals.length, l: idleGoals.length === 1 ? 'meta parada' : 'metas paradas' }, { v: goals.length, l: 'ativas' }],
      how: idleGoals.map((g) => { const l = lastMovementAt(g); return `“${g.title}”: ${l ? `último movimento há ${daysSince(l)} dias` : 'nenhum movimento registrado'}, sem tarefas abertas.`; }),
      actions: idleGoals.length === 1 ? [{ label: 'Definir próximo passo', href: `#/metas/${idleGoals[0].id}`, primary: true }] : [{ label: 'Revisar metas', href: '#/metas?f=paradas', primary: true }],
    });
  }
  const linkedDone = state.events.filter((e) => e.type === 'task.completed' && e.createdAt >= now - 30 * DAY);
  const distinct = new Map(linkedDone.map((e) => [e.entityId, e]));
  const withGoal = [...distinct.values()].filter((e) => e.metadata?.goalId).length;
  if (goals.length >= 1 && distinct.size >= 10 && withGoal / distinct.size < 0.15) {
    push(list, {
      key: 'direction', category: 'direcao', severity: 1, signature: Math.round((withGoal / distinct.size) * 10),
      title: `Nos últimos 30 dias, ${withGoal} de ${distinct.size} tarefas concluídas estavam ligadas a metas.`,
      body: 'Não é um problema em si — muita coisa do dia a dia não faz parte de uma meta. Mas, se suas metas estão paradas, vale transformar uma delas em um próximo passo.',
      facts: [{ v: `${withGoal} de ${distinct.size}`, l: 'ligadas a metas' }],
      how: [`Tarefas concluídas em 30 dias: ${distinct.size}.`, `Ligadas a alguma meta: ${withGoal}.`],
      actions: [{ label: 'Ver metas', href: '#/metas' }],
    });
  }

  /* ----- Ritmo ----- */
  for (const g of goals) {
    const pace = paceOf(g, now);
    if (!pace) continue;
    if (pace.datePassed) {
      push(list, {
        key: `goaldate:${g.id}`, category: 'ritmo', severity: 2, signature: g.targetDate,
        title: `A data da meta “${g.title}” já passou.`,
        body: `Ela está em ${formatPercent(progressOf(g).ratio)}. Você pode escolher um novo prazo ou seguir sem data.`,
        facts: [{ v: formatPercent(progressOf(g).ratio), l: 'concluído' }, { v: `${-pace.daysLeft} dias`, l: 'após a data' }],
        how: [`Data escolhida: ${formatDay(g.targetDate, { withYear: true })}.`, `Progresso atual: ${formatPercent(progressOf(g).ratio)}.`],
        actions: [{ label: 'Ver planejamento', href: `#/metas/${g.id}?ver=plano`, primary: true }],
      });
    } else if (pace.offPace) {
      const money = g.type === 'money';
      push(list, {
        key: `offpace:${g.id}`, category: 'ritmo', severity: 2, signature: Math.round((pace.recent.perDay / pace.neededPerDay) * 10),
        title: `“${g.title}” está abaixo do ritmo necessário.`,
        body: `Para chegar lá até ${formatMonthYear(g.targetDate)}, ${money ? 'seria preciso guardar' : 'seria preciso avançar'} cerca de ${rateText(g, pace.neededPerDay)}. Sua média recente está em ${rateText(g, pace.recent.perDay)}.`,
        facts: [{ v: rateText(g, pace.neededPerDay), l: 'necessário' }, { v: rateText(g, pace.recent.perDay), l: 'média recente' }],
        how: [`Faltam ${formatGoalValue(g, pace.remaining)} em ${pace.daysLeft} dias (até ${formatDay(g.targetDate, { withYear: true })}).`, 'Ritmo necessário = quanto falta ÷ tempo restante.', `Média recente = avanços dos últimos ${pace.recent.windowDays} dias (correções não entram).`],
        actions: [{ label: 'Ver projeção', href: `#/metas/${g.id}?ver=plano`, primary: true }],
      });
    }
  }
  const recentMilestones = state.events.filter((e) => e.type === 'goal.milestone' && e.createdAt >= now - 3 * DAY && e.metadata.pct < 100);
  const latestByGoal = new Map();
  for (const e of recentMilestones) latestByGoal.set(e.entityId, e);
  for (const e of latestByGoal.values()) {
    if (!state.goals.has(e.entityId)) continue;
    push(list, {
      key: `milestone:${e.entityId}:${e.metadata.pct}`, category: 'ritmo', severity: 1, positive: true, signature: 1,
      title: `“${e.label}” chegou a ${e.metadata.pct}%.`, body: MILESTONE_TEXT[e.metadata.pct],
      actions: [{ label: 'Ver meta', href: `#/metas/${e.entityId}` }],
    });
  }

  /* ----- Equilíbrio ----- */
  if (appAgeDays >= 14) {
    const last = lastActivityByArea();
    const neglected = [];
    for (const area of listAreas()) {
      const tasksIn = open.filter((t) => t.areaId === area.id).length;
      const goalsIn = goals.filter((g) => g.areaId === area.id).length;
      if (!tasksIn && !goalsIn) continue;
      const ts = last.get(area.id);
      const days = ts ? daysSince(ts) : Math.floor(appAgeDays);
      if (days >= 14) neglected.push({ area, days, tasksIn, goalsIn });
    }
    neglected.sort((a, b) => b.days - a.days).slice(0, 2).forEach(({ area, days, tasksIn, goalsIn }) => {
      const parts = [tasksIn && plural(tasksIn, 'tarefa aberta', 'tarefas abertas'), goalsIn && plural(goalsIn, 'meta ativa', 'metas ativas')].filter(Boolean);
      push(list, {
        key: `neglected:${area.id}`, category: 'equilibrio', severity: days >= 30 ? 2 : 1, signature: Math.floor(days / 7),
        title: `${area.name} não registra atividade há ${days} dias.`,
        body: `Existem ${parts.join(' e ')} nessa área.`,
        facts: [{ v: `${days} dias`, l: 'sem atividade' }],
        how: ['Atividade = criar, começar ou concluir tarefas e registrar progresso em metas da área.', `Último registro: há ${days} dias.`],
        actions: [{ label: 'Ver área', href: `#/area/${area.id}`, primary: true }],
      });
    });
  }

  /* ----- Cuidados ----- */
  const lastExport = state.settings.lastExportAt;
  if (appAgeDays >= 14 && state.tasks.size + state.goals.size >= 5 && (!lastExport || now - lastExport > 30 * DAY)) {
    push(list, {
      key: 'backup', category: 'cuidados', severity: 1, signature: lastExport ? 1 : 0,
      title: lastExport ? 'Seu último backup tem mais de 30 dias.' : 'Você ainda não fez um backup.',
      body: 'Seus dados ficam só neste navegador. Um arquivo de backup protege contra limpeza de dados ou troca de aparelho.',
      actions: [{ label: 'Exportar backup', type: 'export', primary: true }],
    });
  }

  return finalizeList(list, now);
}

function capitalizeFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function finalizeList(list, now) {
  const seen = new Set();
  const insightState = state.settings.insightState || {};
  return list
    .filter((i) => (seen.has(i.key) ? false : seen.add(i.key)))
    .map((i) => {
      const s = insightState[i.key];
      return { ...i, suppressed: !!s && s.signature === i.signature && now - s.dismissedAt < COOLDOWN[i.severity] };
    })
    .sort((a, b) => b.severity - a.severity);
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
  return computeInsights().filter((i) => !i.suppressed && i.group !== 'momentum' && i.category !== 'cuidados' && !excludeKeys.includes(i.key)).slice(0, limit);
}
