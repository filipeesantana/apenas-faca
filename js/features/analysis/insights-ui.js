/**
 * Apresentação dos insights: lista priorizada e "O que vale fazer agora".
 * Fechado: rótulo discreto, título, uma linha de contexto, ação principal.
 * "Entender análise" abre no lugar: dados usados, período, cálculo e significado.
 */
import { h, add } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { button } from '../../ui/components.js';
import { state } from '../../core/store.js';
import { dismissInsight } from '../../domain/insights.js';
import { taskList } from '../task-row.js';
import { goalRow } from '../goals.js';
import { openTaskSheet } from '../task-sheet.js';
import { openTaskForm } from '../task-form.js';
import { openReview, weekTaskIds } from '../review.js';
import { openOrganizer } from '../inbox-organizer.js';
import { openProgressLog } from '../progress-log.js';
import { startWithFeedback, dropWithFeedback } from '../task-actions.js';
import { exportBackup } from '../../data/backup.js';
import { toast, toastError } from '../../ui/toast.js';

const expanded = new Set();
const TONE_ICON = { attention: 'alert', watch: 'info', info: 'info', good: 'check' };
const TONE_WORD = { attention: 'Atenção', watch: 'Observar', info: 'Registro', good: 'Avanço' };

export function runInsightAction(a) {
  try {
    if (a.href) { location.hash = a.href; return; }
    switch (a.type) {
      case 'review': openReview(a.ids); break;
      case 'reviewWeek': openReview(weekTaskIds(), { title: 'Revisar esta semana' }); break;
      case 'openTask': openTaskSheet(a.id); break;
      case 'startTask': startWithFeedback(a.id); openTaskSheet(a.id); break;
      case 'dropTask': dropWithFeedback(a.id); break;
      case 'organize': openOrganizer(); break;
      case 'logProgress': openProgressLog(a.id); break;
      case 'newNextStep': { const g = state.goals.get(a.id); openTaskForm({ goalId: a.id, areaId: g?.areaId, nextStep: true }); break; }
      case 'export': exportBackup().then(() => toast('Backup exportado.')).catch((e) => toastError(e, { message: 'Não foi possível gerar o backup.' })); break;
      default:
    }
  } catch (err) { toastError(err); }
}

export function insightRow(ins, { compact = false, index = null } = {}) {
  const items = (ins.items || []).map((id) => state.tasks.get(id)).filter(Boolean);
  const goals = (ins.goalItems || []).map((id) => state.goals.get(id)).filter(Boolean);
  const isOpen = expanded.has(ins.key);
  const detailId = `ins-${ins.key.replace(/[^a-z0-9]/gi, '')}`;
  const primary = (ins.actions || []).find((a) => a.primary) || (ins.actions || [])[0];
  const secondary = (ins.actions || []).filter((a) => a !== primary).slice(0, compact ? 0 : 1);

  const detail = h('div', { class: 'ins__detail', id: detailId, hidden: !isOpen });
  const fill = () => {
    if (detail.childElementCount) return;
    add(detail, h('dl', { class: 'ins__method' },
      ins.facts?.length > 0 && [h('dt', null, 'Dados usados'), h('dd', null, h('ul', { class: 'ins__facts' }, ins.facts.map((f) => h('li', null, h('strong', null, String(f.v)), ` ${f.l}`))))],
      ins.period && [h('dt', null, 'Período'), h('dd', null, ins.period)],
      ins.how?.length > 0 && [h('dt', null, 'Como chegamos a isso'), h('dd', null, h('ul', { class: 'ins__how' }, ins.how.map((l) => h('li', null, l))))],
      ins.meaning && [h('dt', null, 'O que significa'), h('dd', null, ins.meaning)]),
    items.length > 0 && h('div', { class: 'ins__items' }, taskList(items.slice(0, 6), { compact: true }), items.length > 6 && h('p', { class: 'muted small' }, `E mais ${items.length - 6}.`)),
    goals.length > 0 && h('ul', { class: 'goal-list goal-list--compact ins__items' }, goals.map((g) => h('li', null, goalRow(g, { compact: true })))));
  };
  if (isOpen) fill();

  const toggle = h('button', {
    type: 'button', class: 'ins__toggle', 'aria-expanded': String(isOpen), 'aria-controls': detailId, 'data-key': `ins-toggle-${ins.key}`,
    onClick: () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      if (open) { expanded.add(ins.key); fill(); } else expanded.delete(ins.key);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('span').textContent = open ? 'Ocultar explicação' : 'Entender análise';
      detail.hidden = !open;
      row.classList.toggle('is-open', open);
    },
  }, h('span', null, isOpen ? 'Ocultar explicação' : 'Entender análise'), icon('chevronDown', { size: 14 }));

  const row = h('li', { class: ['ins', `ins--${ins.tone}`, isOpen && 'is-open', compact && 'ins--compact'] },
    h('span', { class: 'ins__mark', 'aria-hidden': 'true' }, index != null ? String(index) : icon(TONE_ICON[ins.tone] || 'info', { size: 15 })),
    h('div', { class: 'ins__main' },
      h('p', { class: 'ins__meta' }, h('span', { class: 'ins__label' }, ins.label || ''), h('span', { class: 'sr-only' }, ` — ${TONE_WORD[ins.tone] || ''}`)),
      h('h3', { class: 'ins__title' }, ins.title),
      ins.line && h('p', { class: 'ins__line' }, ins.line),
      h('div', { class: 'ins__actions' },
        primary && button(primary.label, { variant: ins.severity >= 2 && !ins.positive ? 'primary' : 'secondary', size: 'sm', onClick: () => runInsightAction(primary) }),
        secondary.map((a) => button(a.label, { variant: 'ghost', size: 'sm', onClick: () => runInsightAction(a) })),
        toggle),
      detail),
    h('button', {
      type: 'button', class: 'icon-btn icon-btn--subtle ins__dismiss', 'aria-label': `Ocultar por alguns dias: ${ins.title}`, title: 'Ocultar por alguns dias',
      onClick: () => { row.classList.add('is-leaving'); setTimeout(() => dismissInsight(ins).catch(toastError), 160); },
    }, icon('x', { size: 16 })));
  return row;
}

/** Lista priorizada, numerada; mostra `limit` e "Mostrar mais" no lugar. */
export function insightList(list, { limit = 5, numbered = true } = {}) {
  const ul = h('ol', { class: 'ins-list' });
  const rows = list.map((ins, i) => insightRow(ins, { index: numbered ? i + 1 : null }));
  rows.forEach((r, i) => { if (i >= limit) r.hidden = true; add(ul, r); });
  if (list.length > limit) {
    const more = h('li', { class: 'ins-more-row' }, h('button', {
      type: 'button', class: 'ins-more',
      onClick: () => { rows.forEach((r) => { r.hidden = false; }); more.remove(); rows[limit]?.querySelector('.ins__toggle')?.focus({ preventScroll: true }); },
    }, `Mostrar mais ${list.length - limit}`));
    add(ul, more);
  }
  return ul;
}

/** "O que vale fazer agora" — no máximo duas ações. */
export function nextActionsBlock(actions, { fallback } = {}) {
  if (!actions.length) {
    return h('div', { class: 'next-actions next-actions--calm' },
      h('p', null, icon('check', { size: 16 }), 'Nada exige ação agora.'),
      fallback);
  }
  return h('ol', { class: 'next-actions' }, actions.map((n) => h('li', null,
    h('p', null, n.text),
    button(n.action.label, { variant: 'primary', size: 'sm', icon: 'arrowRight', onClick: () => runInsightAction(n.action) }))));
}

/** Compatibilidade com o Início. */
export const insightCard = (ins) => insightRow(ins, { compact: true });
