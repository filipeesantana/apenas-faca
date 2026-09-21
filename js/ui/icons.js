/** Ícones SVG desenhados em traço, grade 24×24. */
import { s } from './dom.js';

const CIRCLE = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z';

const PATHS = {
  home: 'M4 10.2 12 4l8 6.2V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z',
  inbox: 'M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20 M6.2 5h11.6L20 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5.5z',
  tasks: 'M10 7h10 M10 12h10 M10 17h10 M4 7l1.2 1.2L7.5 6 M4 12l1.2 1.2 2.3-2.2 M4 17l1.2 1.2 2.3-2.2',
  target: `${CIRCLE} M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z M12 12.5v-.5`,
  trend: 'M4 17l5.5-5.5 4 4L20 9 M15 9h5v5',
  trendDown: 'M4 7l5.5 5.5 4-4L20 15 M15 15h5v-5',
  kebab: 'M12 5.5h.01 M12 12h.01 M12 18.5h.01',
  lens: 'M10.5 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4.5-4.5 M7.5 13v-1.5 M10.5 13V9 M13.5 13v-2.5',
  settings: 'M4 7h9 M17 7h3 M4 12h3 M11 12h9 M4 17h11 M19 17h1 M15 5v4 M9 10v4 M17 15v4',
  plus: 'M12 5v14 M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  play: 'M8 5.5v13l10-6.5z',
  pause: 'M9 6v12 M15 6v12',
  clock: `${CIRCLE} M12 7.5V12l3 2`,
  calendar: 'M4.5 6.5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v12.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z M4.5 10h15 M8.5 3.5v3.5 M15.5 3.5v3.5',
  x: 'M6.5 6.5l11 11 M17.5 6.5l-11 11',
  trash: 'M4.5 7h15 M10 11v6 M14 11v6 M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7 M9.5 7V4.5h5V7',
  more: 'M6 12h.01 M12 12h.01 M18 12h.01',
  chevronRight: 'M9.5 6l6 6-6 6',
  chevronLeft: 'M14.5 6l-6 6 6 6',
  chevronDown: 'M6 9.5l6 6 6-6',
  arrowRight: 'M5 12h14 M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5 M11 6l-6 6 6 6',
  undo: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  flag: 'M5.5 21V4 M5.5 4.5h11l-2.2 4 2.2 4h-11',
  alert: 'M12 4l8.5 15h-17z M12 10v4 M12 16.8v.2',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  upload: 'M12 16V5 M7 10l5-5 5 5 M5 20h14',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z M12 2.5v2 M12 19.5v2 M4.6 4.6l1.4 1.4 M18 18l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.6 19.4L6 18 M18 6l1.4-1.4',
  moon: 'M20 14.2A8 8 0 1 1 9.8 4a6.5 6.5 0 0 0 10.2 10.2z',
  monitor: 'M3.5 5.5h17v11h-17z M9 20h6 M12 16.5V20',
  edit: 'M4.5 19.5h4L19 9l-4-4L4.5 15.5z M13.5 6.5l4 4',
  archive: 'M3.5 5h17v4h-17z M5.5 9v10h13V9 M10 13h4',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  refresh: 'M19.5 11A7.5 7.5 0 1 0 17.3 16.3 M19.5 4.5V11H13',
  ban: `${CIRCLE} M5.7 5.7l12.6 12.6`,
  note: 'M6.5 3.5h8l4 4v13h-12z M14 3.5V8h4.5 M9 12.5h6 M9 16h4',
  circle: CIRCLE,
  spark: 'M12 3.5v4 M12 16.5v4 M3.5 12h4 M16.5 12h4 M6 6l2.5 2.5 M15.5 15.5 18 18 M6 18l2.5-2.5 M15.5 8.5 18 6',
  info: `${CIRCLE} M12 11v5.5 M12 7.8v.2`,
  layers: 'M12 4l8.5 4.5L12 13 3.5 8.5z M3.5 12.5 12 17l8.5-4.5 M3.5 16.5 12 21l8.5-4.5',
  coins: 'M9 10.5c3.6 0 6.5-1.3 6.5-3S12.6 4.5 9 4.5 2.5 5.8 2.5 7.5 5.4 10.5 9 10.5z M2.5 7.5v4c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3v-4 M15.5 11c3.4.2 6 1.4 6 3 0 1.7-2.9 3-6.5 3-1.5 0-2.9-.2-4-.6 M21.5 14v3.5c0 1.7-2.9 3-6.5 3s-6.5-1.3-6.5-3V15',
  steps: 'M4 19h5v-5h5V9h6 M4 19v1 M20 9V4',
};

export function icon(name, { size = 18, label, className } = {}) {
  const d = PATHS[name] || PATHS.circle;
  const attrs = {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    'stroke-width': name === 'more' || name === 'kebab' ? 3 : 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    class: ['icon', className].filter(Boolean).join(' '), focusable: 'false',
  };
  if (label) { attrs.role = 'img'; attrs['aria-label'] = label; } else attrs['aria-hidden'] = 'true';
  return s('svg', attrs, s('path', { d }));
}
