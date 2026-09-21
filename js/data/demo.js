/**
 * Dados de exemplo: ~70 dias de uso realista, com eventos coerentes.
 * Só são carregados quando o usuário pede (Ajustes ou primeira tela).
 */
import { uid } from '../utils/helpers.js';
import { DAY, today, addDays, addMonths, parseISODate, endOfWeek } from '../utils/dates.js';
import { makeEvent } from '../core/events.js';
import { buildDefaultAreas } from '../domain/areas.js';
import { MILESTONES } from '../domain/goals.js';

export function buildDemoData() {
  const now = Date.now();
  const T = today();
  const areas = buildDefaultAreas(now - 70 * DAY);
  const A = Object.fromEntries(areas.map((a) => [a.name, a.id]));
  const tasks = [];
  const goals = [];
  const events = [];

  const at = (daysAgo, hour = 10, min = 0) => {
    const d = parseISODate(addDays(T, -daysAgo));
    d.setHours(hour, min, 0, 0);
    return Math.min(d.getTime(), now - 5 * 60000);
  };
  const ev = (type, entity, meta, ts) => events.push(makeEvent(type, entity, meta, ts));

  function task({ title, area, created, due = null, importance = 'normal', postpones = [], started = null, completed = null, dropped = null, goalId = null, notes = '', estimate = null, nextStep = false }) {
    const createdAt = at(created, 9 + (title.length % 8), (title.length * 7) % 60);
    let dueNow = due;
    if (postpones.length) dueNow = postpones[0][1];
    const t = {
      id: uid(), title, notes, areaId: area ? A[area] : null, goalId, importance, status: 'pending',
      dueDate: dueNow, createdAt, updatedAt: createdAt, startedAt: null, completedAt: null, droppedAt: null, postponedCount: 0, source: 'direct',
      estimateMin: estimate, nextStep: !!(nextStep && goalId),
    };
    ev('task.created', t, { dueDate: dueNow, source: 'direct', goalId, nextStep: t.nextStep }, createdAt);
    for (const [daysAgo, from, to] of postpones) {
      t.postponedCount++;
      t.dueDate = to;
      ev('task.postponed', t, { from, to }, at(daysAgo, 20));
    }
    if (started != null) { t.status = 'doing'; t.startedAt = at(started, 14); ev('task.started', t, {}, t.startedAt); }
    if (completed != null) {
      t.status = 'done'; t.completedAt = at(completed, 17, 30);
      ev('task.completed', t, { wasOverdue: false, postponedCount: t.postponedCount, dueDate: t.dueDate, importance, goalId, estimateMin: estimate }, t.completedAt);
    }
    if (dropped != null) { t.status = 'dropped'; t.droppedAt = at(dropped, 19); ev('task.dropped', t, {}, t.droppedAt); }
    t.updatedAt = Math.max(createdAt, t.startedAt || 0, t.completedAt || 0, t.droppedAt || 0);
    tasks.push(t);
    return t;
  }

  function goal({ title, area, type, target, unit = '', created, initial = 0, moves = [], steps = [], targetDate = null }) {
    const createdAt = at(created, 21);
    const g = {
      id: uid(), title, notes: '', areaId: A[area], type, unit, targetValue: type === 'steps' ? null : target,
      currentValue: initial, steps: steps.map(([s]) => ({ id: uid(), title: s, done: false, doneAt: null })),
      targetDate, status: 'active', milestonesReached: [], createdAt, updatedAt: createdAt, completedAt: null,
    };
    const ratio = () => (type === 'steps' ? g.steps.filter((s) => s.done).length / g.steps.length : Math.min(g.currentValue / target, 1));
    ev('goal.created', g, { type, targetValue: g.targetValue, initial }, createdAt);
    for (const m of MILESTONES) if (ratio() * 100 >= m) g.milestonesReached.push(m);
    const mark = (ts) => {
      for (const m of MILESTONES) {
        if (ratio() * 100 >= m && !g.milestonesReached.includes(m)) { g.milestonesReached.push(m); ev('goal.milestone', g, { pct: m }, ts + 1); }
      }
    };
    for (const [daysAgo, delta, kind = delta > 0 ? 'add' : 'withdraw', note = ''] of moves) {
      const ts = at(daysAgo, 19, 15);
      const before = g.currentValue;
      g.currentValue = Math.max(0, before + delta);
      ev('goal.progress', g, { kind, delta: g.currentValue - before, before, after: g.currentValue, note, goalType: type }, ts);
      mark(ts);
      g.updatedAt = ts;
    }
    steps.forEach(([, doneAgo], i) => {
      if (doneAgo == null) return;
      const ts = at(doneAgo, 16);
      g.steps[i].done = true; g.steps[i].doneAt = ts;
      ev('goal.step', g, { stepId: g.steps[i].id, title: g.steps[i].title, done: true }, ts);
      mark(ts);
      g.updatedAt = ts;
    });
    g.milestonesReached.sort((a, b) => a - b);
    goals.push(g);
    return g;
  }

  // Metas
  const year = parseISODate(T).getFullYear();
  const car = goal({
    title: 'Comprar carro', area: 'Dinheiro', type: 'money', target: 4000000, created: 115, initial: 500000,
    targetDate: `${year + 2}-12-01`,
    moves: [[112, 80000], [85, 40000], [70, -20000, 'withdraw', 'conserto da geladeira'], [55, 90000], [40, 50000], [25, 70000], [10, 40000]],
  });
  const python = goal({
    title: 'Curso de Python', area: 'Estudos', type: 'count', unit: 'aulas', target: 40, created: 50,
    moves: [[48, 2], [45, 1], [41, 2], [37, 1], [33, 2], [28, 1], [24, 2], [19, 1], [15, 2], [11, 1], [6, 2], [2, 1]],
  });
  goal({
    title: 'Tirar habilitação', area: 'Pessoal', type: 'steps', created: 65, targetDate: `${year}-12-15`,
    steps: [['Documentação', 60], ['Exame médico', 41], ['Prova teórica', 22], ['Aulas práticas', null], ['Prova prática', null]],
  });
  goal({
    title: 'Ler 12 livros no ano', area: 'Pessoal', type: 'count', unit: 'livros', target: 12, created: 68, initial: 5,
    targetDate: `${year}-12-31`, moves: [[52, 1], [30, 1]],
  });
  const redes = goal({
    title: 'Estudar 60 horas de Redes', area: 'Estudos', type: 'time', target: 3600, created: 40,
    targetDate: addMonths(T, 3),
    moves: [[38, 45], [35, 60], [31, 30], [27, 50], [24, 40], [20, 45], [16, 60], [12, 30], [9, 40], [5, 50], [2, 50]],
  });
  goal({
    title: 'Treinar 50 vezes', area: 'Saúde', type: 'count', unit: 'treinos', target: 50, created: 75,
    moves: [[70, 1], [66, 1], [61, 1], [45, 1]],
  });

  // Tarefas abertas
  task({ title: 'Terminar atividade da faculdade', area: 'Estudos', created: 9, importance: 'high', postpones: [[5, addDays(T, -5), addDays(T, -2)], [2, addDays(T, -2), T]] });
  tasks[tasks.length - 1].dueDate = T;
  task({ title: 'Pagar cartão', area: 'Dinheiro', created: 3, due: addDays(T, 1), importance: 'high', estimate: 10 });
  task({ title: 'Separar R$ 600 neste mês', area: 'Dinheiro', created: 6, goalId: car.id, nextStep: true, due: addDays(T, 8), estimate: 10 });
  task({ title: 'Assistir aula 19 de Python', area: 'Estudos', created: 3, goalId: python.id, nextStep: true, estimate: 30 });
  task({ title: 'Estudar Redes — camada de transporte', area: 'Estudos', created: 2, goalId: redes.id, nextStep: true, due: addDays(T, 1), estimate: 45 });
  task({ title: 'Estudar Python — módulo de funções', area: 'Estudos', created: 20, goalId: python.id, estimate: 60,
    postpones: [[13, addDays(T, -13), addDays(T, -10)], [10, addDays(T, -10), addDays(T, -6)], [6, addDays(T, -6), addDays(T, -1)], [1, addDays(T, -1), addDays(T, 2)]] });
  task({ title: 'Levar carro na oficina', area: 'Casa', created: 15, due: addDays(T, -3) });
  task({ title: 'Responder e-mail do orientador', area: 'Estudos', created: 2, due: addDays(T, -1), estimate: 20 });
  task({ title: 'Marcar dentista', area: 'Saúde', created: 25, estimate: 10 });
  task({ title: 'Pagar conta de energia', area: 'Casa', created: 4, due: T, estimate: 10 });
  task({ title: 'Arrumar currículo', area: 'Trabalho', created: 6, due: endOfWeek(), started: 1 });
  task({ title: 'Organizar documentos do imposto de renda', area: 'Dinheiro', created: 31 });
  task({ title: 'Trocar lâmpada da cozinha', area: 'Casa', created: 10, estimate: 10, importance: 'low' });
  task({ title: 'Revisar apresentação da reunião', area: 'Trabalho', created: 4, due: addDays(T, 5) });
  task({ title: 'Ler capítulo 3 do livro', area: 'Estudos', created: 4 });
  task({ title: 'Comprar presente da Ana', area: 'Pessoal', created: 5, due: addDays(T, 9) });
  task({ title: 'Cancelar assinatura que não uso', area: 'Dinheiro', created: 12 });
  task({ title: 'Pesquisar cursos de inglês', area: 'Estudos', created: 8 });

  // Histórico concluído
  const done = [
    ['Enviar relatório mensal', 'Trabalho', 62, 60], ['Pagar conta de luz', 'Dinheiro', 60, 59], ['Fazer exames de rotina', 'Saúde', 58, 45],
    ['Estudar para prova de estatística', 'Estudos', 57, 52], ['Limpar a geladeira', 'Casa', 55, 55], ['Consulta com clínico geral', 'Saúde', 50, 30],
    ['Atualizar planilha de gastos', 'Dinheiro', 48, 47], ['Reunião com a equipe de projeto', 'Trabalho', 46, 44], ['Lavar o carro', 'Casa', 44, 41],
    ['Entregar trabalho de banco de dados', 'Estudos', 42, 38], ['Renovar seguro do carro', 'Dinheiro', 40, 36], ['Preparar pauta da semana', 'Trabalho', 37, 36],
    ['Organizar armário', 'Casa', 35, 33], ['Ligar para a avó', 'Pessoal', 33, 33], ['Pagar fatura do cartão', 'Dinheiro', 31, 29],
    ['Resolver pendência no RH', 'Trabalho', 30, 27], ['Revisar anotações da aula', 'Estudos', 28, 26], ['Levar lixo reciclável', 'Casa', 26, 25],
    ['Buscar exames no laboratório', 'Saúde', 24, 18], ['Enviar proposta ao cliente', 'Trabalho', 23, 21], ['Fazer lista de mercado', 'Casa', 20, 20],
    ['Estudar listas em Python', 'Estudos', 19, 17], ['Agendar revisão da moto', 'Pessoal', 16, 14], ['Pagar condomínio', 'Dinheiro', 15, 13],
    ['Finalizar slides do seminário', 'Estudos', 14, 11], ['Corrigir bug do formulário', 'Trabalho', 13, 12], ['Responder mensagens pendentes', 'Pessoal', 11, 10],
    ['Separar roupas para doação', 'Casa', 10, 8], ['Atualizar LinkedIn', 'Trabalho', 9, 6], ['Estudar dicionários em Python', 'Estudos', 7, 5],
    ['Pagar internet', 'Dinheiro', 5, 4], ['Organizar arquivos do computador', 'Trabalho', 4, 3], ['Fazer mercado', 'Casa', 3, 2], ['Revisar aula 17', 'Estudos', 2, 1],
  ];
  done.forEach(([title, area, created, completed], i) => {
    const onPython = /Python|aula 17/.test(title);
    task({
      title, area, created, completed,
      due: i % 5 === 4 ? null : addDays(T, -completed + (i % 3 === 0 ? 2 : 0)),
      goalId: onPython ? python.id : null,
      importance: title.includes('proposta') || title.includes('prova') ? 'high' : 'normal',
    });
  });
  // Semanas passadas com planos que não saíram como previsto (adiadas e canceladas)
  task({ title: 'Organizar fotos do celular', area: 'Pessoal', created: 26, postpones: [[21, addDays(T, -22), addDays(T, -8)], [8, addDays(T, -8), addDays(T, 12)]] });
  task({ title: 'Revisar contrato do aluguel', area: 'Casa', created: 17, due: addDays(T, -12), dropped: 10 });
  task({ title: 'Ler artigo sobre investimentos', area: 'Dinheiro', created: 13, postpones: [[6, addDays(T, -7), addDays(T, 4)]] });
  task({ title: 'Montar planilha de treinos', area: 'Saúde', created: 40, dropped: 22 });
  task({ title: 'Aprender violão sozinho', area: 'Pessoal', created: 47, dropped: 12 });

  // Caixa de entrada
  const inbox = [
    ['ver plano de celular mais barato', 1], ['ideia: curso de inglês à noite', 1], ['consertar torneira do banheiro', 0],
  ].map(([text, daysAgo], i) => {
    const ts = at(daysAgo, 8 + i, 12);
    const item = { id: uid(), text, status: 'open', createdAt: ts, updatedAt: ts };
    ev('inbox.captured', item, {}, ts);
    return item;
  });

  return {
    tasks, goals, areas, inbox, events,
    settings: { initialized: true, firstRunAt: now - 120 * DAY, demo: true },
  };
}
