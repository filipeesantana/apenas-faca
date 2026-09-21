# Norte

**Apenas, faça.**

Sistema pessoal de execução e acompanhamento. Um lugar para organizar o que importa, executar e acompanhar seu progresso — direto no navegador, sem conta, sem servidor.

---

## Propósito

O Norte ajuda qualquer pessoa — organizada ou não — a responder:

- **O que merece atenção agora?**
- **O que tenho para fazer hoje?**
- **Como estão minhas metas, e qual ritmo preciso manter?**
- **Onde estou acumulando, adiando ou evoluindo?**

Complexidade por baixo (eventos, cálculos, projeções, regras de prioridade), clareza por cima: tudo é traduzido para frases simples, com o motivo de cada recomendação.

## Funcionalidades

| Área | O que faz |
|---|---|
| **Início** | Painel operacional: *Agora* (a sugestão principal e o porquê), *Hoje* (o que vence ou está em andamento), *Tem uns 30 minutos?*, *Metas em andamento* com próximo passo, *Como você está indo* e *Merece atenção*. |
| **+ Adicionar** | Um único ponto de entrada: Tarefa, Meta, Anotação rápida ou Registrar progresso. Atalho **N** no computador; botão central no celular. |
| **Tarefas** | Criação com só o nome. Prazo humano ("Faltam 9 dias"), e em *Adicionar detalhes*: área, importância (baixa/normal/alta), meta relacionada, próximo passo, duração estimada e descrição. Começar, concluir, adiar, cancelar, reabrir, desfazer. |
| **Metas** | Quatro tipos: **Valor**, **Quantidade**, **Tempo** e **Etapas**. Cada meta mostra objetivo, feito, quanto falta, porcentagem, próximo passo, tarefas ligadas, registro de progresso, planejamento, projeção e histórico — numa única tela. |
| **Próximo passo** | Toda meta pode ter uma tarefa marcada como a próxima ação concreta. Aparece na meta, na lista de metas e no Início. Metas sem próximo passo são sinalizadas. |
| **Anotações** | Guardar algo rápido sem decidir nada. Depois, organizar uma por uma: vira tarefa, meta, lembrete ou é apagada. |
| **Progresso** | 7 dias, 30 dias, este mês ou período personalizado: concluídas, criadas, adiamentos, canceladas, metas movimentadas, avanço financeiro, tempo registrado, área mais ativa, **Planejado × realizado** por semana e capacidade recente. |
| **Análises** | Seis perspectivas — Execução, Acúmulo, Consistência, Direção, Ritmo e Equilíbrio. Cada análise tem ação e *Como chegamos a isso?*. |
| **Revisar meu plano** | Uma pendência por vez, das mais importantes para as demais: fazer agora, nova data, manter sem prazo, já fiz, cancelar. |
| **Ajuda** | Página curta + dicas "?" nos pontos que costumam gerar dúvida (funcionam com mouse, teclado e toque). |

### Tarefas × metas × progresso

```
META → PRÓXIMO PASSO → TAREFA → EXECUÇÃO → PROGRESSO → ANÁLISE → AJUSTE
```

- Uma tarefa pode pertencer a uma meta e ser o seu próximo passo.
- Ao concluir uma tarefa ligada a uma meta de **tempo** (com duração) ou de **quantidade**, o Norte oferece registrar o avanço na meta com um toque.
- As análises verificam se as ações estão ligadas às metas e se as metas têm movimento.

### Prioridade (calculada) × importância (informada)

**Importância** é você quem define. **Prioridade** é calculada a partir de prazo, atraso, importância, adiamentos, idade da tarefa e ligação com metas. O número interno nunca aparece — aparece o motivo: *"Vence hoje e já foi adiada duas vezes."*

### Planejamento e projeções

Um motor genérico (`js/domain/planning.js`):

```
quanto falta ÷ tempo disponível = ritmo necessário
```

com adaptadores de unidade por tipo:

| Tipo | Prazos oferecidos | Ritmo exibido |
|---|---|---|
| Valor | 6, 12, 18, 24, 36 meses ou outra data | R$/mês (exato, como parcela) e R$/semana (aprox.) |
| Tempo | 30, 60, 90 dias, 6 meses ou outra data | minutos por dia e horas por semana |
| Quantidade | 1, 3, 6, 12 meses | unidades por semana ou por mês |
| Etapas | 1, 3, 6 meses | etapas por semana ou por mês |

Exemplos verificados: faltam R$ 31.500 → 12 meses = R$ 2.625/mês · 18 = R$ 1.750 · 24 = R$ 1.312,50 · 36 = R$ 875. Faltam 51h40 em 90 dias → cerca de 34 minutos por dia (≈ 4 horas por semana).

Também há cenários por ritmo ("20 minutos por dia → aproximadamente 5 meses") e um gráfico de projeção com histórico, ritmo planejado, ritmo recente e objetivo. A média recente usa os últimos até 90 dias e só aparece com ao menos 3 semanas e 2 registros. **Projeções são estimativas, não certezas.**

### Microtextos

Mais de 60 microtextos funcionais (`js/content/microcopy.js`), escolhidos por página e pelo estado dos dados (sobrecarregado, sem pendências, com progresso recente, metas paradas…). A escolha é estável durante o dia e evita repetir as mensagens recentes.

---

## Privacidade e armazenamento

- Tudo fica **somente no seu navegador**, no **IndexedDB**. Não há conta, servidor, API ou envio de dados.
- Stores: `tasks`, `goals`, `areas`, `inbox`, `events`, `settings`.
- **Eventos**: toda ação relevante é registrada (`task.created`, `task.postponed`, `task.completed`, `task.dropped`, `goal.progress`, `goal.milestone`…). Entidade e evento são gravados na mesma transação. É isso que alimenta Progresso, Análises e Projeções.
- Dinheiro em **centavos inteiros**; tempo em **minutos inteiros**; datas de calendário como `AAAA-MM-DD` locais.

### Migração da versão anterior

O banco foi para a **versão 2** com uma migração que preserva todos os dados da primeira versão (*Apenas, Faça.*): tarefas recebem os campos `estimateMin` e `nextStep`; nada é apagado. O nome interno do banco foi mantido de propósito para que os dados existentes sejam encontrados.

## Backup e restauração

- **Ajustes → Exportar backup** gera `norte-backup-AAAA-MM-DD.json` com tudo (inclusive o histórico).
- **Ajustes → Importar backup** valida o arquivo, mostra o resumo e pede confirmação antes de substituir.
- Formato versionado (`"format": 2`). Backups da primeira versão (`"app": "apenas-faca"`, formato 1) continuam aceitos e são convertidos automaticamente.
- O próprio Norte lembra de fazer backup após 14 dias de uso e a cada 30 dias.

---

## Como executar

O Norte usa módulos JavaScript nativos, então precisa ser servido por HTTP (abrir o `index.html` com duplo clique não funciona na maioria dos navegadores):

```bash
python3 -m http.server 8000
# ou
npx serve .
```

Abra `http://localhost:8000`.

## GitHub Pages

1. Copie o conteúdo desta pasta para a raiz do repositório (o `index.html` deve ficar na raiz).
2. `git add . && git commit -m "Norte" && git push`
3. Em **Settings → Pages**: *Deploy from a branch*, branch `main`, pasta `/ (root)`.
4. Acesse `https://USUARIO.github.io/REPOSITORIO/`.

Todos os caminhos são relativos (`./css`, `./js`, `./assets`) e as rotas usam `#`, então funciona em subpastas sem configuração. Não há build nem dependências. O arquivo `.nojekyll` evita processamento desnecessário pelo GitHub.

## Estrutura

```
index.html
README.md
.gitignore
.nojekyll
assets/icon.svg
css/
  tokens.css        cores, tipografia, temas claro/escuro
  base.css          reset, tipografia base, acessibilidade
  layout.css        barra lateral, barra superior, abas do celular
  components.css    botões, campos, ajuda "?", gráficos, painéis, toasts
  views.css         estilos de cada tela
js/
  app.js            inicialização, rotas, atalhos
  core/             db.js (IndexedDB + migrações) · store.js (estado, commit atômico, desfazer) · events.js · router.js
  domain/           regras, sem interface
    tasks.js  goals.js  inbox.js  areas.js
    priority.js     motor de prioridade (motivos em linguagem humana)
    planning.js     motor genérico de planejamento e cenários
    insights.js     motor de análises (categorias, severidade, cooldown, "como chegamos a isso")
    stats.js        estatísticas, planejado × realizado, capacidade
  content/
    microcopy.js    microtextos contextuais
  ui/               dom.js · icons.js · components.js · charts.js · help.js · sheet.js · toast.js
  features/         telas e fluxos (home, tasks, task-form, task-sheet, goals, goal-form,
                    progress-log, progress, analytics, review, inbox, add-menu, help, settings…)
  data/             backup.js · demo.js
  utils/            dates.js · numbers.js · helpers.js
```

Camadas: `utils` → `core` → `domain` → `ui` → `features`.

## Qualidade verificada

- Nenhum erro no console; nenhum 404 servindo da raiz ou de subpasta.
- Auditoria automática de acessibilidade (axe-core, WCAG 2 A/AA) sem violações nas telas principais, em tema claro e escuro.
- Testes de ponta a ponta: primeiro uso, criação de tarefa e meta, registro de progresso, próximo passo, revisão guiada, migração real da V1, exportação e importação (formatos 1 e 2), celular 390 px.

## Limitações desta versão

- **Um navegador, um aparelho.** Sem sincronização; use o backup para trocar de aparelho.
- Limpar os dados do site apaga tudo. O Norte pede armazenamento persistente, mas o navegador pode negar.
- Janelas anônimas de alguns navegadores descartam o IndexedDB.
- Sem modo offline garantido (não há service worker). As fontes vêm do Google Fonts; sem internet, fontes do sistema são usadas.
- Sem tarefas recorrentes, notificações, hábitos ou calendário.
- Prioridades e análises são regras fixas e transparentes — não aprendem com o uso.
- Metas por etapas não têm valor numérico; o planejamento é feito por etapas restantes.

---

Desenvolvido por Filipe Santana
