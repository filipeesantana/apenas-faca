/**
 * Ajuda contextual em três níveis:
 *  1. texto no próprio campo (feito em cada tela);
 *  2. `helpTip` — botão "?" com explicação curta (mouse, teclado e toque);
 *  3. `entenda` — bloco recolhível com mais contexto.
 */
import { h } from './dom.js';
import { icon } from './icons.js';

let openTip = null;

document.addEventListener('click', (e) => { if (openTip && !openTip.root.contains(e.target)) openTip.hide(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openTip) { openTip.hide(); } }, true);
window.addEventListener('scroll', () => openTip?.hide(), { passive: true });

export function helpTip(text, { label = 'Ajuda' } = {}) {
  const id = `tip-${Math.random().toString(36).slice(2, 8)}`;
  const bubble = h('span', { class: 'tip__bubble', role: 'tooltip', id, hidden: true }, text);
  let pinned = false;
  let hideTimer;

  const api = {
    show() {
      clearTimeout(hideTimer);
      if (openTip && openTip !== api) openTip.hide();
      bubble.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      const r = btn.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const width = Math.min(300, vw - 24);
      bubble.style.width = `${width}px`;
      bubble.style.left = `${Math.max(12, Math.min(r.left + r.width / 2 - width / 2, vw - width - 12))}px`;
      const below = r.bottom + 8;
      const hgt = bubble.offsetHeight;
      bubble.style.top = `${below + hgt > window.innerHeight - 8 ? Math.max(8, r.top - hgt - 8) : below}px`;
      openTip = api;
    },
    hide() {
      pinned = false;
      bubble.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (openTip === api) openTip = null;
    },
  };

  const btn = h('button', {
    type: 'button', class: 'tip__btn', 'aria-label': `${label}: o que é isso?`, 'aria-describedby': id, 'aria-expanded': 'false',
    onClick: (e) => { e.preventDefault(); e.stopPropagation(); if (pinned) api.hide(); else { pinned = true; api.show(); } },
    onMouseenter: () => api.show(),
    onMouseleave: () => { if (!pinned) hideTimer = setTimeout(() => api.hide(), 150); },
    onFocus: () => api.show(),
    onBlur: () => { if (!pinned) api.hide(); },
  }, '?');
  api.root = h('span', { class: 'tip' }, btn, bubble);
  return api.root;
}

/** Rótulo com "?" opcional: labelWithHelp('Importância', 'Indica…') */
export function labelWithHelp(text, help, { tag = 'span', className = 'field__label', forId } = {}) {
  return h(tag, { class: className, for: forId || null }, text, help && helpTip(help, { label: text }));
}

/** Bloco "Entenda" (nível 3). */
export function entenda(title, ...content) {
  return h('details', { class: 'entenda' },
    h('summary', null, icon('info', { size: 15 }), h('span', null, title)),
    h('div', { class: 'entenda__body' }, content));
}

export const HELP = {
  meta: 'Uma meta representa algo que você deseja alcançar ao longo do tempo — juntar um valor, completar um curso, cumprir etapas.',
  tarefa: 'Uma tarefa é uma ação concreta que pode ser realizada: pagar, ligar, enviar, estudar uma aula.',
  proximoPasso: 'É a próxima ação que aproxima você de uma meta. Aparece junto da meta e na tela inicial.',
  importancia: 'Indica quanto esta tarefa realmente importa. O Norte combina isso com prazo e histórico para definir o que merece atenção.',
  prioridade: 'A prioridade é calculada pelo Norte: considera prazo, atraso, importância, adiamentos e ligação com metas.',
  duracao: 'Uma estimativa de quanto tempo leva. Ajuda o Norte a sugerir o que cabe quando você tem pouco tempo livre.',
  area: 'Áreas agrupam tarefas e metas por parte da vida (Estudos, Trabalho, Saúde…). Ajudam a ver onde sua energia vai.',
  anotacao: 'Uma anotação guarda algo rapidamente, sem decidir nada agora. Depois você transforma em tarefa, meta ou só lembrete.',
  ritmo: 'Ritmo necessário = quanto falta ÷ tempo até a data escolhida.',
  mediaRecente: 'Média dos avanços registrados nos últimos até 90 dias. Correções de valor não entram na conta.',
  planejado: 'Tarefas “planejadas” numa semana são as que tinham prazo dentro dela. Serve para calibrar quanto cabe na sua semana — não para julgar.',
};
