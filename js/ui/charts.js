/**
 * Gráficos simples em HTML/SVG, sem bibliotecas.
 * Cada gráfico tem descrição textual acessível e valores em tooltip.
 */
import { h, s } from './dom.js';

/** Colunas verticais (atividade por dia/semana). */
export function columnChart(points, { label, valueOf = (p) => p.value, tip = () => '', tick = () => '', max } = {}) {
  const top = Math.max(max || 0, ...points.map(valueOf), 1);
  return h('figure', { class: 'cchart', role: 'img', 'aria-label': label },
    h('div', { class: 'cchart__plot' },
      points.map((p) => {
        const v = valueOf(p);
        return h('div', { class: ['cchart__col', p.current && 'is-current'], title: tip(p) },
          h('span', { class: ['cchart__bar', v === 0 && 'is-zero'], style: { height: `${v === 0 ? 0 : Math.max((v / top) * 100, 3)}%` } }));
      })),
    h('div', { class: 'cchart__axis', 'aria-hidden': 'true' }, points.map((p) => h('span', null, tick(p)))));
}

/** Pares de colunas: entradas × saídas. */
export function pairedChart(points, { label, a, b, tick = () => '', tip = () => '' }) {
  const top = Math.max(1, ...points.map((p) => Math.max(p[a.key], p[b.key])));
  return h('figure', { class: 'pchart', role: 'img', 'aria-label': label },
    h('div', { class: 'pchart__legend', 'aria-hidden': 'true' },
      h('span', { class: 'legend legend--a' }, a.label), h('span', { class: 'legend legend--b' }, b.label)),
    h('div', { class: 'pchart__plot' },
      points.map((p) => h('div', { class: ['pchart__group', p.current && 'is-current'], title: tip(p) },
        h('span', { class: 'pchart__bar pchart__bar--a', style: { height: `${(p[a.key] / top) * 100}%` } }),
        h('span', { class: 'pchart__bar pchart__bar--b', style: { height: `${(p[b.key] / top) * 100}%` } })))),
    h('div', { class: 'cchart__axis', 'aria-hidden': 'true' }, points.map((p) => h('span', null, tick(p)))));
}

/** Barras horizontais com rótulo e valor. */
export function hbarList(rows, { label, valueText = (r) => r.value } = {}) {
  const top = Math.max(1, ...rows.map((r) => r.value));
  return h('ul', { class: 'hbars', 'aria-label': label },
    rows.map((r) => h('li', { class: 'hbars__row' },
      h(r.href ? 'a' : 'span', { class: 'hbars__label', href: r.href || null },
        r.color && h('span', { class: 'area-dot', 'data-color': r.color, 'aria-hidden': 'true' }), r.label),
      h('span', { class: 'hbars__track', 'aria-hidden': 'true' },
        h('span', { class: 'hbars__fill', 'data-color': r.color || null, style: { width: `${(r.value / top) * 100}%` } })),
      h('span', { class: 'hbars__value' }, valueText(r)))));
}

/**
 * Evolução acumulada de uma meta (degraus) com linha da meta tracejada.
 * points: [{ t, v }] ordenados; target: número.
 */
export function stepLineChart(points, { target, label, now = Date.now() }) {
  const W = 600; const H = 160; const pad = 6;
  if (!points.length) return null;
  const t0 = points[0].t;
  const t1 = Math.max(now, t0 + 1);
  const vmax = Math.max(target || 0, ...points.map((p) => p.v), 1);
  const x = (t) => pad + ((t - t0) / (t1 - t0)) * (W - pad * 2);
  const y = (v) => H - pad - (v / vmax) * (H - pad * 2);
  let d = `M${x(points[0].t)},${y(points[0].v)}`;
  for (let i = 1; i < points.length; i++) d += ` H${x(points[i].t)} V${y(points[i].v)}`;
  d += ` H${x(t1)}`;
  const area = `${d} V${H - pad} H${x(points[0].t)} Z`;
  return h('figure', { class: 'linechart', role: 'img', 'aria-label': label },
    s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'linechart__svg' },
      target ? s('line', { x1: pad, x2: W - pad, y1: y(target), y2: y(target), class: 'linechart__target', 'vector-effect': 'non-scaling-stroke' }) : null,
      s('path', { d: area, class: 'linechart__area' }),
      s('path', { d, class: 'linechart__line', 'vector-effect': 'non-scaling-stroke' })));
}

/* ======================================================================
   Gráficos de metas e planejamento
   ====================================================================== */

/**
 * Projeção: histórico real, linha planejada (até a data escolhida),
 * linha do ritmo recente e linha do objetivo. Textos ficam em HTML para
 * não distorcer quando o gráfico estica.
 */
export function projectionChart({ history, model, formatValue, formatDate, label }) {
  const W = 1000; const H = 260; const PAD_T = 18; const PAD_B = 8;
  const { startTs, now, endTs, horizon, current, target, recentPerDay } = model;
  const t0 = startTs;
  const t1 = Math.max(horizon, now + 1);
  const vmax = Math.max(target, ...history.map((p) => p.v), 1) * 1.06;
  const x = (t) => ((t - t0) / (t1 - t0)) * W;
  const y = (v) => H - PAD_B - (v / vmax) * (H - PAD_T - PAD_B);
  const pct = (t) => `${Math.max(0, Math.min(100, ((t - t0) / (t1 - t0)) * 100))}%`;

  let hist = `M${x(history[0].t)},${y(history[0].v)}`;
  for (let i = 1; i < history.length; i++) hist += ` H${x(history[i].t)} V${y(history[i].v)}`;
  hist += ` H${x(now)}`;

  const layers = [
    s('line', { x1: 0, x2: W, y1: y(target), y2: y(target), class: 'pj__target', 'vector-effect': 'non-scaling-stroke' }),
    s('line', { x1: x(now), x2: x(now), y1: PAD_T - 10, y2: H - PAD_B, class: 'pj__today', 'vector-effect': 'non-scaling-stroke' }),
    s('path', { d: `${hist} V${H - PAD_B} H${x(history[0].t)} Z`, class: 'pj__area' }),
    s('path', { d: hist, class: 'pj__hist', 'vector-effect': 'non-scaling-stroke' }),
  ];
  if (endTs && endTs > now && current < target) {
    layers.push(s('line', { x1: x(now), y1: y(current), x2: x(endTs), y2: y(target), class: 'pj__plan', 'vector-effect': 'non-scaling-stroke' }));
  }
  if (recentPerDay > 0 && current < target) {
    const tEnd = Math.min(t1, now + ((target - current) / recentPerDay) * 86400000);
    const vEnd = current + recentPerDay * ((tEnd - now) / 86400000);
    layers.push(s('line', { x1: x(now), y1: y(current), x2: x(tEnd), y2: y(Math.min(vEnd, target)), class: 'pj__recent', 'vector-effect': 'non-scaling-stroke' }));
  }

  const legend = [
    h('span', { class: 'lg lg--hist' }, 'Seu histórico'),
    endTs && endTs > now && current < target && h('span', { class: 'lg lg--plan' }, 'Ritmo planejado'),
    recentPerDay > 0 && current < target && h('span', { class: 'lg lg--recent' }, 'Ritmo recente'),
    h('span', { class: 'lg lg--target' }, 'Objetivo'),
  ];

  return h('figure', { class: 'pj', role: 'img', 'aria-label': label },
    h('div', { class: 'pj__legend', 'aria-hidden': 'true' }, legend),
    h('div', { class: 'pj__frame' },
      h('span', { class: 'pj__ylabel', style: { top: `${(y(target) / H) * 100}%` }, 'aria-hidden': 'true' }, formatValue(target)),
      h('span', { class: ['pj__ylabel pj__ylabel--now', (now - t0) / (t1 - t0) < 0.12 && 'is-start', (now - t0) / (t1 - t0) > 0.88 && 'is-end'], style: { top: `${(y(current) / H) * 100}%`, left: pct(now) }, 'aria-hidden': 'true' }, formatValue(current)),
      s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'pj__svg', 'aria-hidden': 'true' }, layers)),
    h('div', { class: 'pj__axis', 'aria-hidden': 'true' },
      (now - t0) / (t1 - t0) > 0.14 && h('span', { style: { left: '0%' } }, formatDate(t0)),
      h('span', { class: ['pj__axis-now', (now - t0) / (t1 - t0) < 0.14 && 'is-start'], style: { left: pct(now) } }, 'hoje'),
      h('span', { style: { left: '100%' }, class: 'pj__axis-end' }, formatDate(t1))));
}

/** Lista de cenários com barra proporcional ao esforço (ritmo). */
export function scenarioList(rows, { onSelect, selectedId, label }) {
  const top = Math.max(...rows.map((r) => r.weight || 0), 1e-9);
  return h('ul', { class: 'scen', 'aria-label': label },
    rows.map((r) => h('li', null, h('button', {
      type: 'button', class: 'scen__row', 'aria-pressed': String(r.id === selectedId), onClick: () => onSelect?.(r),
    },
    h('span', { class: 'scen__label' }, r.label),
    h('span', { class: 'scen__track', 'aria-hidden': 'true' }, h('span', { class: 'scen__fill', style: { width: `${Math.max(4, ((r.weight || 0) / top) * 100)}%` } })),
    h('span', { class: 'scen__value' }, r.value)))));
}

/** Planejado × realizado por semana: barra empilhada + números por extenso. */
export function planRows(weeks, { tick, label }) {
  const top = Math.max(1, ...weeks.map((w) => w.planned));
  const seg = (n, cls) => (n ? h('span', { class: `pr__seg pr__seg--${cls}`, style: { width: `${(n / top) * 100}%` } }) : null);
  return h('div', { class: 'pr', role: 'img', 'aria-label': label },
    h('div', { class: 'pr__legend', 'aria-hidden': 'true' },
      h('span', { class: 'lg2 lg2--done' }, 'Concluídas'), h('span', { class: 'lg2 lg2--postponed' }, 'Adiadas'),
      h('span', { class: 'lg2 lg2--dropped' }, 'Canceladas'), h('span', { class: 'lg2 lg2--pending' }, 'Pendentes')),
    weeks.map((w) => h('div', { class: ['pr__row', w.current && 'is-current'] },
      h('span', { class: 'pr__label' }, tick(w)),
      h('span', { class: 'pr__bar', 'aria-hidden': 'true' }, seg(w.done, 'done'), seg(w.postponed, 'postponed'), seg(w.dropped, 'dropped'), seg(w.pending, 'pending')),
      h('span', { class: 'pr__nums' }, w.planned ? `${w.done} de ${w.planned}` : '—'))));
}
