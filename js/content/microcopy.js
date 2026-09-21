/**
 * Microtextos funcionais, organizados por contexto e por estado do usuário.
 *
 * Regras de escolha (ver `pickCopy`):
 *  1. Mensagens ligadas ao estado atual (ex.: "sobrecarregado") têm preferência;
 *     sem nenhuma, usa as genéricas ("any").
 *  2. A escolha é estável durante o dia: recarregar a página não troca o texto.
 *  3. Evita repetir as últimas mensagens mostradas naquele contexto.
 * Tom: direto, útil, sem motivação artificial.
 */
import { today } from '../utils/dates.js';
import { hashString, local } from '../utils/helpers.js';

export const COPY = {
  home: [
    { id: 'h-any-1', when: 'any', text: 'Veja o que merece sua atenção hoje.' },
    { id: 'h-any-2', when: 'any', text: 'Um resumo do que está em andamento.' },
    { id: 'h-any-3', when: 'any', text: 'Comece pelo que está no topo. O resto pode esperar.' },
    { id: 'h-any-4', when: 'any', text: 'Aqui está sua situação de hoje.' },
    { id: 'h-any-5', when: 'any', text: 'O que fazer agora, o que vence hoje e como estão suas metas.' },
    { id: 'h-over-1', when: 'overloaded', text: 'Algumas pendências estão acumuladas. Vale revisar o que ainda merece atenção.' },
    { id: 'h-over-2', when: 'overloaded', text: 'Há bastante coisa aberta. Uma de cada vez resolve mais do que tentar tudo.' },
    { id: 'h-over-3', when: 'overloaded', text: 'Você não precisa resolver tudo hoje. Escolha o que realmente importa.' },
    { id: 'h-clear-1', when: 'clear', text: 'Nada vence hoje. Um bom momento para avançar em uma meta.' },
    { id: 'h-clear-2', when: 'clear', text: 'Sem pendências urgentes. Que tal definir o próximo passo de algo maior?' },
    { id: 'h-prog-1', when: 'progress', text: 'Algumas coisas avançaram nos últimos dias.' },
    { id: 'h-prog-2', when: 'progress', text: 'Veja o que mudou desde a última vez.' },
    { id: 'h-stall-1', when: 'stalledGoals', text: 'Algumas metas estão paradas. Um passo pequeno já muda o quadro.' },
  ],
  capture: [
    { id: 'c-1', when: 'any', text: 'Tem algo que você não quer esquecer?' },
    { id: 'c-2', when: 'any', text: 'Registre antes que isso volte a ocupar sua cabeça.' },
    { id: 'c-3', when: 'any', text: 'Anote aqui. Você decide o que fazer depois.' },
    { id: 'c-4', when: 'any', text: 'Uma conta, um compromisso, uma ideia…' },
    { id: 'c-5', when: 'any', text: 'Escreva do jeito que vier. Uma coisa por linha.' },
    { id: 'c-6', when: 'any', text: 'O que você precisa lembrar?' },
  ],
  inbox: [
    { id: 'i-any-1', when: 'any', text: 'Anote primeiro. Decida depois.' },
    { id: 'i-any-2', when: 'any', text: 'Um lugar para guardar o que ainda não tem destino.' },
    { id: 'i-pend-1', when: 'pending', text: 'Algumas anotações esperam uma decisão. Leva poucos minutos.' },
    { id: 'i-pend-2', when: 'pending', text: 'Para cada anotação: é algo a fazer, algo a alcançar ou só um lembrete?' },
    { id: 'i-empty-1', when: 'empty', text: 'Nada esperando decisão.' },
    { id: 'i-empty-2', when: 'empty', text: 'Tudo organizado por aqui.' },
  ],
  tasks: [
    { id: 't-any-1', when: 'any', text: 'Coisas concretas que você precisa fazer.' },
    { id: 't-any-2', when: 'any', text: 'Ordenadas por prazo. As mais urgentes ficam no topo.' },
    { id: 't-any-3', when: 'any', text: 'Escreva o nome e pronto. Detalhes são opcionais.' },
    { id: 't-over-1', when: 'overloaded', text: 'A lista está longa. Revisar ajuda a separar o que ainda importa.' },
    { id: 't-over-2', when: 'overloaded', text: 'Nem tudo precisa ser feito. Cancelar também é organizar.' },
    { id: 't-clear-1', when: 'clear', text: 'Nenhuma pendência no momento.' },
  ],
  goals: [
    { id: 'g-any-1', when: 'any', text: 'O que você está construindo ao longo do tempo.' },
    { id: 'g-any-2', when: 'any', text: 'Transforme uma intenção em algo que possa acompanhar.' },
    { id: 'g-any-3', when: 'any', text: 'Cada meta mostra quanto falta e qual ritmo manter.' },
    { id: 'g-any-4', when: 'any', text: 'Uma meta avança quando tem um próximo passo claro.' },
    { id: 'g-stall-1', when: 'stalled', text: 'Algumas metas não se movem há semanas. Defina um próximo passo ou arquive.' },
    { id: 'g-stall-2', when: 'stalled', text: 'Metas paradas pesam. Decida se ainda fazem sentido.' },
    { id: 'g-empty-1', when: 'empty', text: 'Metas ajudam a acompanhar algo que você deseja alcançar ao longo do tempo.' },
  ],
  progress: [
    { id: 'p-any-1', when: 'any', text: 'Veja o que mudou nos últimos dias.' },
    { id: 'p-any-2', when: 'any', text: 'O que realmente aconteceu no período.' },
    { id: 'p-any-3', when: 'any', text: 'Compare o que foi planejado com o que foi feito.' },
    { id: 'p-any-4', when: 'any', text: 'Números para calibrar sua capacidade, não para julgar.' },
    { id: 'p-empty-1', when: 'empty', text: 'O histórico aparece aqui conforme você usa o Norte.' },
  ],
  analytics: [
    { id: 'a-any-1', when: 'any', text: 'Padrões encontrados nos seus próprios dados.' },
    { id: 'a-any-2', when: 'any', text: 'O que os números mostram — e o que dá para fazer.' },
    { id: 'a-any-3', when: 'any', text: 'Cada análise explica como chegou à conclusão.' },
    { id: 'a-calm-1', when: 'calm', text: 'Nada fora do comum no momento.' },
    { id: 'a-calm-2', when: 'calm', text: 'Sem sinais de acúmulo ou atraso agora.' },
    { id: 'a-empty-1', when: 'empty', text: 'Com alguns dias de uso, os padrões começam a aparecer.' },
  ],
  review: [
    { id: 'r-1', when: 'any', text: 'Uma pendência por vez. Decida e siga para a próxima.' },
    { id: 'r-2', when: 'any', text: 'Não precisa terminar agora. Cada decisão já ajuda.' },
    { id: 'r-3', when: 'any', text: 'Mantenha só o que ainda faz sentido.' },
  ],
  reviewDone: [
    { id: 'rd-1', when: 'any', text: 'Revisão concluída. Sua lista está mais clara.' },
    { id: 'rd-2', when: 'any', text: 'Pronto. O que ficou é o que importa.' },
  ],
  emptyTasks: [
    { id: 'et-1', when: 'any', text: 'Quando algo precisar ser feito, adicione aqui. Basta o nome.' },
    { id: 'et-2', when: 'any', text: 'Tarefas são ações concretas: pagar, ligar, enviar, estudar.' },
  ],
  emptyGoals: [
    { id: 'eg-1', when: 'any', text: 'Metas ajudam a acompanhar algo que você deseja alcançar ao longo do tempo.' },
    { id: 'eg-2', when: 'any', text: 'Juntar um valor, completar um curso, cumprir etapas: o Norte calcula o ritmo por você.' },
  ],
  nextStep: [
    { id: 'ns-1', when: 'any', text: 'Qual é a próxima ação concreta?' },
    { id: 'ns-2', when: 'any', text: 'Algo pequeno que você consiga fazer esta semana.' },
    { id: 'ns-3', when: 'any', text: 'Sem próximo passo, a meta fica só na intenção.' },
  ],
};

const STORE_KEY = 'norte-copy';
let memory = null;

function load() {
  if (memory) return memory;
  const data = local.get(STORE_KEY, null);
  memory = data && data.date === today() ? data : { date: today(), picks: {}, recent: data?.recent || {} };
  return memory;
}

/**
 * Escolhe o microtexto de um contexto. `states` em ordem de preferência.
 * Ex.: pickCopy('home', ['overloaded']) → mensagem de sobrecarga, estável no dia.
 */
export function pickCopy(context, states = []) {
  const pool = COPY[context] || [];
  if (!pool.length) return '';
  const tag = states.find((s) => pool.some((m) => m.when === s)) || 'any';
  const eligible = pool.filter((m) => m.when === tag);
  const data = load();
  const key = `${context}|${tag}`;
  const picked = eligible.find((m) => m.id === data.picks[key]);
  if (picked) return picked.text;

  const recent = data.recent[context] || [];
  const fresh = eligible.filter((m) => !recent.includes(m.id));
  const candidates = fresh.length ? fresh : eligible;
  const choice = candidates[hashString(`${data.date}|${key}`) % candidates.length];
  data.picks[key] = choice.id;
  data.recent[context] = [choice.id, ...recent.filter((id) => id !== choice.id)].slice(0, Math.max(1, Math.floor(eligible.length / 2)));
  local.set(STORE_KEY, data);
  return choice.text;
}

export const copyCount = () => Object.values(COPY).reduce((a, l) => a + l.length, 0);
