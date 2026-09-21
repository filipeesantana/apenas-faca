/** Ajuda: pequena, direta, sem virar manual. */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, button } from '../ui/components.js';
import { openAddMenu } from './add-menu.js';

const TOPICS = [
  ['Por onde começar', [
    'Toque em “+ Adicionar” e escolha o que você quer registrar: uma tarefa, uma meta, uma anotação rápida ou progresso de uma meta.',
    'Não precisa configurar nada antes. O Início mostra o que merece atenção agora, o que vence hoje e como estão suas metas.',
  ]],
  ['O que é uma tarefa?', [
    'Uma ação concreta que pode ser feita: “Pagar internet”, “Ligar para o médico”, “Assistir aula 19”.',
    'Só o nome é obrigatório. Prazo, área, importância, duração e meta são opcionais — em “Adicionar detalhes”.',
    'Se uma tarefa perdeu o sentido, use “Cancelar tarefa”. Cancelar também é organizar.',
  ]],
  ['O que é uma meta?', [
    'Algo que você quer alcançar ao longo do tempo. Você escolhe como acompanhar:',
    'Valor — dinheiro ou outro número (ex.: juntar R$ 40.000). Quantidade — aulas, livros, treinos. Tempo — horas acumuladas (ex.: estudar 60 horas). Etapas — passos a cumprir (ex.: tirar a habilitação).',
  ]],
  ['O que é um próximo passo?', [
    'É a próxima ação concreta que aproxima você de uma meta. Ex.: meta “Comprar um carro” → próximo passo “Separar R$ 600 neste mês”.',
    'Uma meta sem próximo passo tende a ficar parada. O Norte avisa quando isso acontece.',
  ]],
  ['O que são áreas?', [
    'Partes da sua vida: Estudos, Trabalho, Dinheiro, Saúde, Pessoal, Casa. Você pode renomear ou criar outras em Ajustes.',
    'Elas mostram onde sua energia está indo — e quais partes estão esquecidas.',
  ]],
  ['Como o Norte calcula prioridades?', [
    'Importância é você quem define (baixa, normal ou alta). Prioridade é calculada pelo Norte.',
    'Ele combina: prazo, atraso, importância, quantas vezes a tarefa foi adiada, há quanto tempo está na lista e se ela faz parte de uma meta.',
    'Sempre que recomenda algo, o Norte mostra o motivo. Ex.: “Vence hoje e já foi adiada duas vezes.”',
  ]],
  ['Como funcionam as análises?', [
    'O Norte guarda um histórico do que acontece (tarefas criadas, concluídas, adiadas; progresso das metas).',
    'Com regras simples e fixas, ele encontra padrões: acúmulo, adiamentos repetidos, metas paradas, áreas esquecidas, metas fora do ritmo.',
    'Cada análise tem “Como chegamos a isso?”, com os números usados. Nada é enviado para a internet.',
  ]],
  ['Como funcionam as projeções?', [
    'Ritmo necessário = quanto falta ÷ tempo até o prazo. Ex.: faltam R$ 31.500 em 24 meses → R$ 1.312,50 por mês.',
    'A média recente usa seus registros dos últimos até 90 dias. Ela só aparece com pelo menos 3 semanas de meta e 2 registros.',
    'Projeções são estimativas. Elas mudam conforme você registra.',
  ]],
  ['Onde meus dados ficam armazenados?', [
    'Somente neste navegador, neste aparelho (tecnologia IndexedDB). Não existe conta, servidor nem envio de dados.',
    'Se você limpar os dados do navegador ou trocar de aparelho, os dados não vão junto — por isso existe o backup.',
  ]],
  ['Existem atalhos de teclado?', [
    'Sim, no computador — mas nenhum é necessário. Toda ação tem um botão visível.',
    'N abre “Adicionar”. Esc fecha painéis, menus e dicas. Enter salva formulários curtos.',
  ]],
  ['Como fazer backup?', [
    'Em Ajustes → “Exportar backup”. O Norte gera um arquivo que você pode guardar onde quiser.',
    'Para restaurar, use Ajustes → “Importar backup” e escolha o arquivo. O Norte confere o arquivo e pede confirmação antes de substituir os dados.',
  ]],
];

export function helpView() {
  return h('div', { class: 'view view--help' },
    pageHead('Ajuda', 'Respostas curtas para as dúvidas mais comuns.'),
    h('div', { class: 'faq' }, TOPICS.map(([q, paras], i) => h('details', { class: 'faq__item', open: i === 0 },
      h('summary', null, h('span', null, q), icon('chevronDown', { size: 18 })),
      h('div', { class: 'faq__body' }, paras.map((p) => h('p', null, p)))))),
    h('div', { class: 'help-cta' },
      h('p', null, 'A melhor forma de aprender é usar. Comece com uma coisa só.'),
      button('Adicionar', { variant: 'primary', icon: 'plus', onClick: () => openAddMenu() })));
}
