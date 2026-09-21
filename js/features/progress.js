/** Progresso: "O que realmente aconteceu?" */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { sectionHead, pageHead, emptyState, button } from '../ui/components.js';
import { columnChart, hbarList, planRows } from '../ui/charts.js';
import { labelWithHelp, entenda, HELP } from '../ui/help.js';
import { state } from '../core/store.js';
import { rangeSummary, dailySeries, weeklyFromDaily, energyByArea, notableEvents, plannedVsDone, recentCapacity } from '../domain/stats.js';
import { openTasks, isOverdue } from '../domain/tasks.js';
import { formatMoney, formatMinutes, plural } from '../utils/numbers.js';
import { today, diffDays, formatDay, formatDayLong, weekdayShort, relativeTime, startOfDayTs, endOfDayTs } from '../utils/dates.js';
import { pickCopy } from '../content/microcopy.js';
import { resolvePeriod, periodControl } from './period.js';
import { openReview, weekTaskIds } from './review.js';

export function progressView(route) {
  const per = resolvePeriod(route.query);
  const view = h('div', { class: 'view view--wide view--progress' },
    pageHead('Progresso', pickCopy('progress', [state.events.length ? 'any' : 'empty']), periodControl('progresso', per)));

  if (!state.events.length) {
    add(view, emptyState({ icon: 'trend', title: 'Ainda não há nada para mostrar.', text: 'Conforme você cria, conclui e avança em metas, o Norte registra tudo aqui — sem você precisar anotar nada.' }));
    return view;
  }

  const from = startOfDayTs(per.from);
  const to = endOfDayTs(per.to);
  const s = rangeSummary(from, to);
  const energy = energyByArea(from, to);
  const topArea = energy.rows.find((r) => r.count > 0 && r.area);
  const overdueNow = openTasks().filter((t) => isOverdue(t)).length;

  add(view, h('p', { class: 'period-caption' }, `Resumo ${per.label}${per.id === '30' || per.id === '7' ? '' : ` (${formatDayLong(per.from)} a ${formatDayLong(per.to)})`}.`),
    h('section', { class: 'stats', 'aria-label': `Resumo ${per.label}` },
      stat(s.completed, 'tarefas concluídas', null, 'ok', '#/tarefas?ver=concluidas'),
      stat(s.created, 'tarefas criadas'),
      stat(s.postponed, 'adiamentos', s.postponed ? 'prazos empurrados' : null, s.postponed >= 5 ? 'warn' : null, '#/tarefas?f=travadas'),
      stat(s.dropped, 'canceladas', null, null, '#/tarefas?ver=canceladas'),
      stat(s.goalsMoved, 'metas movimentadas', null, null, '#/metas'),
      stat(s.moneyIn ? formatMoney(s.moneyIn) : '—', 'avanço financeiro', s.moneyOut ? `${formatMoney(s.moneyOut)} retirados` : null, null, s.moneyIn ? '#/metas' : null),
      stat(s.minutes ? formatMinutes(s.minutes) : '—', 'tempo registrado', null, null, s.minutes ? '#/metas' : null),
      stat(topArea ? topArea.area.name : '—', 'área mais ativa', topArea ? plural(topArea.count, 'registro', 'registros') : null, null, topArea ? `#/area/${topArea.area.id}` : null)),
    h('p', { class: 'muted small' }, `Agora: ${plural(openTasks().length, 'tarefa aberta', 'tarefas abertas')}${overdueNow ? `, ${overdueNow} com prazo vencido` : ''}.`));

  const days = diffDays(per.from, per.to) + 1;
  const daily = dailySeries(per.from, per.to);
  const weekly = days > 35;
  const series = weekly ? weeklyFromDaily(daily) : daily;
  const total = series.reduce((a, p) => a + p.completed, 0);
  add(view, h('section', { class: 'card section' },
    sectionHead('Tarefas concluídas', { action: h('span', { class: 'muted small' }, weekly ? 'por semana' : 'por dia') }),
    total ? columnChart(series.map((p) => ({ ...p, current: p.date === today() })), {
      key: `progress-${weekly ? 'w' : 'd'}-${series.length}`,
      label: `${total} tarefas concluídas ${per.label}.`,
      valueOf: (p) => p.completed,
      tip: (p) => `${weekly ? 'Semana de ' : ''}${formatDay(p.date)}: ${plural(p.completed, 'concluída', 'concluídas')}, ${plural(p.created, 'criada', 'criadas')}`,
      tick: (p) => tickLabel(p, series, days),
    }) : h('p', { class: 'muted' }, 'Nenhuma tarefa concluída neste período.')));

  add(view, planSection());

  add(view, h('div', { class: 'grid-2 grid-2--top' },
    h('section', { class: 'card section' },
      sectionHead(labelWithHelp('Onde coloquei minha energia', HELP.area, { className: 'label' })),
      energy.total
        ? [h('p', { class: 'muted small' }, 'Tarefas concluídas e avanços em metas, por área.'),
          hbarList(energy.rows.filter((r) => r.count > 0 || r.area).map((r) => ({ label: r.area ? r.area.name : 'Sem área', color: r.area?.color, value: r.count, href: r.area ? `#/area/${r.area.id}` : null })),
            { label: 'Energia por área', valueText: (r) => (r.value ? `${Math.round((r.value / energy.total) * 100)}%` : '—') })]
        : h('p', { class: 'muted' }, 'Nada concluído neste período ainda.')),
    h('section', { class: 'card section' }, sectionHead('Acontecimentos'), happenings(from, to))));
  return view;
}

function planSection() {
  const weeks = plannedVsDone(6);
  const cap = recentCapacity();
  const cur = weeks[weeks.length - 1];
  const sec = h('section', { class: 'card section', id: 'planejado' },
    sectionHead(labelWithHelp('Planejado × realizado', HELP.planejado, { className: 'label' }), { action: h('span', { class: 'muted small' }, 'por semana') }));
  if (!weeks.some((w) => w.planned)) {
    add(sec, h('p', { class: 'muted' }, 'Quando suas tarefas tiverem prazo, o Norte compara o que foi planejado para cada semana com o que foi feito.'));
    return sec;
  }
  add(sec, planRows(weeks, {
    label: weeks.map((w) => `Semana de ${formatDay(w.start)}: ${w.planned} planejadas, ${w.done} concluídas, ${w.postponed} adiadas, ${w.dropped} canceladas, ${w.pending} pendentes.`).join(' '),
    tick: (w) => (w.current ? 'Esta semana' : `Sem. ${formatDay(w.start)}`),
  }));
  add(sec, h('p', { class: 'plan-week' },
    h('strong', null, 'Esta semana: '),
    `${plural(cur.planned, 'planejada', 'planejadas')} · ${cur.done} concluídas · ${cur.postponed} adiadas · ${cur.dropped} canceladas · ${cur.pending} pendentes.`));
  if (cap) {
    add(sec, h('p', { class: 'cap-line' }, icon('info', { size: 15 }),
      h('span', null, `Nas últimas ${cap.planWeeks} semanas, você planejou em média ${plural(Math.round(cap.avgPlanned), 'tarefa', 'tarefas')} por semana e concluiu ${Math.round(cap.avgPlannedDone)} delas. Considerando tudo, concluiu em média ${plural(Math.round(cap.avgDone), 'tarefa', 'tarefas')} por semana nas últimas ${cap.weeks} semanas.`)));
    if (cur.planned > cap.avgDone * 1.5 && cur.planned - cap.avgDone >= 5) {
      add(sec, h('div', { class: 'cap-warn' },
        h('p', null, 'Seu plano atual está significativamente acima do seu ritmo recente. Considere revisar quantidade, prazos ou importância.'),
        button('Revisar esta semana', { size: 'sm', icon: 'refresh', onClick: () => openReview(weekTaskIds(), { title: 'Revisar esta semana' }) })));
    }
  } else {
    add(sec, h('p', { class: 'muted small' }, 'Com pelo menos 3 semanas de uso, o Norte calcula sua capacidade média por semana.'));
  }
  add(sec, entenda('Como isso é calculado',
    h('p', null, 'Uma tarefa conta como “planejada” para a semana em que tinha prazo (na criação ou ao ser reagendada).'),
    h('p', null, 'No fim da semana ela aparece como concluída, adiada para depois, cancelada ou ainda pendente.'),
    h('p', null, 'Os números servem para calibrar quanto cabe numa semana sua — não para julgar.')));
  return sec;
}

function stat(value, label, sub, tone, href) {
  return h(href ? 'a' : 'div', { class: ['stat', tone && `stat--${tone}`, href && 'stat--link'], href: href || null },
    h('span', { class: 'stat__value' }, value),
    h('span', { class: 'stat__label' }, label),
    sub && h('span', { class: 'stat__sub' }, sub));
}

function tickLabel(p, series, days) {
  const i = series.indexOf(p);
  if (days <= 7) return weekdayShort(p.date);
  if (days <= 35) return i % 5 === 0 || i === series.length - 1 ? formatDay(p.date).split(' ')[0] : '';
  return i % Math.max(1, Math.round(series.length / 6)) === 0 ? formatDay(p.date) : '';
}

function happenings(from, to) {
  const list = notableEvents(from, to, 10);
  if (!list.length) return h('p', { class: 'muted' }, 'Nenhum acontecimento marcante neste período. Marcos de metas e conclusões importantes aparecem aqui.');
  return h('ol', { class: 'happenings' }, list.map((e) => h('li', { class: `happening happening--${e.tone}` },
    h('span', { class: 'happening__icon', 'aria-hidden': 'true' }, icon(e.tone === 'good' ? 'check' : e.tone === 'neutral' ? 'ban' : 'info', { size: 14 })),
    e.href ? h('a', { href: e.href, class: 'happening__text' }, e.text) : h('span', { class: 'happening__text' }, e.text),
    h('time', { class: 'meta-muted' }, relativeTime(e.ts)))));
}
