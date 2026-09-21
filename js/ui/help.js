/**
 * Ajuda contextual em três níveis:
 *  1. texto no próprio campo (em cada tela);
 *  2. `helpTip` — botão "?" com explicação curta (mouse, teclado e toque);
 *  3. `entenda` — bloco recolhível com mais contexto.
 * O posicionamento fica a cargo de ui/popover.js.
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { showPopover, hidePopover, popoverOpenFor, popoverId } from './popover.js';

const HOVER_DELAY = 150;

export function helpTip(text, { label = 'Ajuda' } = {}) {
  const id = popoverId();
  let timer;
  let pinned = false;
  const open = () => { showPopover(btn, text, { id, side: 'top', className: 'pop--tip' }); btn.setAttribute('aria-describedby', id); btn.setAttribute('aria-expanded', 'true'); };
  const close = () => { pinned = false; if (popoverOpenFor(btn)) hidePopover(); btn.removeAttribute('aria-describedby'); btn.setAttribute('aria-expanded', 'false'); };

  const btn = h('button', {
    type: 'button', class: 'tip__btn', 'aria-label': `${label}: o que é isso?`, 'aria-expanded': 'false',
    // Toque ou clique: abre e fixa; tocar de novo fecha. Tocar fora fecha (popover.js).
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation(); // evita que um <label> ao redor mova o foco para o campo
      clearTimeout(timer);
      if (pinned && popoverOpenFor(btn)) close(); else { pinned = true; open(); }
    },
    onPointerenter: (e) => { if (e.pointerType === 'mouse') { clearTimeout(timer); timer = setTimeout(open, HOVER_DELAY); } },
    onPointerleave: (e) => { if (e.pointerType === 'mouse') { clearTimeout(timer); if (!pinned) timer = setTimeout(close, 120); } },
    onFocus: () => { if (btn.matches(':focus-visible')) open(); },
    onBlur: () => { clearTimeout(timer); if (!pinned) close(); },
  }, '?');
  return h('span', { class: 'tip' }, btn);
}

/** Rótulo com "?" opcional. O "?" fica fora do <label> para não disparar o campo. */
export function labelWithHelp(text, help, { tag = 'span', className = 'field__label', forId } = {}) {
  if (!help) return h(tag, { class: className, for: forId || null }, text);
  return h('span', { class: ['label-help', className] }, h(tag, { for: forId || null, class: 'label-help__text' }, text), helpTip(help, { label: text }));
}

/** Bloco "Entenda" (nível 3). */
export function entenda(title, ...content) {
  return h('details', { class: 'entenda' },
    h('summary', null, icon('info', { size: 15 }), h('span', null, title)),
    h('div', { class: 'entenda__body' }, content));
}

export { hidePopover };

export const HELP = {
  meta: 'Algo que você quer alcançar ao longo do tempo: juntar um valor, completar um curso, cumprir etapas.',
  tarefa: 'Uma ação concreta: pagar, ligar, enviar, estudar uma aula.',
  proximoPasso: 'A próxima ação concreta que aproxima você da meta. Aparece junto da meta e na tela inicial.',
  importancia: 'Quanto a tarefa realmente importa. O Norte combina isso com prazo e histórico para decidir o que merece atenção.',
  prioridade: 'Calculada pelo Norte a partir do prazo, atraso, importância, adiamentos e ligação com metas.',
  duracao: 'Quanto tempo leva, aproximadamente. Ajuda o Norte a sugerir o que cabe num tempo livre.',
  area: 'Partes da vida (Estudos, Trabalho, Saúde…). Mostram onde sua energia está indo.',
  anotacao: 'Guarde algo rápido, sem decidir nada agora. Depois vira tarefa, meta ou lembrete.',
  ritmo: 'Ritmo necessário = quanto falta ÷ tempo até a data escolhida.',
  mediaRecente: 'Média dos avanços registrados nos últimos até 90 dias. Correções não entram na conta.',
  planejado: 'Tarefas com prazo dentro da semana. Serve para calibrar quanto cabe na sua semana, não para julgar.',
  adicionar: 'Adicione uma tarefa, meta, anotação ou progresso. No computador, a tecla N também abre este menu.',
};
