/** Cartão de insight: dado → interpretação → ação, com "Como chegamos a isso?". */
import { h, add } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, toneLabel } from '../ui/components.js';
import { state } from '../core/store.js';
import { dismissInsight, CATEGORIES } from '../domain/insights.js';
import { taskList } from './task-row.js';
import { goalRow } from './goals.js';
import { openTaskSheet } from './task-sheet.js';
import { openReview, weekTaskIds } from './review.js';
import { openOrganizer } from './inbox-organizer.js';
import { startWithFeedback, dropWithFeedback } from './task-actions.js';
import { exportBackup } from '../data/backup.js';
import { toastError } from '../ui/toast.js';

const expanded = new Set();
const TONE_ICON = { attention: 'alert', watch: 'info', info: 'info', good: 'check' };
const rerender = () => window.dispatchEvent(new CustomEvent('app:rerender'));

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
      case 'export': exportBackup().catch(toastError); break;
      default:
    }
  } catch (err) { toastError(err); }
}

export function insightCard(ins, { compact = false, showCategory = false } = {}) {
  const items = (ins.items || []).map((id) => state.tasks.get(id)).filter(Boolean);
  const goals = (ins.goalItems || []).map((id) => state.goals.get(id)).filter(Boolean);
  const count = items.length || goals.length;
  const openKey = `items:${ins.key}`;
  const isOpen = expanded.has(openKey);
  const detailsId = `ins-${ins.key.replace(/[^a-z0-9]/gi, '')}`;

  const card = h('article', { class: ['insight', `insight--${ins.tone}`, compact && 'insight--compact'] },
    h('div', { class: 'insight__head' },
      h('span', { class: 'insight__tone' }, icon(TONE_ICON[ins.tone] || 'info', { size: 14 }), toneLabel(ins.tone),
        showCategory && CATEGORIES[ins.category] && h('span', { class: 'insight__cat' }, ` · ${CATEGORIES[ins.category].label}`)),
      h('button', {
        type: 'button', class: 'icon-btn icon-btn--subtle insight__dismiss', 'aria-label': 'Entendi, ocultar por alguns dias', title: 'Entendi — ocultar por alguns dias',
        onClick: () => dismissInsight(ins).catch(toastError),
      }, icon('x', { size: 16 }))),
    h('h3', { class: 'insight__title' }, ins.title),
    ins.body && h('p', { class: 'insight__body' }, ins.body));

  if (count > 0) {
    add(card, h('button', {
      type: 'button', class: 'insight__toggle', 'aria-expanded': String(isOpen), 'aria-controls': detailsId, 'data-key': `toggle-${ins.key}`,
      onClick: () => { if (isOpen) expanded.delete(openKey); else expanded.add(openKey); rerender(); },
    }, isOpen ? 'Ocultar' : count === 1 ? (goals.length ? 'Mostrar a meta' : 'Mostrar a tarefa') : `Mostrar ${goals.length ? 'as metas' : `as ${count}`}`, icon(isOpen ? 'chevronDown' : 'chevronRight', { size: 14 })));
    if (isOpen) {
      add(card, h('div', { id: detailsId, class: 'insight__items' },
        items.length ? taskList(items, { compact: true }) : h('ul', { class: 'goal-list goal-list--compact' }, goals.map((g) => h('li', null, goalRow(g, { compact: true }))))));
    }
  }
  if (ins.actions?.length) {
    add(card, h('div', { class: 'insight__actions' },
      ins.actions.map((a) => button(a.label, { variant: a.primary ? 'primary' : 'secondary', size: 'sm', onClick: () => runInsightAction(a) }))));
  }
  if (ins.how?.length && !compact) {
    add(card, h('details', { class: 'how-details' },
      h('summary', null, 'Como chegamos a isso?'),
      h('ul', null, ins.how.map((l) => h('li', null, l)))));
  }
  return card;
}
