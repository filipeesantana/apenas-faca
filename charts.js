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
