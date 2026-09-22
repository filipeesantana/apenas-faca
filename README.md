# Norte

**Apenas, faça.**

> Sistema pessoal de execução e acompanhamento.

---

## Sobre

O Norte ajuda a transformar intenções em ações e a perceber se você está realmente avançando. Ele mostra **o que merece atenção agora**, **o que você está tentando alcançar** e **o que seus próprios dados revelam** — com linguagem simples, sem exigir que você conheça métodos de produtividade.

É simples para quem nunca usou um aplicativo de organização e profundo o bastante para quem quer entender o próprio ritmo.

## Acessar

**https://filipeesantana.github.io/norte/**

Funciona no navegador do computador, tablet ou celular. Não há cadastro, login ou instalação.

---

## O que o Norte faz

| | |
|---|---|
| **Início** | Um painel do dia: a ação mais importante agora (e o porquê), o que vence hoje, o que cabe em 30 minutos, como estão suas metas e o que merece atenção. |
| **Tarefas** | Criação com apenas o nome. Prazo em linguagem humana (“amanhã”, “faltam 4 dias”), importância, duração, área e ligação com metas. Ações rápidas em cada linha e filtros com contagem. |
| **Metas** | Quatro formas de acompanhar: **valor** (ex.: juntar R$ 40.000), **quantidade** (40 aulas), **tempo** (60 horas de estudo) e **etapas**. Cada meta reúne progresso, próximo passo, histórico e projeção numa só tela. |
| **Planejamento** | “Como posso chegar lá?”: o ritmo necessário para cada prazo (6, 12, 24 meses…), comparação entre cenários e quanto tempo levaria mantendo um ritmo escolhido. |
| **Progresso** | O que aconteceu em 7 dias, 30 dias, no mês ou num período à sua escolha — incluindo **planejado × realizado** por semana e sua capacidade média recente. |
| **Análises** | Em três escolhas — o que analisar (tudo, uma área, uma meta ou as tarefas), o período e o jeito de ver (Essencial, Detalhado ou Comparar) — o Norte mostra um resumo em frases simples, um gráfico que responde a uma pergunta, o que merece atenção e no máximo duas ações para agora. Cada ponto traz “Entender análise”, com os dados usados e o cálculo. Inclui “Revisar minha semana”, em cinco passos. |
| **Revisão guiada** | “Revisar meu plano”: uma pendência por vez — fazer agora, escolher nova data, manter sem prazo, concluir ou cancelar. Feita para quem acumulou muita coisa. |
| **Anotações** | Guarde algo rapidamente e decida depois se vira tarefa, meta ou lembrete. |
| **Backup local** | Exporte e restaure todos os seus dados em um arquivo. |

## Como funciona

```
Meta  →  próximo passo  →  tarefa  →  execução  →  progresso  →  análise  →  ajuste
```

- Uma **meta** é algo que você quer alcançar ao longo do tempo.
- O **próximo passo** é a ação concreta que a aproxima — uma tarefa ligada a ela.
- Ao concluir tarefas e registrar progresso, o Norte guarda um **histórico de eventos**.
- Esse histórico alimenta o **progresso**, as **projeções** e as **análises**, que mostram onde ajustar.

A **prioridade** é calculada pelo Norte (prazo, atraso, importância, adiamentos, ligação com metas) e sempre vem com o motivo — por exemplo, *“Vence hoje e já foi adiada duas vezes.”* Números internos nunca aparecem como nota.

As projeções são estimativas: ritmo necessário = quanto falta ÷ tempo disponível. Faltando R$ 31.500, por exemplo: 12 meses → R$ 2.625/mês; 24 meses → R$ 1.312,50/mês.

---

## Estrutura do projeto

```
index.html          página única da aplicação
assets/             ícone
css/
  tokens.css        cores, tipografia, espaçamento e movimento (temas claro e escuro)
  base.css          base tipográfica, foco visível, movimento reduzido
  layout.css        barra lateral, barra superior e navegação do celular
  components.css    botões, campos, dicas, menus, gráficos, painéis e avisos
  views.css         estilos de cada tela
js/
  app.js            inicialização e navegação entre telas
  core/             banco local (IndexedDB), estado em memória, eventos e rotas
  domain/           regras do produto: tarefas, metas, prioridade, planejamento,
                    pontos de atenção e estatísticas — sem interface
  analysis/         cálculo das análises: períodos, resumo, séries e comparação
  content/          microtextos contextuais
  ui/               componentes visuais reutilizáveis (dicas, menus, gráficos, painéis)
  features/         telas e fluxos (Início, Tarefas, Metas, Progresso, Análises…)
  data/             backup e dados de demonstração
  utils/            datas, números e utilitários
```

## Tecnologias

- **HTML**, **CSS** e **JavaScript** modernos (módulos nativos)
- **IndexedDB** para armazenamento local

Sem frameworks, sem bibliotecas externas e sem etapa de build. A interface foi pensada para funcionar bem com teclado, leitores de tela, toque e movimento reduzido.

## Armazenamento e privacidade

Todos os dados ficam **somente no seu navegador**, no aparelho que você está usando. Não existe servidor, conta ou envio de informações para a internet — nem o autor do projeto tem acesso aos seus dados.

## Backup

Em **Ajustes**, você pode **exportar** um arquivo com tudo (tarefas, metas, anotações e histórico) e **restaurá-lo** depois — por exemplo, ao trocar de aparelho. O Norte confere o arquivo e pede confirmação antes de substituir os dados atuais, e lembra você de fazer backup periodicamente. Backups de versões anteriores continuam compatíveis.

## Limitações

- **Um navegador, um aparelho.** Não há sincronização automática; use o backup para levar os dados a outro lugar.
- Limpar os dados do site no navegador apaga as informações do Norte. Janelas anônimas podem não guardar nada.
- Não há funcionamento offline garantido, lembretes, notificações ou tarefas recorrentes.
- Prioridades e análises usam regras fixas e transparentes; não aprendem com o uso.

---

## Desenvolvedor

**Filipe Santana**
