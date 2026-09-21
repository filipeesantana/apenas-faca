/** Seletor de período compartilhado (Progresso e Análises). Troca atualiza no lugar. */
import { h, add } from '../ui/dom.js';
import { segmented, button } from '../ui/components.js';
import { go } from '../core/router.js';
import { today, addDays, diffDays, formatDay, startOfMonth, isValidISODate } from '../utils/dates.js';

export function resolvePeriod(q) {
  const T = today();
  if (q.p === 'mes') return { id: 'mes', from: startOfMonth(T), to: T, label: 'neste mês', short: 'Este mês' };
  if (q.p === 'custom' && isValidISODate(q.de) && isValidISODate(q.ate) && q.de <= q.ate && q.ate <= T) {
    return { id: 'custom', from: q.de, to: q.ate, label: `de ${formatDay(q.de)} a ${formatDay(q.ate)}`, short: `${formatDay(q.de)} – ${formatDay(q.ate)}` };
  }
  if (q.p === 'custom') return { id: 'custom', from: addDays(T, -13), to: T, label: 'nos últimos 14 dias', short: 'Últimos 14 dias' };
  const days = q.p === '7' ? 7 : 30;
  return { id: String(days), from: addDays(T, -(days - 1)), to: T, label: `nos últimos ${days} dias`, short: `${days} dias` };
}

/** Período imediatamente anterior, com a mesma duração (para comparações). */
export function previousPeriod(per) {
  const len = diffDays(per.from, per.to) + 1;
  return { from: addDays(per.from, -len), to: addDays(per.from, -1), days: len };
}

export function periodControl(base, per) {
  const wrap = h('div', { class: 'period' },
    segmented([
      { value: '7', label: '7 dias' }, { value: '30', label: '30 dias' }, { value: 'mes', label: 'Este mês' }, { value: 'custom', label: 'Personalizado' },
    ], per.id, (v) => go(v === 'custom' ? `${base}?p=custom&de=${per.from}&ate=${per.to}` : `${base}?p=${v}`), { label: 'Período' }));
  if (per.id === 'custom') {
    const de = h('input', { type: 'date', class: 'input input--date', value: per.from, max: today(), 'aria-label': 'Data inicial' });
    const ate = h('input', { type: 'date', class: 'input input--date', value: per.to, max: today(), 'aria-label': 'Data final' });
    const err = h('p', { class: 'field-error', role: 'alert', hidden: true });
    add(wrap, h('form', {
      class: 'period-form',
      onSubmit: (e) => {
        e.preventDefault();
        if (!de.value || !ate.value) { err.hidden = false; err.textContent = 'Escolha as duas datas.'; return; }
        if (de.value > ate.value) { err.hidden = false; err.textContent = 'A data inicial precisa ser anterior à final.'; return; }
        if (ate.value > today()) { err.hidden = false; err.textContent = 'A data final não pode estar no futuro.'; return; }
        go(`${base}?p=custom&de=${de.value}&ate=${ate.value}`);
      },
    }, h('label', { class: 'inline-label' }, 'De', de), h('label', { class: 'inline-label' }, 'até', ate), button('Aplicar', { type: 'submit', size: 'sm' }), err));
  }
  return wrap;
}
