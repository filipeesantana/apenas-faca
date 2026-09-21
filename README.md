# Apenas, Faça.

**Sistema pessoal de execução e acompanhamento.** Funciona inteiramente no navegador — sem conta, sem servidor, sem instalação.

> Tirar da cabeça → Entender → Decidir → Fazer → Registrar → Enxergar progresso → Ajustar

O sistema ajuda a responder três perguntas:

- **Agora** — o que merece minha atenção?
- **Caminho** — o que estou tentando construir?
- **Realidade** — o que meus próprios dados mostram que estou fazendo?

---

## Recursos da V1

| Área | O que faz |
|---|---|
| **Início** | Uma sugestão principal ("Agora") com o *motivo* em linguagem humana, o que mais merece atenção, metas fora do ritmo e até 2 insights. |
| **Caixa de entrada** | Captura sem classificar (uma coisa por linha, aceita colar listas). Depois, organização item a item: *Preciso fazer / Quero alcançar / Só queria anotar / Não preciso mais*. "Não sei" é resposta válida. |
| **Tarefas** | Criação em um campo só (tudo o mais é opcional). Grupos por prazo, filtros por área, concluídas, "deixadas de lado". Começar, pausar, adiar, **Não vou fazer**, excluir, desfazer. |
| **Metas** | Três tipos: por valor (R$), por quantidade e por etapas. Aportes, retiradas, correções, marcos (10/25/50/75/90/100%), ritmo necessário, média recente e previsão — sempre como estimativa. |
| **Progresso** | Resumo de 7/30/90 dias, conclusões ao longo do tempo, onde a energia foi colocada (por área) e acontecimentos relevantes. |
| **Análises** | Insights determinísticos com ação: atrasos, tarefas travadas, acúmulo, áreas esquecidas, metas fora do ritmo, backup. Entradas × saídas, visão por área, tarefas mais adiadas. |
| **Revisão rápida** | Passa pelas tarefas uma a uma: "Ainda faz sentido?" — para quem acumulou muita coisa. |
| **Ajustes** | Tema (sistema/claro/escuro), áreas, backup, dados de exemplo, apagar tudo. |

Atalho: **N** abre "Tirar da cabeça" de qualquer tela.

---

## Como executar

O projeto usa módulos JavaScript nativos (ES modules), então precisa ser servido por HTTP — abrir o `index.html` com duplo clique (`file://`) não funciona na maioria dos navegadores.

```bash
# dentro da pasta do projeto, qualquer uma destas opções:
python3 -m http.server 8000
npx serve .
```

Depois abra `http://localhost:8000`.

## Hospedar no GitHub Pages

1. Crie um repositório e envie todos os arquivos (com `index.html` na raiz).
2. Em **Settings → Pages**, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`.
3. Em alguns minutos o site fica disponível em `https://<usuario>.github.io/<repositorio>/`.

Não há build, dependências ou variáveis de ambiente. Qualquer hospedagem estática serve (Netlify, Cloudflare Pages, Vercel, um servidor Nginx).

---

## Estrutura

```
index.html
assets/icon.svg
css/
  tokens.css        cores, tipografia, tema claro/escuro
  base.css          reset, tipografia base, acessibilidade
  layout.css        barra lateral, barra superior e abas (celular)
  components.css    botões, campos, chips, cartões, painéis, toasts, gráficos
  views.css         estilos específicos de cada tela
js/
  app.js            inicialização, rotas → telas, atalhos
  core/
    db.js           IndexedDB (stores, versão, migrações)
    store.js        estado em memória + commit atômico + desfazer
    events.js       estrutura de eventos (histórico)
    router.js       rotas por hash (#/tarefas, #/metas/<id>…)
  domain/           regras de negócio, sem interface
    tasks.js  goals.js  inbox.js  areas.js
    priority.js     motor de prioridade (score interno + motivos)
    insights.js     motor de insights (severidade, deduplicação, cooldown)
    stats.js        estatísticas a partir dos eventos
  ui/               primitivas visuais
    dom.js  icons.js  components.js  charts.js  sheet.js  toast.js
  features/         telas e fluxos
    home.js  inbox.js  inbox-organizer.js  tasks.js  task-row.js  task-sheet.js
    task-actions.js  review.js  goals.js  goal-form.js  area.js
    progress.js  analytics.js  insight-card.js  capture.js  settings.js  shell.js
  data/
    backup.js       exportar/importar/validar
    demo.js         dados de exemplo (opcionais)
  utils/
    dates.js  numbers.js  helpers.js
```

Camadas: `utils` → `core` → `domain` → `ui` → `features`. Regras de negócio não conhecem a interface; a interface chama o domínio.

---

## Dados e armazenamento

Tudo fica no **IndexedDB** do navegador (banco `apenas-faca`, versão 1), em stores separados:

| Store | Conteúdo |
|---|---|
| `tasks` | tarefas (`status`: pending · doing · done · dropped; `dueDate` como `AAAA-MM-DD`; `postponedCount`) |
| `goals` | metas (`type`: money · count · steps; valores em **centavos** para dinheiro; `milestonesReached`) |
| `areas` | áreas da vida (nome, cor, ordem) |
| `inbox` | itens da caixa de entrada e anotações |
| `events` | histórico de ações — a base das análises |
| `settings` | tema, data do primeiro uso, estado dos insights, último backup |

**Eventos.** Toda ação relevante gera um evento (`task.created`, `task.postponed`, `task.completed`, `goal.progress`, `goal.milestone`…). Cada evento guarda tipo, entidade, área, um rótulo legível e metadados (ex.: `{ kind, delta, before, after }` num aporte). A entidade e o evento são gravados **na mesma transação** — ou os dois entram, ou nenhum.

**Desfazer.** Cada gravação devolve um "token" com o estado anterior; "Desfazer" restaura as entidades e remove os eventos criados.

**Datas e dinheiro.** Datas de calendário são strings locais (`2026-09-21`), imunes a fuso horário. Dinheiro é inteiro em centavos. Porcentagens mostram no máximo 1 casa (2 apenas quando exatas, ex.: 21,25%) e nunca exibem 100% antes da hora. Estimativas são arredondadas ("aproximadamente R$ 1.200/mês").

**O que conta como adiamento.** Só empurrar um prazo que *já chegou* (atrasado, hoje ou amanhã). Reorganizar planos distantes não é adiar.

**Ritmo de metas.** Média dos movimentos (aportes/retiradas, sem correções) numa janela de até 90 dias; só é calculada com ao menos 21 dias de meta e 2 movimentos. Sem isso, o sistema diz que ainda não há histórico suficiente.

## Backup e restauração

- **Ajustes → Exportar backup** gera `apenas-faca-backup-AAAA-MM-DD.json` com todos os dados e o histórico.
- **Ajustes → Importar backup** valida o arquivo (identificação, versão do formato, estrutura de cada registro), mostra um resumo e pede confirmação antes de substituir os dados atuais.
- O formato é versionado (`"format": 1`). Versões futuras podem migrar backups antigos em `data/backup.js → migrate()`.
- O próprio sistema lembra de fazer backup depois de 14 dias de uso (e a cada 30 dias).

## Dados de exemplo

Ajustes → **Carregar dados de exemplo** (ou o link na primeira tela) cria cerca de 4 meses de uso realista: tarefas atrasadas, uma tarefa adiada 4 vezes, uma área parada há 18 dias, a meta "Comprar carro" (R$ 8.500 de R$ 40.000, abaixo do ritmo), um curso de Python por aulas e a habilitação por etapas. Um selo "Dados de exemplo" fica visível até você limpar.

---

## Limitações conhecidas da V1

- **Um navegador, um aparelho.** Não há sincronização. Para trocar de aparelho, exporte e importe um backup.
- Limpar os dados do site no navegador apaga tudo. O app pede armazenamento persistente, mas o navegador pode negar — faça backups.
- Janelas anônimas de alguns navegadores bloqueiam ou descartam o IndexedDB.
- Sem funcionamento offline garantido (não há service worker). As fontes vêm do Google Fonts; sem internet, fontes do sistema são usadas.
- Sem notificações, recorrência de tarefas, hábitos ou calendário — fora do escopo desta versão.
- O motor de prioridade e os insights são regras fixas e transparentes, não aprendem com o uso.
- O histórico cresce indefinidamente; para uso pessoal isso significa alguns milhares de eventos por ano, sem impacto perceptível.

---

Desenvolvido por Filipe Santana
