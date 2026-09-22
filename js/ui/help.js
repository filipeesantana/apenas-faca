/**
 * Ajuda contextual do Norte — dois níveis, nunca uma caixa solta sobre a tela:
 *
 *  • DICA CURTA (opcional): ao passar o mouse no "?", uma frase curta ancorada
 *    (ui/popover.js, com detecção de colisão). Só para frases pequenas.
 *  • EXPLICAÇÃO (clique, toque, Enter ou Espaço): um bloco que se abre DENTRO do
 *    mesmo componente, logo abaixo do título ou campo, empurrando o conteúdo.
 *    Sem sobreposição, sem modal, sem saltar para o topo.
 *
 * Uma explicação aberta por seção: abrir outra na mesma área fecha a anterior.
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { showPopover, hidePopover, popoverOpenFor, popoverId } from './popover.js';

let seq = 0;

/** Onde o bloco entra: logo depois do elemento "linha" que contém o "?". */
function slotFor(btn) {
  // 1. Cabeçalho de seção inteiro (a ajuda aparece logo abaixo dele, dentro do card).
  const head = btn.closest('.section-head, .builder__q');
  if (head) return head;
  // 2. Dentro de um bloco conhecido: logo abaixo do filho que contém o "?".
  const container = btn.closest('.page-head__text, .switch-field, .field, .plan-result, .why, .sheet-section');
  if (container) return [...container.children].find((c) => c.contains(btn)) || btn.parentElement;
  return btn.closest('[data-help-slot], p, label, h1, h2, h3') || btn.parentElement;
}

/** Seção à qual a ajuda pertence (para abrir uma de cada vez). */
const sectionOf = (el) => el.closest('.card, .sheet__body, .builder, section, .view') || document.body;

function closePanel(btn, panel, { instant = false } = {}) {
  btn.setAttribute('aria-expanded', 'false');
  btn.closest('.help-trigger')?.classList.remove('is-open');
  if (!panel?.isConnected) return;
  if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) { panel.remove(); return; }
  panel.classList.remove('is-open');
  setTimeout(() => panel.remove(), 200);
}

/**
 * Botão "?" de ajuda.
 * help: { title, text, example?, short? } (string também é aceita como texto).
 */
export function helpTip(help, { label } = {}) {
  const data = typeof help === 'string' ? { text: help } : help;
  const title = data.title || label || 'Ajuda';
  const panelId = `help-${++seq}`;
  const tipId = popoverId();
  let panel = null;
  let hoverTimer;

  const buildPanel = () => h('div', { class: 'help-panel', id: panelId, role: 'region', 'aria-label': `Ajuda: ${title}` },
    h('div', { class: 'help-panel__inner' },
      h('div', { class: 'help-panel__head' },
        h('p', { class: 'help-panel__title' }, icon('info', { size: 15 }), title),
        h('button', { type: 'button', class: 'help-panel__close', 'aria-label': `Fechar ajuda: ${title}`, onClick: () => { closePanel(btn, panel); btn.focus({ preventScroll: true }); } }, icon('x', { size: 15 }))),
      h('p', { class: 'help-panel__text' }, data.text),
      data.example && h('p', { class: 'help-panel__example' }, h('strong', null, 'Exemplo: '), data.example)));

  const open = () => {
    if (popoverOpenFor(btn)) hidePopover(true);
    // Uma explicação aberta por seção.
    sectionOf(btn).querySelectorAll('.help-trigger__btn[aria-expanded="true"]').forEach((other) => { if (other !== btn) other.click(); });
    panel = buildPanel();
    const slot = slotFor(btn);
    slot.after(panel);
    btn.setAttribute('aria-expanded', 'true');
    btn.closest('.help-trigger')?.classList.add('is-open');
    requestAnimationFrame(() => panel.classList.add('is-open'));
  };

  const btn = h('button', {
    type: 'button', class: 'help-trigger__btn', 'aria-label': `O que é “${title}”?`, 'aria-expanded': 'false', 'aria-controls': panelId,
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation(); // dentro de <label>, não aciona o campo
      clearTimeout(hoverTimer);
      if (btn.getAttribute('aria-expanded') === 'true' && panel?.isConnected) closePanel(btn, panel);
      else open();
    },
    onPointerenter: (e) => {
      if (e.pointerType !== 'mouse' || !data.short || btn.getAttribute('aria-expanded') === 'true') return;
      hoverTimer = setTimeout(() => showPopover(btn, data.short, { id: tipId, side: 'top', className: 'pop--tip' }), 250);
    },
    onPointerleave: () => { clearTimeout(hoverTimer); if (popoverOpenFor(btn)) hidePopover(); },
    onBlur: () => { if (popoverOpenFor(btn)) hidePopover(); },
  }, '?');
  return h('span', { class: 'help-trigger' }, btn);
}

/** Rótulo com "?" ao lado. O "?" fica fora do <label> para não disparar o campo. */
export function labelWithHelp(text, help, { tag = 'span', className = 'field__label', forId } = {}) {
  if (!help) return h(tag, { class: className, for: forId || null }, text);
  return h('span', { class: ['label-help', className], 'data-help-slot': '' },
    h(tag, { for: forId || null, class: 'label-help__text' }, text),
    helpTip(help, { label: typeof text === 'string' ? text : undefined }));
}

/** Bloco "Entenda" (nível 3). */
export function entenda(title, ...content) {
  return h('details', { class: 'entenda' },
    h('summary', null, icon('info', { size: 15 }), h('span', null, title)),
    h('div', { class: 'entenda__body' }, content));
}

export { hidePopover };

/** Textos de ajuda. `short` é a dica de passar o mouse; `text` é a explicação aberta no clique. */
export const HELP = {
  meta: { title: 'Meta', short: 'Algo que você quer alcançar ao longo do tempo.', text: 'Uma meta é algo que você deseja alcançar e acompanhar ao longo do tempo: juntar um valor, completar um curso, estudar um número de horas ou cumprir etapas.', example: 'Comprar um carro de R$ 40.000.' },
  tarefa: { title: 'Tarefa', short: 'Uma ação concreta que pode ser feita.', text: 'Uma tarefa é uma ação concreta, que dá para fazer de uma vez. Só o nome é obrigatório; prazo, área e importância são opcionais.', example: 'Pagar a internet.' },
  proximoPasso: { title: 'Próximo passo', short: 'A próxima ação concreta da meta.', text: 'É a próxima ação concreta que aproxima você desta meta. Ele aparece junto da meta e na tela inicial, para a meta não ficar só na intenção.', example: 'Separar R$ 600 neste mês.' },
  importancia: { title: 'Importância', short: 'Quanto isso importa para você.', text: 'A importância é escolhida por você. O Norte combina essa informação com prazo, atraso e adiamentos para identificar o que merece atenção primeiro.' },
  prioridade: { title: 'Prioridade', short: 'Calculada a partir de prazo, importância e histórico.', text: 'A prioridade é calculada pelo Norte: considera o prazo, se está atrasada, a importância que você escolheu, quantas vezes foi adiada e se faz parte de uma meta. O motivo aparece sempre em palavras.' },
  duracao: { title: 'Duração', short: 'Tempo aproximado que a tarefa leva.', text: 'Uma estimativa de quanto tempo a tarefa leva. Com ela, o Norte consegue sugerir o que cabe quando você tem pouco tempo livre.', example: '20 minutos.' },
  area: { title: 'Área', short: 'Uma parte da sua vida, como Estudos ou Saúde.', text: 'Áreas agrupam tarefas e metas por parte da vida — Estudos, Trabalho, Dinheiro, Saúde… Elas mostram onde sua energia está indo e o que ficou esquecido.' },
  anotacao: { title: 'Anotação', short: 'Guarde agora, decida depois.', text: 'Uma anotação guarda algo rapidamente, sem decidir nada agora. Depois, você transforma em tarefa, meta ou apenas um lembrete.' },
  ritmo: { title: 'Ritmo necessário', short: 'Quanto falta dividido pelo tempo até o prazo.', text: 'O ritmo necessário é quanto falta dividido pelo tempo até a data escolhida. Comparado com a sua média recente, mostra se o prazo está confortável ou apertado.', example: 'Faltam R$ 31.500 em 24 meses → R$ 1.312,50 por mês.' },
  mediaRecente: { title: 'Média recente', short: 'Média dos seus registros recentes.', text: 'Média dos avanços que você registrou nos últimos até 90 dias. Correções de valor não entram na conta. Ela só aparece depois de pelo menos 3 semanas e 2 registros.' },
  planejado: { title: 'Planejado × realizado', short: 'Compara o que tinha prazo com o que foi feito.', text: 'Uma tarefa conta como planejada na semana em que tinha prazo. No fim da semana, ela aparece como concluída, adiada, cancelada ou ainda pendente. Serve para perceber se o tamanho do seu plano combina com o seu ritmo real — não para julgar.' },
  projecao: { title: 'Projeção', short: 'Estimativa com base no prazo e no seu ritmo.', text: 'A projeção é uma estimativa. A linha tracejada mostra o ritmo necessário para o prazo; a pontilhada, onde você chega mantendo a média recente. Ela muda conforme você registra.' },
  analisarO: { title: 'O que analisar', short: 'Escolha o conjunto de dados.', text: 'Escolha o conjunto de dados que deseja observar. Você pode analisar tudo, uma área específica, uma meta ou somente suas tarefas.' },
  periodo: { title: 'Período', short: 'O intervalo de datas analisado.', text: 'O intervalo de datas considerado nos números e gráficos. “Pendentes” e “atrasadas” sempre mostram a situação de hoje.' },
  visao: { title: 'Como ver', short: 'Escolha quanto detalhe mostrar.', text: 'Essencial mostra só os principais números, um gráfico e o que merece atenção. Detalhado permite navegar entre gráficos. Comparar coloca o período escolhido lado a lado com outro de mesmo tamanho.' },
  capacidade: { title: 'Capacidade recente', short: 'Quantas tarefas você costuma concluir por semana.', text: 'Média de tarefas concluídas por semana nas últimas semanas completas. Aparece com pelo menos 3 semanas de uso. Não é um limite — é uma referência para planejar.' },
};
