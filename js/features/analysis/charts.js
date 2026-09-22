/**
 * Visualizações da análise. Cada gráfico responde a UMA pergunta,
 * traz uma frase de leitura e nunca aparece vazio sem explicação.
 */
import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { progressBar, button } from '../../ui/components.js';
import { columnChart, pairedChart, planRows, hbarList, projectionChart, scenarioList } from '../../ui/charts.js';
import { labelWithHelp, HELP } from '../../ui/help.js';
import { eventsOf } from '../../core/events.js';
import { series, goalCumulative, planWeeks, capacity, goalsMovement, areaDistribution, dueBreakdown, scopeMatchers } from '../../analysis/engine.js';
import { progressOf, formatGoalValue, paceOf } from '../../domain/goals.js';
import { rateText, projectionModel, horizonScenarios } from '../../domain/planning.js';
import { openTasks } from '../../domain/tasks.js';
import { formatDay, formatMonthShort, formatMonthYear, dayKey, relativeTime, DAY } from '../../utils/dates.js';
import { plural, formatMoney, formatMinutes } from '../../utils/numbers.js';

/** Abas disponíveis por escopo (modo Detalhado). A primeira é a do modo Essencial. */
export function tabsFor(scope) {
  if (scope === 'meta') return [['evolucao', 'Evolução'], ['ritmo', 'Ritmo'], ['cenarios', 'Cenários'], ['registros', 'Registros']];
  if (scope === 'tarefas') return [['fluxo', 'Criadas × concluídas'], ['plano', 'Planejado × realizado'], ['prazos', 'Prazos'], ['adiamentos', 'Adiamentos']];
  if (scope === 'area') return [['atividade', 'Atividade'], ['fluxo', 'Tarefas'], ['metas', 'Metas']];
  return [['atividade', 'Atividade'], ['fluxo', 'Tarefas'], ['plano', 'Planejado × realizado'], ['metas', 'Metas'], ['areas', 'Áreas']];
}
/** Abas que dependem de agrupamento por tempo. */
export const TIME_TABS = new Set(['atividade', 'fluxo', 'registros', 'adiamentos']);

function panel(question, body, reading, { help } = {}) {
  return h('div', { class: 'viz' },
    h('div', { class: 'viz__q', 'data-help-slot': '' }, help ? labelWithHelp(question, help, { className: 'viz__title' }) : h('p', { class: 'viz__title' }, question)),
    body,
    reading && h('p', { class: 'viz__reading' }, reading));
}

export function emptyViz(text, actions = []) {
  return h('div', { class: 'viz-empty' }, icon('info', { size: 18 }), h('div', null, h('p', null, text), actions.length > 0 && h('div', { class: 'viz-empty__actions' }, actions)));
}

const bucketTip = (b, n, one, many) => `${b.long}: ${plural(n, one, many)}`;
const ticks = (list) => {
  const n = list.length;
  const step = Math.ceil(n / (innerWidth < 600 ? 5 : 7));
  // Rótulos espaçados; o último sempre aparece, sem encostar no anterior.
  const idx = new Map(list.map((b, i) => [b.start, i]));
  return (b) => {
    const i = idx.get(b.start) ?? -1;
    return n <= (innerWidth < 600 ? 5 : 8) || i === n - 1 || (i % step === 0 && n - 1 - i >= Math.ceil(step / 2)) ? b.label : '';
  };
};

/* ---------- Tudo / Área ---------- */

function atividade(ctx) {
  const s = series(ctx.sel, ctx.period, ctx.gran);
  const total = s.reduce((a, b) => a + b.completed, 0);
  if (!total) return panel('Quando você concluiu tarefas?', emptyViz('Nenhuma tarefa foi concluída neste período.', ctx.emptyActions()), null);
  const top = s.reduce((m, b) => (b.completed > m.completed ? b : m), s[0]);
  const t = ticks(s);
  if (ctx.compare && ctx.prev) {
    const p = series(ctx.sel, ctx.prev, ctx.gran);
    const pts = s.map((b, i) => ({ ...b, a: p[i]?.completed || 0, b: b.completed, prevLong: p[i]?.long }));
    const prevTotal = p.reduce((a, b) => a + b.completed, 0);
    return panel('Você concluiu mais ou menos do que antes?',
      pairedChart(pts, { key: `cmp-at-${ctx.gran}`, label: `Concluídas: ${total} neste período, ${prevTotal} no anterior.`, a: { key: 'a', label: ctx.prev.label }, b: { key: 'b', label: 'Este período' }, tick: t, tip: (b) => `${b.long}: ${b.b} · ${b.prevLong || 'antes'}: ${b.a}` }),
      `Neste período: ${plural(total, 'conclusão', 'conclusões')}. No ${ctx.prev.label}: ${prevTotal}. Diferença: ${total - prevTotal >= 0 ? '+' : '−'}${Math.abs(total - prevTotal)}.`);
  }
  return panel('Quando você concluiu tarefas?',
    columnChart(s.map((b) => ({ ...b, current: b.start === ctx.todayKey })), { key: `at-${ctx.gran}-${s.length}`, label: `${total} tarefas concluídas.`, valueOf: (b) => b.completed, tip: (b) => bucketTip(b, b.completed, 'concluída', 'concluídas'), tick: t }),
    `Foram ${plural(total, 'tarefa concluída', 'tarefas concluídas')}. ${s.length > 1 ? `O ${ctx.gran === 'dia' ? 'dia' : ctx.gran === 'semana' ? 'período' : 'mês'} mais ativo foi ${top.long.replace('Semana de ', 'a semana de ')}, com ${top.completed}.` : ''}`);
}

function fluxo(ctx) {
  const s = series(ctx.sel, ctx.period, ctx.gran);
  const created = s.reduce((a, b) => a + b.created, 0);
  const done = s.reduce((a, b) => a + b.completed, 0);
  if (!created && !done) return panel('Sua lista está aumentando ou diminuindo?', emptyViz('Nenhuma tarefa foi criada ou concluída neste período.', ctx.emptyActions()), null);
  const saldo = created - done;
  const t = ticks(s);
  return panel('Sua lista está aumentando ou diminuindo?',
    pairedChart(s, { key: `fl-${ctx.gran}-${s.length}`, label: `${created} criadas e ${done} concluídas.`, a: { key: 'created', label: 'Criadas' }, b: { key: 'completed', label: 'Concluídas' }, tick: t, tip: (b) => `${b.long}: ${plural(b.created, 'criada', 'criadas')}, ${plural(b.completed, 'concluída', 'concluídas')}` }),
    `Foram criadas ${created} tarefas e concluídas ${done}. O saldo do período foi ${saldo > 0 ? `+${saldo} ${saldo === 1 ? 'pendência' : 'pendências'}` : saldo < 0 ? `${saldo} ${saldo === -1 ? 'pendência' : 'pendências'} (a lista diminuiu)` : 'zero (a lista ficou do mesmo tamanho)'}.`);
}

function plano(ctx) {
  const weeks = planWeeks(ctx.sel, ctx.period);
  if (!weeks.some((w) => w.planned)) return panel('Seu plano combina com o seu ritmo?', emptyViz('Nenhuma tarefa tinha prazo nas semanas deste período. Com prazos, o Norte compara o planejado com o realizado.'), null, { help: HELP.planejado });
  const cap = capacity();
  const tot = weeks.reduce((a, w) => ({ planned: a.planned + w.planned, done: a.done + w.done, postponed: a.postponed + w.postponed, dropped: a.dropped + w.dropped, pending: a.pending + w.pending }), { planned: 0, done: 0, postponed: 0, dropped: 0, pending: 0 });
  return panel('Seu plano combina com o seu ritmo?',
    h('div', null,
      planRows(weeks, { label: weeks.map((w) => `Semana de ${formatDay(w.start)}: ${w.planned} planejadas, ${w.done} concluídas.`).join(' '), tick: (w) => (w.current ? 'Esta semana' : `Sem. ${formatDay(w.start)}`) }),
      h('dl', { class: 'plan-totals' }, [['Planejadas', tot.planned], ['Concluídas', tot.done], ['Adiadas', tot.postponed], ['Canceladas', tot.dropped], ['Pendentes', tot.pending]].map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v))))),
    `Essa comparação ajuda a perceber se o tamanho do seu plano combina com o seu ritmo real.${cap ? ` Nas últimas ${cap.weeks} semanas, você concluiu em média ${plural(Math.round(cap.avgDone), 'tarefa', 'tarefas')} por semana.` : ''}`,
    { help: HELP.planejado });
}

function metas(ctx) {
  const rows = goalsMovement(ctx.sel, ctx.period);
  if (!rows.length) return panel('Suas metas estão avançando?', emptyViz('Não há metas ativas neste escopo.', [button('Criar meta', { size: 'sm', icon: 'plus', onClick: () => ctx.openGoalForm() })]), null);
  const moved = rows.filter((r) => r.records).length;
  return panel('Suas metas estão avançando?',
    h('ul', { class: 'goal-move' }, rows.map((r) => h('li', null, h('a', { class: 'goal-move__row', href: `#/metas/${r.goal.id}` },
      h('span', { class: 'goal-move__title' }, r.goal.title),
      progressBar(r.ratio, { key: `am-${r.goal.id}`, size: 'sm', label: `Progresso de ${r.goal.title}`, tone: r.pace?.offPace || r.pace?.datePassed ? 'warn' : null }),
      h('span', { class: 'goal-move__info' }, r.records
        ? `${r.goal.type === 'steps' ? plural(r.advance, 'etapa', 'etapas') : `${r.advance >= 0 ? '+' : '−'} ${formatGoalValue(r.goal, Math.abs(r.advance))}`} no período`
        : `sem registro no período${r.last ? ` · último ${relativeTime(r.last)}` : ''}`),
      h('span', { class: 'goal-move__pct' }, `${Math.round(r.ratio * 100)}%`))))),
    `${moved} de ${plural(rows.length, 'meta ativa', 'metas ativas')} ${moved === 1 ? 'teve' : 'tiveram'} progresso registrado neste período.`);
}

function areas(ctx) {
  const d = areaDistribution(ctx.sel, ctx.period);
  if (!d.total) return panel('Onde sua energia foi colocada?', emptyViz('Nada foi concluído ou registrado neste período.', ctx.emptyActions()), null, { help: HELP.area });
  const top = d.rows[0];
  return panel('Onde sua energia foi colocada?',
    hbarList(d.rows.map((r) => ({ label: r.area ? r.area.name : 'Sem área', color: r.area?.color, value: r.count, href: r.area ? `#/area/${r.area.id}` : null })), { label: 'Atividade por área', valueText: (r) => (r.value ? `${Math.round((r.value / d.total) * 100)}%` : '—') }),
    `${top.area ? top.area.name : 'Tarefas sem área'} concentrou ${Math.round((top.count / d.total) * 100)}% da atividade (tarefas concluídas e avanços em metas).`, { help: HELP.area });
}

/* ---------- Tarefas ---------- */

function prazos(ctx) {
  const d = dueBreakdown(ctx.sel);
  if (!d.total) return panel('Como estão os prazos das tarefas abertas?', emptyViz('Não há tarefas abertas agora.', ctx.emptyActions()), null);
  const late = d.rows[0].value;
  return panel('Como estão os prazos das tarefas abertas?',
    hbarList(d.rows.map((r) => ({ label: r.label, value: r.value, href: r.href, color: r.id === 'late' ? 'rose' : null })), { label: 'Tarefas abertas por prazo', valueText: (r) => String(r.value) }),
    `Hoje há ${plural(d.total, 'tarefa aberta', 'tarefas abertas')}${late ? `, ${late} com prazo vencido` : ', nenhuma com prazo vencido'}. Toque em uma linha para ver as tarefas.`);
}

function adiamentos(ctx) {
  const s = series(ctx.sel, ctx.period, ctx.gran);
  const total = s.reduce((a, b) => a + b.postponed, 0);
  const { taskOk } = scopeMatchers(ctx.sel);
  const top = openTasks().filter((t) => taskOk(t) && (t.postponedCount || 0) >= 2).sort((a, b) => b.postponedCount - a.postponedCount).slice(0, 4);
  if (!total && !top.length) return panel('O que está sendo adiado?', emptyViz('Nenhum adiamento neste período.'), null);
  const t = ticks(s);
  return panel('O que está sendo adiado?',
    h('div', null,
      total > 0 && columnChart(s, { key: `ad-${ctx.gran}-${s.length}`, label: `${total} adiamentos.`, valueOf: (b) => b.postponed, tip: (b) => bucketTip(b, b.postponed, 'adiamento', 'adiamentos'), tick: t }),
      top.length > 0 && h('ul', { class: 'mini-list' }, top.map((x) => h('li', null, h('button', { type: 'button', class: 'mini-list__btn', onClick: () => ctx.openTask(x.id) }, h('span', null, x.title), h('span', { class: 'meta-muted' }, `adiada ${x.postponedCount}×`)))))),
    `${total ? `${plural(total, 'adiamento', 'adiamentos')} neste período.` : 'Nenhum adiamento neste período.'}${top.length ? ` ${plural(top.length, 'tarefa aberta foi adiada', 'tarefas abertas foram adiadas')} duas vezes ou mais.` : ''}`);
}

/* ---------- Meta ---------- */

function evolucao(ctx) {
  const g = ctx.goal;
  if (g.type === 'steps') {
    const cum = goalCumulative(g, ctx.period, ctx.gran);
    const p = progressOf(g);
    return panel('A meta está avançando?',
      columnChart(cum, { key: `gs-${g.id}-${ctx.gran}`, label: `${p.current} de ${p.target} etapas.`, valueOf: (b) => b.value, max: p.target, tip: (b) => `${b.long}: ${b.value} de ${p.target} etapas`, tick: ticks(cum) }),
      `${p.current} de ${p.target} etapas concluídas.`);
  }
  const evs = eventsOf(g.id).filter((e) => e.type === 'goal.progress');
  const initial = eventsOf(g.id).find((e) => e.type === 'goal.created')?.metadata?.initial || 0;
  const history = [{ t: g.createdAt, v: initial, start: true }, ...evs.map((e) => ({ t: e.createdAt, v: e.metadata.after, delta: e.metadata.delta, kind: e.metadata.kind }))];
  const pace = paceOf(g);
  const model = projectionModel(g, { endDate: g.targetDate, history, recentPerDay: pace?.recent?.perDay || null });
  const fmt = (v) => (g.type === 'money' ? formatMoney(Math.round(v / 100) * 100) : g.type === 'time' ? formatMinutes(v) : formatGoalValue(g, Math.round(v)));
  const p = progressOf(g);
  const reading = [`${formatGoalValue(g, p.current)} de ${formatGoalValue(g, p.target)}.`];
  if (pace?.recent?.perDay > 0 && pace.projectionDays) reading.push(`Mantendo a média recente, a meta tende a ser atingida por volta de ${formatMonthYear(new Date(Date.now() + pace.projectionDays * DAY))} (estimativa).`);
  else if (p.remaining > 0) reading.push('Ainda não há registros suficientes para estimar quando a meta será atingida.');
  return panel('A meta está avançando?',
    projectionChart({
      history, model, formatValue: fmt, formatDate: (t) => formatMonthShort(new Date(t)), label: reading.join(' '),
      pointTip: (pt) => `${formatDay(dayKey(pt.t))} · ${pt.start ? `início: ${formatGoalValue(g, pt.v)}` : `${pt.kind === 'correction' ? 'correção' : pt.delta >= 0 ? `+ ${formatGoalValue(g, pt.delta)}` : `− ${formatGoalValue(g, -pt.delta)}`} (total ${formatGoalValue(g, pt.v)})`}`,
    }),
    reading.join(' '), { help: HELP.projecao });
}

function ritmo(ctx) {
  const g = ctx.goal;
  const pace = paceOf(g);
  if (!pace || progressOf(g).remaining <= 0) return panel('Qual ritmo é preciso manter?', emptyViz('A meta já foi concluída ou não está ativa.'), null, { help: HELP.ritmo });
  const needed = pace.neededPerDay; const recent = pace.recent?.perDay;
  if (needed == null && recent == null) return panel('Qual ritmo é preciso manter?', emptyViz('Defina uma data para a meta ou registre progresso por algumas semanas para comparar ritmos.', [button('Ver planejamento da meta', { size: 'sm', onClick: () => { location.hash = `#/metas/${g.id}?ver=plano`; } })]), null, { help: HELP.ritmo });
  const top = Math.max(needed || 0, recent || 0, 1e-9);
  const bar = (label, v, cls) => h('div', { class: 'pace-bar' }, h('span', { class: 'pace-bar__label' }, label), h('span', { class: 'pace-bar__track' }, h('span', { class: `pace-bar__fill ${cls}`, style: { width: `${v != null ? Math.max(3, (v / top) * 100) : 0}%` } })), h('span', { class: 'pace-bar__value' }, v != null ? rateText(g, v) : '—'));
  return panel('Qual ritmo é preciso manter?',
    h('div', { class: 'pace-bars' }, bar('Necessário', needed, 'is-plan'), bar('Média recente', recent, 'is-recent')),
    needed == null ? 'A meta não tem data; por isso não há ritmo necessário. Veja os cenários para escolher um prazo.'
      : recent == null ? `Para chegar lá até ${formatMonthYear(g.targetDate)}, é preciso cerca de ${rateText(g, needed)}. Ainda não há histórico para comparar.`
        : recent >= needed * 0.95 ? `A média recente (${rateText(g, recent)}) acompanha o ritmo necessário (${rateText(g, needed)}).`
          : `A média recente (${rateText(g, recent)}) está abaixo do necessário (${rateText(g, needed)}). Dá para ajustar o prazo ou o valor por período.`,
    { help: HELP.ritmo });
}

function cenarios(ctx) {
  const g = ctx.goal;
  const hsc = horizonScenarios(g).filter((x) => x.perDay);
  if (!hsc.length) return panel('O que muda com outro prazo?', emptyViz('A meta já foi concluída.'), null);
  return panel('O que muda com outro prazo?',
    scenarioList(hsc.map((x) => ({ id: x.id, label: x.label, value: x.short, weight: x.perDay })), { label: 'Ritmo necessário para cada prazo', onSelect: () => { location.hash = `#/metas/${g.id}?ver=plano`; } }),
    'Barras maiores indicam um ritmo mais puxado. Toque em um prazo para abrir o planejamento da meta.');
}

function registros(ctx) {
  const g = ctx.goal;
  const s = series(ctx.sel, ctx.period, ctx.gran);
  const total = s.reduce((a, b) => a + b.records, 0);
  if (!total) return panel('Quando você registrou progresso?', emptyViz('Nenhum progresso foi registrado neste período.', [button('Registrar progresso', { size: 'sm', icon: 'plus', onClick: () => ctx.logProgress(g.id) })]), null);
  const fmtAdv = (v) => (g.type === 'steps' ? plural(v, 'etapa', 'etapas') : formatGoalValue(g, Math.abs(v)));
  const adv = s.reduce((a, b) => a + b.advance, 0);
  return panel('Quando você registrou progresso?',
    columnChart(s, { key: `rg-${g.id}-${ctx.gran}-${s.length}`, label: `${total} registros.`, valueOf: (b) => Math.max(0, b.advance), tip: (b) => `${b.long}: ${b.records ? `${b.advance >= 0 ? '+' : '−'} ${fmtAdv(b.advance)}` : 'sem registro'}`, tick: ticks(s) }),
    `${plural(total, 'registro', 'registros')} neste período, somando ${adv >= 0 ? '+' : '−'} ${fmtAdv(adv)}.`);
}

const RENDER = { atividade, fluxo, plano, metas, areas, prazos, adiamentos, evolucao, ritmo, cenarios, registros };
export const renderViz = (tab, ctx) => (RENDER[tab] || atividade)(ctx);

