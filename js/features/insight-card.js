/** Cartão de insight: dado → interpretação → ação. Nunca uma caixa de texto morta. */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { button, toneLabel } from '../ui/components.js';
import { state } from '../core/store.js';
import { dismissInsight } from '../domain/insights.js';
import { taskList } from './task-row.js';
import { openTaskSheet } from './task-sheet.js';
import { openReview } from './review.js';
import { openOrganizer } from './inbox-organizer.js';
import { startWithFeedback, dropWithFeedback } from './task-actions.js';
import { exportBackup } from '../data/backup.js';
import { toastError } from '../ui/toast.js';

const expanded = new Set();
const TONE_ICON = { attention: 'alert', watch: 'info', info: 'info', good: 'spark' };

export function runInsightAction(a) {
  try {
    if (a.href) { location.hash = a.href; return; }
    switch (a.type) {
      case 'review': openReview(a.ids); break;
      case 'openTask': openTaskSheet(a.id); break;
      case 'startTask': startWithFeedback(a.id); openTaskSheet(a.id); break;
      case 'dropTask': dropWithFeedback(a.id); break;
      case 'organize': openOrganizer(); break;
      case 'export': exportBackup().catch(toastError); break;
      default:
    }
  } catch (err) { toastError(err); }
}

export function insightCard(ins, { compact = false } = {}) {
  const isOpen = expanded.has(ins.key);
  const items = (ins.items || []).map((id) => state.tasks.get(id)).filter(Boolean);
  const detailsId = `ins-${ins.key.replace(/[^a-z0-9]/gi, '')}`;

  return h('article', { class: ['insight', `insight--${ins.tone}`, compact && 'insight--compact'] },
    h('div', { class: 'insight__head' },
      h('span', { class: 'insight__tone' }, icon(TONE_ICON[ins.tone] || 'info', { size: 14 }), toneLabel(ins.tone)),
      h('button', {
        type: 'button', class: 'icon-btn icon-btn--subtle insight__dismiss', 'aria-label': 'Entendi, ocultar por enquanto', title: 'Entendi',
        onClick: () => dismissInsight(ins).catch(toastError),
      }, icon('x', { size: 16 }))),
    h('h3', { class: 'insight__title' }, ins.title),
    ins.body && h('p', { class: 'insight__body' }, ins.body),
    items.length > 0 && h('button', {
      type: 'button', class: 'insight__toggle', 'aria-expanded': String(isOpen), 'aria-controls': detailsId, 'data-key': `toggle-${ins.key}`,
      onClick: () => { if (isOpen) expanded.delete(ins.key); else expanded.add(ins.key); window.dispatchEvent(new CustomEvent('app:rerender')); },
    }, isOpen ? 'Ocultar' : items.length === 1 ? 'Mostrar a tarefa' : `Mostrar as ${items.length}`, icon(isOpen ? 'chevronDown' : 'chevronRight', { size: 14 })),
    isOpen && items.length > 0 && h('div', { id: detailsId, class: 'insight__items' }, taskList(items)),
    ins.actions?.length > 0 && h('div', { class: 'insight__actions' },
      ins.actions.map((a) => button(a.label, { variant: a.primary ? 'primary' : 'secondary', size: 'sm', onClick: () => runInsightAction(a) }))));
}
