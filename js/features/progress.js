/** Progresso: "O que aconteceu comigo ao longo do tempo?" */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { segmented, sectionHead, pageHead, emptyState, button } from '../ui/components.js';
import { columnChart, hbarList } from '../ui/charts.js';
import { go } from '../core/router.js';
import { periodSummary, dailySeries, weeklyFromDaily, energyByArea, notableEvents } from '../domain/stats.js';
import { formatMoney, plural } from '../utils/numbers.js';
import { formatDay, weekdayShort, relativeTime, today, diffDays } from '../utils/dates.js';
import { state } from '../core/store.js';

const PERIODS = [7, 30, 90];

export function progressView(route) {
  const days = PERIODS.includes(Number(route.query.dias)) ? Number(route.query.dias) : 30;
  const s = periodSummary(days);
  const view = h('div', { class: 'view view--wide view--progress' },
    pageHead('Progresso', 'O que aconteceu ao longo do tempo.',
      segmented(PERIODS.map((d) => ({ value: d, label: `${d} dias` })), days, (v) => go(`progresso?dias=${v}`), { label: 'Período' })));

  if (!state.events.length) {
    add(view, emptyState({
      icon: 'trend', title: 'Ainda não há nada para mostrar.',
      text: 'Conforme você cria, conclui e avança em metas, o sistema registra tudo aqui — sem você precisar anotar nada.',
      actions: [button('Ir para o início', { onClick: () => go('inicio') })],
    }));
    return view;
  }

  add(view, h('section', { class: 'stats', 'aria-label': `Resumo dos últimos ${days} dias` },
    stat(s.completed, 'concluídas', s.completedPrev != null ? compareText(s.completed, s.completedPrev, days) : null),
    stat(s.created, 'criadas', s.dropped ? `${plural(s.dropped, 'deixada', 'deixadas')} de lado` : null),
    stat(s.openNow, 'abertas agora', s.overdueNow ? `${s.overdueNow} atrasada${s.overdueNow > 1 ? 's' : ''}` : 'nenhuma atrasada'),
    stat(s.moneyIn ? formatMoney(s.moneyIn) : s.goalsMoved, s.moneyIn ? 'guardados em metas' : 'metas movimentadas',
      s.moneyIn ? `${plural(s.goalsMoved, 'meta movimentada', 'metas movimentadas')}${s.moneyOut ? ` · ${formatMoney(s.moneyOut)} retirados` : ''}` : null)));

  const daily = dailySeries(days);
  const series = days > 30 ? weeklyFromDaily(daily) : daily;
  const ref = today();
  const total = series.reduce((a, p) => a + p.completed, 0);
  add(view, h('section', { class: 'card section' },
    sectionHead('Tarefas concluídas', { action: h('span', { class: 'muted small' }, days > 30 ? 'por semana' : 'por dia') }),
    total ? columnChart(series.map((p) => ({ ...p, current: p.date === ref || (days > 30 && diffDays(p.date, ref) < 7) })), {
      label: `${total} tarefas concluídas nos últimos ${days} dias.`,
      valueOf: (p) => p.completed,
      tip: (p) => `${days > 30 ? 'Semana de ' : ''}${formatDay(p.date)}: ${plural(p.completed, 'concluída', 'concluídas')}, ${plural(p.created, 'criada', 'criadas')}`,
      tick: (p) => tickLabel(p, series, days),
    }) : h('p', { class: 'muted' }, 'Nenhuma tarefa concluída neste período.')));

  const energy = energyByArea(days);
  add(view, h('div', { class: 'grid-2 grid-2--top' },
    h('section', { class: 'card section' },
      sectionHead('Onde coloquei minha energia'),
      energy.total
        ? [h('p', { class: 'muted small' }, 'Tarefas concluídas e avanços em metas, por área.'),
          hbarList(energy.rows.filter((r) => r.count > 0 || r.area).map((r) => ({
            label: r.area ? r.area.name : 'Sem área', color: r.area?.color, value: r.count,
            href: r.area ? `#/area/${r.area.id}` : null,
          })), { label: 'Energia por área', valueText: (r) => (r.value ? `${Math.round((r.value / energy.total) * 100)}%` : '—') })]
        : h('p', { class: 'muted' }, 'Nada concluído neste período ainda.')),
    h('section', { class: 'card section' },
      sectionHead('Acontecimentos'),
      happenings(days))));
  return view;
}

function stat(value, label, sub) {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat__value' }, value),
    h('span', { class: 'stat__label' }, label),
    sub && h('span', { class: 'stat__sub' }, sub));
}

function compareText(now, prev, days) {
  if (!now && !prev) return null;
  return `${prev} nos ${days} dias anteriores`;
}

function tickLabel(p, series, days) {
  const i = series.indexOf(p);
  if (days === 7) return weekdayShort(p.date);
  if (days === 30) return i % 5 === 0 || i === series.length - 1 ? formatDay(p.date).split(' ')[0] : '';
  return i % 3 === 0 ? formatDay(p.date) : '';
}

function happenings(days) {
  const list = notableEvents(days, 10);
  if (!list.length) return h('p', { class: 'muted' }, 'Nenhum acontecimento marcante neste período. Marcos de metas e conclusões importantes aparecem aqui.');
  return h('ol', { class: 'happenings' }, list.map((e) => h('li', { class: `happening happening--${e.tone}` },
    h('span', { class: 'happening__icon', 'aria-hidden': 'true' }, icon(e.tone === 'good' ? 'spark' : e.tone === 'neutral' ? 'ban' : 'info', { size: 14 })),
    e.href ? h('a', { href: e.href, class: 'happening__text' }, e.text) : h('span', { class: 'happening__text' }, e.text),
    h('time', { class: 'meta-muted' }, relativeTime(e.ts)))));
}
