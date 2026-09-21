/**
 * Motor de insights: regras determinísticas → poucos alertas relevantes.
 *
 * Cada insight tem:
 *  - key: identidade estável (deduplicação);
 *  - severity: 3 atenção · 2 observar · 1 registro;
 *  - signature: resumo do "tamanho" do problema. Se o usuário dispensou e a
 *    assinatura não mudou, o insight só volta depois do cooldown.
 *  - actions: portas para ação (a UI decide como executar cada tipo).
 */
import { state, commit } from '../core/store.js';
import { DAY, today, formatDay, formatMonthYear, daysSince } from '../utils/dates.js';
import { plural, timesText, formatPercent } from '../utils/numbers.js';
import { openTasks, isOverdue, stuckTasks } from './tasks.js';
import { activeGoals, paceOf, rateText, MILESTONE_TEXT, progressOf } from './goals.js';
import { openInboxItems } from './inbox.js';
import { lastActivityByArea } from '../core/events.js';
import { listAreas } from './areas.js';
import { completedIds, countType } from './stats.js';

const COOLDOWN = { 3: 2 * DAY, 2: 4 * DAY, 1: 7 * DAY };
const TONE = { 3: 'attention', 2: 'watch', 1: 'info' };

function push(list, ins) {
  list.push({ tone: ins.positive ? 'good' : TONE[ins.severity], ...ins });
}

export function computeInsights(now = Date.now()) {
  const list = [];
  const T = today();
  const open = openTasks();
  const appAgeDays = state.settings.firstRunAt ? (now - state.settings.firstRunAt) / DAY : 0;

  // 1. Atrasadas
  const overdue = open.filter((t) => isOverdue(t, T)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (overdue.length) {
    const first = overdue[0];
    push(list, {
      key: 'overdue', group: 'overdue', severity: overdue.length >= 5 ? 3 : 2, signature: overdue.length,
      title: overdue.length === 1 ? '1 tarefa está atrasada.' : `${overdue.length} tarefas estão atrasadas.`,
      body: overdue.length === 1
        ? `“${first.title}” estava prevista para ${formatDay(first.dueDate)}.`
        : `A mais antiga é “${first.title}”, prevista para ${formatDay(first.dueDate)}.`,
      items: overdue.map((t) => t.id),
      actions: overdue.length === 1
        ? [{ label: 'Abrir tarefa', type: 'openTask', id: first.id }]
        : [{ label: 'Revisar uma a uma', type: 'review', ids: overdue.map((t) => t.id), primary: true }, { label: 'Ver na lista', href: '#/tarefas?f=atrasadas' }],
    });
  }

  // 2. Tarefas travadas (adiadas 3+ vezes)
  for (const t of stuckTasks(3).slice(0, 2)) {
    const recent = state.events.filter((e) => e.entityId === t.id && e.type === 'task.postponed' && e.createdAt >= now - 14 * DAY).length;
    push(list, {
      key: `stuck:${t.id}`, group: 'stuck', severity: 2, signature: t.postponedCount,
      title: recent >= 2
        ? `“${t.title}” foi adiada ${timesText(recent)} nas últimas duas semanas.`
        : `“${t.title}” já foi adiada ${timesText(t.postponedCount)}.`,
      body: 'Quando algo é adiado tantas vezes, geralmente está grande demais, pouco claro ou já não importa.',
      actions: [
        { label: 'Fazer agora', type: 'startTask', id: t.id, primary: true },
        { label: 'Escolher outra data', type: 'openTask', id: t.id },
        { label: 'Não vou fazer', type: 'dropTask', id: t.id },
      ],
    });
  }

  // 3. Acúmulo: entrando mais do que saindo
  const from14 = now - 14 * DAY;
  const created14 = countType('task.created', from14);
  const done14 = completedIds(from14).size;
  if (created14 >= 8 && created14 > done14 * 1.5 + 2) {
    push(list, {
      key: 'accumulation', group: 'review', severity: 2, signature: Math.round(created14 / Math.max(done14, 1)),
      title: `Nos últimos 14 dias você criou ${created14} tarefas e concluiu ${done14}.`,
      body: 'Sua lista está crescendo mais rápido do que você consegue esvaziá-la.',
      actions: [{ label: 'Revisar tarefas pendentes', type: 'review', primary: true }, { label: 'Ver entradas e saídas', href: '#/analises?ver=fluxo' }],
    });
  } else if (open.length >= 25) {
    // 4. Lista longa demais
    push(list, {
      key: 'backlog', group: 'review', severity: 2, signature: Math.floor(open.length / 5),
      title: `${open.length} tarefas abertas.`,
      body: 'Uma lista longa costuma esconder o que importa. Algumas provavelmente já perderam o sentido.',
      actions: [{ label: 'Revisar a lista', type: 'review', primary: true }],
    });
  }

  // 5. Área esquecida
  if (appAgeDays >= 14) {
    const last = lastActivityByArea();
    const goals = activeGoals();
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
        key: `neglected:${area.id}`, group: 'neglected', severity: days >= 30 ? 2 : 1, signature: Math.floor(days / 7),
        title: `Você não registra atividade em ${area.name} há ${days} dias.`,
        body: `Existem ${parts.join(' e ')} nessa área.`,
        actions: [{ label: `Ver ${area.name}`, href: `#/area/${area.id}`, primary: true }],
      });
    });
  }

  // 6. Metas: fora do ritmo, data vencida, paradas
  for (const g of activeGoals()) {
    const pace = paceOf(g, now);
    if (pace?.datePassed) {
      push(list, {
        key: `goaldate:${g.id}`, group: 'goal', severity: 2, signature: g.targetDate,
        title: `A data da meta “${g.title}” já passou.`,
        body: `Ela está em ${formatPercent(progressOf(g).ratio)}. Você pode escolher uma nova data ou seguir sem prazo.`,
        actions: [{ label: 'Ver meta', href: `#/metas/${g.id}`, primary: true }],
      });
    } else if (pace?.offPace) {
      push(list, {
        key: `offpace:${g.id}`, group: 'goal', severity: 2, signature: Math.round((pace.avgPerDay / pace.neededPerDay) * 10),
        title: `“${g.title}” está abaixo do ritmo necessário.`,
        body: `Para chegar lá até ${formatMonthYear(g.targetDate)}, seria necessário avançar aproximadamente ${rateText(g, pace.neededPerDay)}. Sua média recente está em ${rateText(g, pace.avgPerDay)}.`,
        actions: [{ label: 'Ver meta', href: `#/metas/${g.id}`, primary: true }],
      });
    } else {
      const lastMove = state.events.filter((e) => e.entityId === g.id && (e.type === 'goal.progress' || e.type === 'goal.step')).pop();
      const idle = daysSince(lastMove?.createdAt || g.createdAt);
      if (idle >= 30) {
        push(list, {
          key: `goalidle:${g.id}`, group: 'goal', severity: 1, signature: Math.floor(idle / 15),
          title: `“${g.title}” não avança há ${idle} dias.`,
          body: 'Se ela ainda importa, um pequeno passo já muda o quadro. Se não importa mais, tudo bem arquivar.',
          actions: [{ label: 'Ver meta', href: `#/metas/${g.id}`, primary: true }],
        });
      }
    }
  }

  // 7. Marcos recentes (positivo, discreto)
  const recentMilestones = state.events.filter((e) => e.type === 'goal.milestone' && e.createdAt >= now - 3 * DAY && e.metadata.pct < 100);
  const latestByGoal = new Map();
  for (const e of recentMilestones) latestByGoal.set(e.entityId, e);
  for (const e of latestByGoal.values()) {
    push(list, {
      key: `milestone:${e.entityId}:${e.metadata.pct}`, group: 'milestone', severity: 1, positive: true, signature: 1,
      title: `“${e.label}” chegou a ${e.metadata.pct}%.`,
      body: MILESTONE_TEXT[e.metadata.pct],
      actions: [{ label: 'Ver meta', href: `#/metas/${e.entityId}` }],
    });
  }

  // 8. Caixa de entrada acumulando
  const inbox = openInboxItems();
  const oldestDays = inbox.length ? daysSince(inbox[0].createdAt) : 0;
  if (inbox.length >= 5 || (inbox.length && oldestDays >= 3)) {
    push(list, {
      key: 'inbox', group: 'inbox', severity: inbox.length >= 10 ? 2 : 1, signature: Math.floor(inbox.length / 3),
      title: `${plural(inbox.length, 'item espera', 'itens esperam')} decisão na caixa de entrada.`,
      body: oldestDays >= 3 ? `O mais antigo está lá há ${oldestDays} dias. Decidir o que cada um é leva poucos minutos.` : 'Decidir o que cada um é leva poucos minutos.',
      actions: [{ label: 'Organizar agora', type: 'organize', primary: true }],
    });
  }

  // 9. Evolução (fato, sem extrapolar significado)
  const done7 = completedIds(now - 7 * DAY).size;
  const donePrev7 = completedIds(now - 14 * DAY, now - 7 * DAY).size;
  if (appAgeDays >= 14 && done7 + donePrev7 >= 3) {
    push(list, {
      key: 'momentum', group: 'momentum', severity: 1, signature: `${done7}-${donePrev7}`,
      title: `Nos últimos 7 dias você concluiu ${plural(done7, 'tarefa', 'tarefas')}.`,
      body: `Nos 7 dias anteriores ${donePrev7 === 1 ? 'foi 1' : `foram ${donePrev7}`}.`,
      actions: [{ label: 'Ver progresso', href: '#/progresso' }],
    });
  }

  // 10. Backup (os dados só existem neste navegador)
  const lastExport = state.settings.lastExportAt;
  if (appAgeDays >= 14 && state.tasks.size + state.goals.size >= 5 && (!lastExport || now - lastExport > 30 * DAY)) {
    push(list, {
      key: 'backup', group: 'backup', severity: 1, signature: lastExport ? 1 : 0,
      title: lastExport ? 'Seu último backup tem mais de 30 dias.' : 'Você ainda não fez um backup.',
      body: 'Seus dados ficam só neste navegador. Um arquivo de backup protege contra limpeza de dados ou troca de aparelho.',
      actions: [{ label: 'Exportar backup', type: 'export', primary: true }],
    });
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
      const suppressed = !!s && s.signature === i.signature && now - s.dismissedAt < COOLDOWN[i.severity];
      return { ...i, suppressed };
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

/** Tela inicial: no máximo `limit` insights, priorizando o que pede ação. */
export function homeInsights(limit = 2) {
  const visible = computeInsights().filter((i) => !i.suppressed && i.group !== 'momentum');
  return visible.slice(0, limit);
}
