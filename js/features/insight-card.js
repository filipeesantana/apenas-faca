/**
 * Linha de análise: dado → interpretação → ação.
 * Compacta por padrão (título + números-chave + ações). "Entender análise" expande
 * no lugar — sem re-renderizar a página — com a explicação, "como chegamos a isso"
 * e os itens envolvidos.
 */
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
import { toast, toastError } from '../ui/toast.js';

const expanded = new Set();
const TONE_ICON = { attention: 'alert', watch: 'info', info: 'info', good: 'check' };

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
      case 'export': exportBackup().then(() => toast('Backup exportado.')).catch((e) => toastError(e, { message: 'Não foi possível gerar o backup.' })); break;
      default:
    }
  } catch (err) { toastError(err); }
}

export function insightRow(ins, { showCategory = true, compact = false } = {}) {
  const items = (ins.items || []).map((id) => state.tasks.get(id)).filter(Boolean);
  const goals = (ins.goalItems || []).map((id) => state.goals.get(id)).filter(Boolean);
  const isOpen = expanded.has(ins.key);
  const detailId = `ins-${ins.key.replace(/[^a-z0-9]/gi, '')}`;
  const hasDetail = !!(ins.body || ins.how?.length || items.length || goals.length);

  const detail = h('div', { class: 'ins__detail', id: detailId, hidden: !isOpen });
  const fillDetail = () => {
    if (detail.childElementCount) return;
    add(detail,
      ins.body && h('p', { class: 'ins__body' }, ins.body),
      ins.how?.length && h('div', { class: 'ins__how' }, h('p', { class: 'ins__how-title' }, 'Como chegamos a isso'), h('ul', null, ins.how.map((l) => h('li', null, l)))),
      items.length > 0 && h('div', { class: 'ins__items' }, taskList(items.slice(0, 8), { compact: true }), items.length > 8 && h('p', { class: 'muted small' }, `E mais ${items.length - 8}.`)),
      goals.length > 0 && h('ul', { class: 'goal-list goal-list--compact ins__items' }, goals.map((g) => h('li', null, goalRow(g, { compact: true })))));
  };
  if (isOpen) fillDetail();

  const toggle = hasDetail && h('button', {
    type: 'button', class: 'ins__toggle', 'aria-expanded': String(isOpen), 'aria-controls': detailId, 'data-key': `ins-toggle-${ins.key}`,
    onClick: () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      if (open) { expanded.add(ins.key); fillDetail(); } else expanded.delete(ins.key);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('span').textContent = open ? 'Ocultar detalhes' : 'Entender análise';
      detail.hidden = !open;
      row.classList.toggle('is-open', open);
    },
  }, h('span', null, isOpen ? 'Ocultar detalhes' : 'Entender análise'), icon('chevronDown', { size: 14 }));

  const row = h('article', { class: ['ins', `ins--${ins.tone}`, isOpen && 'is-open', compact && 'ins--compact'] },
    h('span', { class: 'ins__mark', 'aria-hidden': 'true' }, icon(TONE_ICON[ins.tone] || 'info', { size: 15 })),
    h('div', { class: 'ins__main' },
      h('p', { class: 'ins__meta' },
        h('span', { class: 'ins__tone' }, toneLabel(ins.tone)),
        showCategory && CATEGORIES[ins.category] && h('span', null, ` · ${CATEGORIES[ins.category].label}`)),
      h('h3', { class: 'ins__title' }, ins.title),
      ins.facts?.length > 0 && h('ul', { class: 'ins__facts', 'aria-label': 'Números' }, ins.facts.map((f) => h('li', null, h('strong', null, String(f.v)), ` ${f.l}`))),
      h('div', { class: 'ins__actions' },
        (ins.actions || []).slice(0, 3).map((a) => button(a.label, { variant: a.primary ? 'primary' : 'secondary', size: 'sm', onClick: () => runInsightAction(a) })),
        toggle),
      detail),
    h('button', {
      type: 'button', class: 'icon-btn icon-btn--subtle ins__dismiss', 'aria-label': `Ocultar por alguns dias: ${ins.title}`, title: 'Ocultar por alguns dias',
      onClick: () => { row.classList.add('is-leaving'); setTimeout(() => dismissInsight(ins).catch(toastError), 160); },
    }, icon('x', { size: 16 })));
  return row;
}

/** Compatibilidade: o Início usa a mesma linha, sem categoria. */
export const insightCard = (ins, opts = {}) => insightRow(ins, { showCategory: false, compact: true, ...opts });
