# FRONTEND_CONTEXT — ClinIA

> Documento de contexto para consultoria de UI/UX e planejamento de redesign.
> Gerado a partir da leitura integral do código-fonte em `src/`, dos testes em `tests/` e dos arquivos de configuração (13/11/2026).
> Nenhum código foi alterado.
>
> **Convenção usada neste documento**
> - Sem marcação → **fato confirmado no código**.
> - **[Hipótese]** → inferência razoável, não verificável apenas pelo código.
> - **[Observação]** → avaliação crítica do analista (inconsistência, risco, oportunidade).

---

## 1. Objetivo da aplicação e funcionalidades implementadas

### 1.1 O que é

**ClinIA** é o frontend de um **CRM administrativo para clínicas** (recepção/gestão), não um prontuário eletrônico. Slogan na interface: *"Cuidado que conecta"* / *"Mais tempo para cuidar."*

É uma **demonstração 100% local**: não há backend, login, banco de dados, integração com WhatsApp nem LLM. Todos os dados são fictícios, gerados de forma determinística e persistidos no `localStorage` do navegador. A interface deixa isso explícito em vários pontos ("Ambiente demonstrativo · Dados fictícios", "Respostas simuladas", "WhatsApp simulado").

- Idioma: **português do Brasil** (todas as strings estão escritas diretamente no código; não há i18n).
- Fuso fixo: **America/Recife** (UTC−3).
- Usuária logada (fictícia e fixa): **Marina Costa, Administradora**.
- Clínica fictícia: **Clínica Florescer** (4 especialidades: Cardiologia, Dermatologia, Fisioterapia, Nutrição; 4 profissionais; 24 pacientes; 3 usuários de atendimento).
- **"Relógio" da demonstração:** a data de referência é o dia da primeira abertura, com hora congelada em **10h15**. Todo o conceito de "hoje", "passado" e "futuro" deriva disso.

**[Hipótese]** Pelo README e por um diretório-cópia chamado `Eng_de_Software/` ("Projeto da disciplina de Engenharia de Software"), trata-se de um projeto acadêmico/protótipo de alta fidelidade feito para validar fluxos antes de uma integração real.

### 1.2 Público e contexto de uso

- Usuários-alvo: **recepcionistas/atendentes** e **administradores/gestores** de clínica.
- Uso principal em **desktop** (testes E2E rodam em 1440×1000), mas há responsividade testada em 1280, 1024, 768 e **390 px** (celular).

### 1.3 Funcionalidades confirmadas (por domínio)

| Domínio | Funcionalidades |
|---|---|
| **Início (operação do dia)** | Saudação; 4 indicadores com comparação ao período anterior; filtro de período (Hoje / 7 / 30 dias); "Precisa de atenção" (fila de solicitações, confirmações de hoje, pedidos de remarcação); opções livres de 30 min hoje; lista das próximas consultas de hoje (até 5); gráfico de evolução; resumo da fila de conversas; atalho "Explorar com a IA"; novo agendamento; detalhes/remarcação de consulta em modal sem sair da página. |
| **Conversas (inbox WhatsApp simulado)** | Lista com busca (nome/telefone) e filtros (situação, responsável, motivo "remarcação"); ordenação por prioridade operacional; assumir conversa; responder; devolver à IA; encerrar; histórico com sessões e separadores de data; status de entrega (enviando / enviada / falha + "Tentar novamente"); painel lateral do paciente (dados, próximos agendamentos, remarcar, histórico de eventos); simulador de mensagem recebida (inclui simular falha de envio). |
| **Gestão › Visão gerencial** | Filtros (período, profissional, especialidade); 4 KPIs com valor anterior e variação; gráfico de evolução; tabela "Resultados do período" (atual × anterior); tabela "Atividade por profissional" com ordenação por coluna e linha de totais. |
| **Gestão › Agenda** | Grade de calendário com posicionamento proporcional ao horário (2 px/min = 120 px/h); visão **dia por profissional** (todos) ou **semana individual** (um profissional selecionado) — troca automática, sem botões Dia/Semana; navegação anterior/próximo/hoje; campo de data digitável; filtros (profissional, situação, paciente, especialidade); modo lista quando há intervalo `from/to`; painel lateral de **Disponibilidade** (horários livres clicáveis que abrem novo agendamento) e **Bloqueios**; consultas fora do expediente preservadas numa seção à parte; modais de novo agendamento, remarcação e detalhes. |
| **Detalhes da consulta (modal)** | Confirmar, remarcar, marcar realizada, registrar falta, cancelar (com motivo opcional); anotações da consulta (somente após "realizada"), versionadas; linha do tempo de eventos (auditoria). |
| **Gestão › Equipe** | Aba **Profissionais de saúde** (cards ou tabela, busca, filtros, ordenação, paginação de 12) e aba **Atendentes** (métricas de atendimento: assumidas, encerradas, tempo até assumir, primeira resposta); página de detalhe do profissional (KPIs, mini-gráfico de barras de 7 dias, disponibilidade semanal, consultas do período, inativar/reativar); página de detalhe do atendente (KPIs, ações administrativas, histórico de atividade); cadastro/edição de profissional (especialidades, faixas semanais). |
| **Gestão › Pacientes** | Lista com busca e filtro por convênio, próxima consulta; cadastro/edição (com alerta e confirmação explícita de **telefone compartilhado**); página de detalhe (dados, agendamentos com ações, histórico de conversas por sessão). |
| **Gestão › Configurações** | Abas: **Clínica e horários** (dados, convênios, especialidades, horário de funcionamento em faixas); **Disponibilidade** (faixas semanais por profissional + bloqueios por data); **Base de conhecimento** (orientações administrativas: criar, editar, arquivar, reativar, buscar). Alerta global de consultas futuras que ficaram fora da disponibilidade. **Ferramentas da demonstração**: "Testar falha de salvamento" e "Restaurar demonstração". |
| **Bloqueios de agenda** | Fluxo em etapas: formulário → se houver consultas no intervalo, **revisão de conflitos** (remarcar ou cancelar cada uma) → "Concluir e criar bloqueio". |
| **Assistente IA (global)** | Modal aberto pelo botão da barra superior; 5 intenções reconhecidas por regex (pendências de hoje, consultas de amanhã, horários livres na semana, resumo da conversa, cancelamentos no período); contexto da página removível; respostas com links navegáveis; histórico persistido; modo expandido. Não executa alterações. |
| **Tema** | Claro/escuro, inicial pelo sistema, escolha manual persistida (`clinia.theme`), sem flash (script inline antes da hidratação). |

---

## 2. Stack tecnológica

| Item | Versão / detalhe |
|---|---|
| Framework | **Next.js 16.4.6** (App Router, Turbopack). `AGENTS.md` alerta que esta versão tem breaking changes em relação ao conhecimento comum e manda consultar `node_modules/next/dist/docs/` antes de codar. |
| UI | **React 19.3.1** / React DOM 19.3.1 |
| Linguagem | **TypeScript 5.9.3** (strict) |
| Estilo | **Tailwind CSS 4.3.5** via `@tailwindcss/postcss` + **CSS próprio com variáveis** (predominante) |
| Ícones | **lucide-react 0.468.0** (única dependência de UI de terceiros) |
| Lint | ESLint 9 + `eslint-config-next` (core-web-vitals + typescript) |
| Testes unitários | `node --test` com `tsx` (7 arquivos, ~49 casos de regras de negócio) |
| Testes E2E | **Playwright 1.65.0** (9 specs; Chromium; locale pt-BR; fuso America/Recife). Último run registrado: **passed**. |
| Node | ≥ 20.9.0 |
| Alias | `@/*` → `src/*` |

**Não há:** biblioteca de componentes (shadcn, Radix, MUI…), biblioteca de gráficos, gerenciador de estado externo (Redux, Zustand, React Query), biblioteca de formulários, de datas, de animação, nem de fontes (`next/font` não é usado).

`next.config.ts`: `poweredByHeader: false`, `devIndicators: false`.

---

## 3. Organização de diretórios e arquitetura

```
ClinIA/
├─ src/
│  ├─ app/                    # Rotas (App Router) + TODO o CSS
│  │  ├─ layout.tsx           # <html>, script de tema, DemoProvider, AppShell
│  │  ├─ page.tsx             # redirect('/inicio')
│  │  ├─ inicio/ conversas/ gestao/{visao-gerencial,agenda,equipe,pacientes,configuracoes}/page.tsx
│  │  ├─ not-found.tsx, error.tsx, icon.svg
│  │  ├─ globals.css          # 2.753 linhas – composição de páginas (importa os demais)
│  │  ├─ tokens.css           # design tokens (cores, tipografia, espaço, densidade)
│  │  ├─ design-system.css    # componentes base (botão, badge, campo, modal, tabela…)
│  │  └─ home.css, conversations.css, management.css, team.css
│  ├─ components/             # Shell e primitivos compartilhados
│  │  ├─ app-shell.tsx        # topbar, nav, sub-nav de gestão, rodapé, modal de perfil
│  │  ├─ ui.tsx               # Button, SearchInput, Badge, Spinner, Avatar, EmptyState, PageHeading, Field, Modal
│  │  ├─ date-time-fields.tsx # DateInput / TimeInput digitáveis
│  │  ├─ theme-toggle.tsx
│  │  ├─ demo-provider.tsx    # estado global + persistência
│  │  └─ assistant-provider.tsx # contexto + modal do assistente
│  ├─ features/               # Telas por domínio (client components)
│  │  ├─ dashboard.tsx (+ TrendChart), home-operations.tsx, management-overview.tsx
│  │  ├─ agenda.tsx, agenda/{calendar-grid, appointment-form, appointment-details, block-form}.tsx
│  │  ├─ conversations.tsx, conversations/message-history.tsx
│  │  ├─ patients.tsx, team.tsx, team-roster.tsx, settings.tsx
│  └─ lib/                    # Lógica pura (sem React)
│     ├─ types.ts, demo-data.ts, state-validation.ts
│     ├─ services.ts          # runCommand(): "API" simulada assíncrona
│     ├─ metrics.ts, scheduling.ts, assistant.ts, date.ts
│     ├─ *-presentation.ts    # ordenação/rótulos/tons para a UI
│     └─ modal-focus.ts, theme.ts, metric-comparison.ts
├─ tests/                     # unitários (*.test.ts) e e2e/ (Playwright)
├─ Eng_de_Software/           # CÓPIA idêntica de src/ e tests/ com .git próprio (ver §9)
├─ docs/                      # VAZIO
└─ public/, scripts/          # VAZIOS
```

### Padrões arquiteturais

- **Rotas finas:** cada `page.tsx` só renderiza um componente de `features/`, às vezes dentro de `<Suspense>` (exigido por `useSearchParams`).
- **Tudo é client-side:** praticamente todas as features são `'use client'`. Não há Server Components com dados, Server Actions, nem route handlers.
- **Estado de navegação na URL:** filtros, item selecionado e modais abertos ficam em query params (ex.: `?appointment=ID`, `?edit=ID`, `?new=1`, `?period=7`, `?tab=…`). Isso torna estados linkáveis e o botão "voltar" funcional — e é usado pelo assistente e pelos links cruzados.
- **Separação lógica/UI:** regras de negócio em `lib/` (testadas por unidade); componentes consomem `useDemo()` e chamam `act(command)`.
- **Padrão Command:** toda mutação é um objeto `Command` despachado para `runCommand()` (ver §7).

---

## 4. Páginas, rotas e funcionalidades

### 4.1 Mapa de rotas

| Rota | Componente | Título (h1) | Query params relevantes |
|---|---|---|---|
| `/` | redirect | — | — |
| `/inicio` | `Dashboard` | "Bom dia, Marina" | `period` (1/7/30), `appointment`, `edit`, (`professional`, `specialty` aceitos mas sem UI) |
| `/conversas` | `Conversations` | "Conversas" | `id`, `status`, `assignee` (`me`/`other`/id), `reason=remarcacao` |
| `/gestao/visao-gerencial` | `Dashboard management` → `ManagementOverview` | "Visão gerencial" | `period`, `professional`, `specialty`, `sort`, `order` |
| `/gestao/agenda` | `Agenda` | "Agenda" | `date`, `professional`, `patient`, `specialty`, `status` (inclui `previstas`, `pendente`), `from`/`to`, `new`, `edit`, `appointment`, `start`, `availability`, `context` |
| `/gestao/equipe` | `Team` | "Equipe" / nome da pessoa | `tab=atendentes`, `id`, `attendant`, `days` (7/30), `q`, `specialty`, `active`, `view=table`, `sort`, `order`, `page` |
| `/gestao/pacientes` | `Patients` | "Pacientes" / nome | `id`, `q`, `insurance`, `context` |
| `/gestao/configuracoes` | `Settings` | "Configurações" | `tab` (`clinic`/`availability`/`knowledge`), `professional`, `block` |
| 404 | `not-found.tsx` | "Página não encontrada" | — |
| erro | `error.tsx` | "Não foi possível abrir esta tela" | — |

O parâmetro `context=<conversationId>` atravessa Pacientes e Agenda para exibir **"Voltar à conversa"** — fluxo central da demonstração.

### 4.2 Detalhe por tela

**Início (`/inicio`)**
1. `PageHeading`: eyebrow com data por extenso; título "Bom dia, Marina"; select de período + botão "Novo agendamento".
2. Legenda "Seu resumo / período · Comparado a período anterior".
3. **4 cards de métrica (links)**: Consultas previstas, Consultas realizadas, Ocupação da agenda, Taxa de faltas — cada um com ícone, valor, detalhe e variação (seta + texto + tom positivo/negativo/neutro).
4. Grade de 2 colunas: **"Precisa de atenção"** (3 ações com contadores + link de horários livres) e **"Na agenda de hoje"** (até 5 linhas: horário, paciente, profissional, badge de status, "Aguardando resultado").
5. Grade de 2 colunas: **"Consultas no período"** (gráfico SVG + tabela acessível em `<details>`) e **"Conversas"** (contagens por fila + insight de cancelamentos com botão "Explorar com a IA").
6. `<details>` "Como calculamos estes indicadores".

**Conversas (`/conversas`)** — layout de 3 painéis com altura de viewport:
- Esquerda: "Caixa de entrada" (contador, busca, 2 selects, lista de itens com avatar, nome, hora, prévia, badge). Rodapé "WhatsApp simulado · dados fictícios".
- Centro: cabeçalho do contato; faixa de responsabilidade com ações (Assumir / Devolver à IA / Encerrar); faixa "Motivo do encaminhamento"; banners de erro/sucesso; histórico de mensagens (bolhas por autor: paciente, IA, humano; eventos centralizados); botão flutuante "Últimas mensagens"; compositor (textarea, Enter envia, Shift+Enter quebra linha) e link "Simular mensagem recebida".
- Direita: "Dados do paciente" (recolhível em ≥768 px; em <768 px abre em modal).
- Estado vazio: ilustração com ícone + "Cada conversa, um cuidado."
- Em <768 px, lista e conversa alternam (master/detail) com botão voltar.

**Visão gerencial** — toolbar de filtros; legenda do período; 4 KPIs com "Anterior: X" e variação; grade gráfico + tabela de resultados; tabela por profissional com cabeçalhos ordenáveis (`aria-sort`), barra de ocupação, `tfoot` de totais; definições.

**Agenda** — cabeçalho com "Novo agendamento"; toolbar (mês/ano, título do período, setas, "Hoje", campo de data); faixa de filtros (4 selects + "Limpar"); layout principal **calendário (card) + sidebar** (Disponibilidade e Bloqueios). O calendário tem rolagem própria em ambos os eixos, cabeçalho e eixo de horas fixos, faixas cinza "Clínica fechada", linhas de 30 min/hora, cards de consulta coloridos por status, consultas simultâneas lado a lado (lanes). A largura de colunas cresce com o tamanho dos nomes, nunca a escala de tempo.

**Equipe** — lista com segmented control (Profissionais / Atendentes) e select de período; cards ou tabela de profissionais; paginação. Detalhes descritos em §1.3.

**Pacientes** — lista em tabela dentro de card (avatar + nome, contato, badge de convênio, próxima consulta, link). Detalhe: grid 2 colunas (card de perfil com botão "Agendar consulta" | cards "Agendamentos" e "Histórico de conversas").

**Configurações** — abas como "pílulas" com navegação por setas (padrão ARIA tabs); cada aba em cards; `<details>` "Ferramentas da demonstração" no rodapé.

---

## 5. Componentes reutilizáveis, layout compartilhado e navegação

### 5.1 Shell (`AppShell`, em todas as rotas)

```
┌ topbar (68px, fundo surface, borda inferior) ─────────────────────────────────┐
│ [logo "clinia."]  [ Início | Conversas (n) | Gestão ]  [🌙] [✦ Assistente IA] | [avatar Marina ▾] │
└──────────────────────────────────────────────────────────────────────────────────┘
 workspace (max-width 1680px, centralizado)
   workspace-meta: "● Clínica Florescer"  ……  "Ambiente demonstrativo · Dados fictícios"
   [management-nav — só em /gestao/*: Visão gerencial | Agenda | Equipe | Pacientes | Configurações]
   [error-banner global]
   <main id="main-content"> … página … </main>
   footer: "ClinIA · Mais tempo para cuidar."  ……  "Referência da demonstração: <data> · 10h15 (Recife)"
```

- **Navegação principal**: 3 itens em um "segmented" com ícones (Home, MessageCircle, LayoutGrid). "Conversas" mostra contador de conversas aguardando. "Gestão" leva a `/gestao/visao-gerencial`.
- **Sub-navegação de Gestão**: abas de texto sublinhadas, com rolagem horizontal.
- **Skip link** "Pular para o conteúdo"; `aria-current="page"` nos links ativos.
- **Perfil**: botão abre modal informativo (identidade fictícia + link para Configurações). Não há logout nem menu.
- **Carregamento**: o conteúdo fica oculto (`hidden`) com spinner "Organizando sua clínica…" até o estado ser lido do `localStorage` (~80 ms).
- Em ≤600 px a `main-nav` vira faixa posicionada absolutamente abaixo do logo; o nome do perfil some em ≤1150 px.
- Não existe sidebar lateral; a navegação é toda horizontal.

### 5.2 Primitivos (`components/ui.tsx`)

| Componente | API / variações |
|---|---|
| `Button` | `variant`: primary · secondary · ghost · danger; `size`: default · icon |
| `SearchInput` | input `type=search` com ícone de lupa; `aria-label` obrigatório |
| `Badge` | `tone`: green · amber · red · gray · blue |
| `Spinner` | ícone `LoaderCircle` girando |
| `Avatar` | iniciais (remove "Dr./Dra."); `size`: sm · md · lg; `color` opcional (tinta 20% alpha) |
| `EmptyState` | ícone Inbox + título + descrição + children |
| `PageHeading` | eyebrow (caixa-alta), h1, descrição, slot de ações |
| `Field` | `<label>` com rótulo, controle e hint |
| `Modal` | portal no `body`; `wide`; foco preso, Esc fecha, fundo `inert`, scroll travado, pilha de modais, restauração de foco; densidade "comfortable" forçada |

Outros compartilhados: `DateInput`/`TimeInput` (texto digitável `DD/MM/AAAA`/`HH:MM`, aceita `10112026`/`0930`, valida no blur/Enter, botão de calendário nativo), `ThemeToggle`, `TrendChart` (SVG feito à mão, exportado de `dashboard.tsx`), `AppointmentForm`, `AppointmentDetails`, `BlockForm`, `ProfessionalForm`, `MessageHistory`.

### 5.3 Padrões de UI recorrentes (classes CSS)

`card` / `card-header`, `metric-card` / `metric-grid`, `data-table` / `table-wrap`, `page-stack`, `form-grid` / `form-actions`, `toolbar`, `segmented`, `text-link`, `notice`, `error-banner` / `warning-banner` / `success-banner`, `informative-note`, `timeline`, `availability-chip`, `detail-list`, `mini-stat`, `<details>` para conteúdo secundário (definições, dados do gráfico, versões, histórico).

---

## 6. Estilização atual

### 6.1 Estratégia

- **CSS global com variáveis** é o mecanismo dominante (~3.800 linhas em 7 arquivos), com nomes de classe semânticos (BEM-like sem rigor).
- **Tailwind 4** está instalado e importado, mas usado **apenas pontualmente** como utilitários inline — concentrado em `conversations.tsx` (painel do paciente, estado vazio, banners) e `settings.tsx` (quase toda a tela). `@theme inline` mapeia só `--color-primary` e `--color-muted`; os utilitários usam valores arbitrários do tipo `text-[var(--muted)]`.
- Comentários indicam intenção: `design-system.css` = componentes; `globals.css` = composição de páginas; `tokens.css` referencia `docs/DESIGN_SYSTEM.md` (arquivo inexistente).

### 6.2 Design tokens (`tokens.css`) — fato

**Paleta clara (padrão)** — identidade verde-sálvia, neutros esverdeados, baixa saturação:

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#f4f6f5` | `#101815` | fundo da página |
| `--surface` | `#ffffff` | `#17231d` | cards, topbar, modais |
| `--surface-subtle` / `-muted` / `-hover` / `-active` | `#f8faf9` / `#eef2ef` / `#f0f4f2` / `#eaf3ee` | `#1b2821` / `#24342b` / `#263a2e` / `#253f31` | camadas e estados |
| `--ink` | `#24382f` | `#e4ede7` | texto principal |
| `--muted` / `--subtle` | `#586c5e` / `#607267` | `#adbbb2` / `#a0b2a6` | texto secundário |
| `--border` / `--border-strong` | `#e4eae6` / `#d0dcd4` | `#2c3c32` / `#40574a` | divisórias |
| `--control-border` | `#788c7f` | `#769382` | bordas de inputs |
| `--green` (primária) | `#167654` | `#53bd89` | botões primários, foco, marca |
| `--green-deep` / `--green-active` | `#116144` / `#0c5239` | `#6bcf9d` / `#83d9ad` | hover/pressed |
| `--green-ink` | `#336e50` | `#a0d5b3` | texto em verde |
| `--mint` | `#edf5f0` | `#21382b` | fundos de destaque / sucesso |
| `--accent-line` | `#8eb39c` | `#46795a` | linhas/acentos |
| `--warning-bg/ink/border` | `#faf5e9` / `#87692f` / `#e9dec3` | `#383223` / `#ddc58b` / `#665637` | alerta (âmbar) |
| `--danger-bg/ink/border` | `#fcf0ed` / `#a64940` / `#edd3ce` | `#392824` / `#f2b1a6` / `#68443c` | erro |
| `--info-bg/ink` | `#eef3f4` / `#52717a` | `#24353b` / `#aacbd7` | informativo (azul-acinzentado) |
| `--overlay` | `#101c1666` | `#060d0abc` | fundo de modal |

Tokens semânticos derivados: `--success-*`, `--selection-*`, `--disabled-*`, `--focus-ring` (= verde).

Cores **por profissional** existem nos dados (`#266b53`, `#6f75a8`, `#b7874a`, `#a56b82`), mas só são usadas no avatar dos cards da Equipe — não na agenda.

Logo/favicon: quadrado arredondado `#17805a` com traço de batimento cardíaco branco; wordmark "clin**ia**." em 29 px, peso 650, letter-spacing −1.7 px, ponto final verde.

**Tipografia**
- `font-family: Inter, "Segoe UI", Arial, sans-serif` — **Inter não é carregada** (nenhum `next/font` nem `@font-face`); só aparece se estiver instalada no sistema.
- Escala: `--text-micro 11` · `xs 12` · `sm 13` · `md 14` (corpo) · `lg 16` (h2) · `xl 18` · `title 26` (h1) · `metric 30` px.
- Pesos 400/500/600; h1 com letter-spacing −0.8 px; eyebrow 10 px caixa-alta, tracking 1.1 px.
- Line-height 1.25 / 1.5 / 1.65.

**Espaçamento:** escala de 4 px (`--space-1` 4 … `--space-12` 48).

**Raios:** `--radius-sm 8` · `--radius 12` · `--radius-lg 16` · `--radius-pill 999`.

**Sombras:** muito sutis (`--shadow-sm: 0 1px 3px` com cor quase transparente; `--shadow-dialog` 16/48). Estética essencialmente "flat com bordas".

**Movimento:** 140/180 ms `ease`; existe regra `prefers-reduced-motion`.

**Densidade** (atributo `data-density`): `standard` (body), `compact` (agenda, listas, tabelas), `comfortable` (modais, detalhes). Ajusta altura de controle (32/36/40 px), paddings de painel e células, gaps.

### 6.3 Mapeamento de status → cor (fato)

| Entidade | Status | Tom |
|---|---|---|
| Consulta (`appointmentStatusTones`) | agendada → amber · confirmada → **blue** · realizada → green · falta → red · cancelada → gray |
| Conversa | aguardando → amber · ia → green · humano → blue · encerrada → gray |
| Calendário (cards) | estilo próprio por `status-*`: fundo + borda esquerda colorida, usando verdes/neutros |

### 6.4 Breakpoints em uso

`1700`, `1600`, `1150`, `1100`, `1000`, `900`, `768/767`, `600` px (sem escala única de breakpoints).

### 6.5 Caráter visual atual (avaliação)

**[Observação]** Visual sóbrio, "clínico-calmo": verde institucional, neutros esverdeados, muito branco, bordas finas, sombras mínimas, tipografia pequena (corpo 14 px, muitos textos 11–13 px), alta densidade informacional. Microcopy acolhedora ("Cada conversa, um cuidado.", "Pessoas no centro."). Preocupação forte com acessibilidade e honestidade dos dados ("Sem dados", "Sem base de comparação").

---

## 7. Dados, estado e integrações

### 7.1 Modelo de dados (`lib/types.ts`)

`DemoState` (versão 1) contém: `referenceDate`, `now`, `currentUserId`, `clinic`, `users`, `patients`, `professionals`, `blocks`, `appointments`, `conversations`, `knowledge`, `assistantHistory`, `availabilityHistory`.

Entidades principais:
- **Appointment**: paciente, profissional, especialidade, data, início, duração (15–240 min), `status` (`agendada | confirmada | cancelada | realizada | falta`), `events[]` (auditoria), `cancelReason?`, `notes[]?` (versões).
- **Conversation**: paciente, `status` (`ia | aguardando | humano | encerrada`), `assigneeId`, `reason?`, `sessionId`, `messages[]` (autor `paciente | ia | humano | evento`; `delivery` `pendente | enviada | falha`), `events[]`.
- **Professional**: nome, especialidades[], ativo, cor, disponibilidade semanal (`WeekSlot[]`).
- **Patient**: nome, telefone, convênio, observações administrativas.
- **Block**: profissional, data, início, fim, motivo.
- **Knowledge**: título, categoria, conteúdo, arquivado.

### 7.2 Fluxo de estado

```
localStorage['clinia.demo.v1'] ──(após hidratação, valida com isDemoState)──► DemoProvider (React state)
                                                                                 │ useDemo(): { state, ready, error, act, reset }
componente ── act(Command) ──► fila serializada ──► runCommand(state, cmd)  [180 ms simulados, valida, structuredClone]
                                                    └─► novo estado ──► persist() ──► localStorage + setState
```

- **Fonte única de verdade**: um Context React com o estado inteiro; não há seletores/memoização — toda mutação re-renderiza a árvore que consome `useDemo()`.
- **Estado local** (`useState`) para formulários, busy/erro/sucesso, modais, rascunhos de mensagens.
- **Estado de UI na URL** (ver §3/§4).
- **Mutações disponíveis** (`Command`): `appointment.save|status|note`, `patient.save`, `professional.save`, `clinic.save`, `block.save|delete`, `knowledge.save`, `conversation.claim|return|close|send|receive`, `assistant.add`.
- O serviço revalida todas as regras (não confia na UI desabilitada) e lança `DemoValidationError` com mensagens em PT-BR exibidas diretamente nos banners.
- **Falha simulada**: `failNextRequest()` faz a próxima mutação falhar uma vez.
- Cálculos derivados (métricas, horários livres, disponibilidade efetiva) são recomputados a cada render em `lib/metrics.ts` e `lib/scheduling.ts`.

### 7.3 Dados mockados (`lib/demo-data.ts`)

- Geração **determinística** relativa à data de referência: 65 dias de histórico + 12 dias futuros, consultas de 30 min distribuídas na disponibilidade de cada profissional, status pseudo-aleatórios por aritmética modular.
- 8 conversas-cenário cobrindo todos os status. Âncora do fluxo de demo: **Ana Beatriz Santos**, conversa "aguardando" com pedido de remarcação e consulta às 11h30 do dia.
- 4 orientações na base de conhecimento; 3 bloqueios.

### 7.4 Integrações

**Nenhuma integração externa real.** O README descreve o ponto de troca futuro: substituir a carga/persistência do `DemoProvider` e o despacho de `runCommand` por um adaptador de queries/mutações. Os tipos são declarados "sem contrato definitivo de API".

O **Assistente** (`lib/assistant.ts`) é um classificador por regex com 5 intenções; responde com texto montado a partir do estado e links internos. Não chama LLM.

Outras chaves de `localStorage`: `clinia.theme`.

---

## 8. Dependências e limitações técnicas relevantes para o redesign

1. **Next.js 16 com mudanças incompatíveis** — consultar `node_modules/next/dist/docs/` antes de qualquer alteração estrutural (instrução explícita de `AGENTS.md`).
2. **Tudo é client-side e depende de `localStorage`** — não há SSR de dados; o conteúdo só aparece após a hidratação (tela de loading inicial). Qualquer skeleton/loading state novo deve considerar isso.
3. **Sem biblioteca de componentes** — todos os controles são HTML nativo estilizado (inclusive `<select>`, `<details>`, `<input type=date>` escondido). Um redesign que exija combobox, popover, date picker customizado, tooltip ou drawer precisará implementá-los ou adotar uma biblioteca (decisão a tomar).
4. **Sem biblioteca de gráficos** — gráfico de linhas SVG manual (`TrendChart`) e barras com `div` (detalhe do profissional).
5. **Sem fonte carregada** — Inter declarada, não carregada. Definir tipografia exigirá `next/font` ou equivalente.
6. **Calendário com geometria acoplada ao código** — `pixelsPerMinute = 2` fixo em TSX; larguras mínimas de coluna (236/208 px) e estimativa de largura de nome (`7.5 px/char`) calculadas em `lib/scheduling.ts`; posicionamento absoluto por `top/height/left/width` inline. Mudanças tipográficas/de espaçamento no calendário afetam essa lógica.
7. **Altura de viewport em Conversas** — calculada via JS (`--conversation-viewport-height` com `visualViewport`) e breakpoint `768px` duplicado em JS (`matchMedia`) e CSS.
8. **Testes E2E acoplados ao DOM e ao visual** — usam majoritariamente roles e labels (≈230 `getByRole`, ≈80 `getByLabel`), mas também:
   - classes CSS: `.metric-card`, `.metric-value`, `.calendar-canvas`, `.calendar-scroll`, `.calendar-day-column`, `.home-today-row`, `.conversation-list-item`, `.blocks-panel`, `.availability-panel`, `.team-person-card`, `.assistant-exchange`, `.data-table`, `.app-loading`, etc.;
   - atributos `data-*`: `data-appointment-id`, `data-professional-id`, `data-conflict-id`, `data-pixels-per-minute`, `data-conversation-id`;
   - **valores computados exatos**: fundo do body escuro `rgb(16, 24, 21)`, superfície de modal `rgb(23, 35, 29)`, padding de célula compacta `8px`, padding de modal `24px`, outline de foco `2px solid`, contraste das paletas;
   - textos visíveis e acessíveis (títulos h1, rótulos de botões, `aria-label`s).
   → **Um redesign quebrará testes**; será preciso atualizar os specs junto (ou preservar ganchos `data-*`/roles/labels).
9. **Strings não internacionalizadas** e espalhadas nos componentes — mudanças de microcopy exigem edição em muitos arquivos.
10. **Densidade via atributo** (`data-density`) já integrada a componentes — mecanismo aproveitável.
11. **Persistência versionada** (`version: 1` + validação estrita) — mudar o formato do estado invalida dados salvos (o app cai para base inicial e mostra erro).

---

## 9. Inconsistências identificadas

### 9.1 Arquiteturais / de código

- **Diretório duplicado `Eng_de_Software/`**: cópia byte a byte de `src/` e `tests/` com `.git` próprio (o diretório raiz não é repositório git). Risco de editar a cópia errada. **[Hipótese]** É o export para entrega/repositório da disciplina.
- **Documentação referenciada inexistente**: README e `tokens.css` citam `docs/DESIGN_SYSTEM.md`, `docs/VERIFICACAO.md`, `docs/ETAPAS_REFINAMENTO_UI_UX.md`, `docs/REVISAO_FINAL_UI_UX.md`, `docs/qa/` e `ClinIA_Prompt_Implementacao.md` — `docs/` está vazio.
- **Duas abordagens de estilo misturadas**: CSS semântico na maior parte; Tailwind utilitário com `var(--…)` arbitrário em Conversas (painel do paciente) e em quase toda Configurações.
- **`globals.css` monolítico (2.753 linhas)** com regras do mesmo componente espalhadas (ex.: `.calendar-event.status-*` em ~linha 1880 e ~2610) e **≈40 classes mortas** de uma versão anterior do dashboard (`today-row`, `queue-row`, `dashboard-main-grid`, `ai-insight`, `pending-card`, `outcome-row`, `table-person`, `knowledge-grid`, `settings-grid`, `trend-card`, `profile-details`…).
- **Valores literais fora dos tokens**: ~14 tamanhos de fonte em px (19, 20, 21, 22, 23, 24, 27, 28, 29, 32…) e ~10 raios (3–12 px) não mapeados na escala.
- **Código muito compactado**: vários componentes escritos em linhas únicas extensas (ex.: `app-shell.tsx`, `dashboard.tsx`, `settings.tsx`), dificultando manutenção.
- **Rótulos/tons duplicados**: `appointmentLabels` redefinido em `conversations.tsx`; rótulos de status de conversa repetidos em `conversations.tsx`, `patients.tsx` e `assistant.ts`; `normalize()`/`normalizePhone()`/`ratio()`/`hours()` redefinidos em vários arquivos.
- **Acoplamento entre features**: `dashboard.tsx` importa `AppointmentForm` via reexport de `features/agenda.tsx`; Pacientes e Equipe importam rótulos de `@/features/agenda`.
- **Parâmetros sem UI**: o Início aceita `professional`/`specialty` na URL, mas não oferece controle para eles.
- **Nome da usuária fixo**: "Bom dia, Marina" e "Marina Costa" estão literais no código, não derivados de `state.currentUserId`; a saudação não varia com o horário (coerente apenas porque o relógio é fixo em 10h15).

### 9.2 Visuais / de UX

- **Cor de "confirmada" inconsistente**: azul no mapeamento oficial (Pacientes, Equipe), **verde** no Início e no painel do paciente em Conversas; no modal de detalhes, todo status que não é "realizada" aparece cinza.
- **Cor de "atendimento humano" inconsistente**: azul na lista de Conversas, cinza no card "Conversas" do Início.
- **Rótulo divergente para o mesmo status**: "Agendada" (padrão) × "A confirmar" (Início).
- **Cards de métrica com duas estruturas**: Início/Visão gerencial usam `metric-label`/`metric-value`; detalhes de Equipe usam `<span>/<strong>/<small>` dentro de `.metric-card` — mesma classe, marcação e hierarquia diferentes.
- **Gráficos diferentes para dados equivalentes**: linha SVG (Início/Visão gerencial) × barras horizontais em `div` (detalhe do profissional).
- **Abas com 3 estilos**: segmented control (nav principal, Equipe), abas sublinhadas (sub-nav Gestão), pílulas preenchidas (Configurações).
- **Formato de porcentagem**: uma casa decimal ("12,5%") no Início/Visão gerencial; inteiro ("13%") na Equipe.
- **Escala de breakpoints não padronizada** (8 valores distintos).
- **Cores de profissional** cadastradas mas quase não usadas (não aparecem na agenda, onde seriam mais úteis).
- **Fallbacks de `Suspense`** sem estilo em algumas rotas (`<p>Carregando agenda…</p>`).
- **Tipografia pequena e densa** em muitas áreas (11–13 px em metadados), o que pode afetar legibilidade. **[Observação]**

---

## 10. Elementos e comportamentos que devem ser preservados

### 10.1 Regras de negócio (não pertencem ao visual; vivem em `lib/`)

- Validações de agendamento: horário futuro, dentro da disponibilidade efetiva (clínica ∩ profissional − bloqueios), sem sobreposição para profissional **e** paciente; limites de duração.
- Remarcação mantém paciente e especialidade; troca de profissional só dentro da mesma especialidade.
- Realizada/falta: permitido hoje (qualquer hora) e dias passados; nunca futuro. Estados finais não reabrem.
- Anotações só após "realizada", versionadas e atribuídas.
- Inativar profissional preserva histórico e sinaliza consultas futuras para revisão.
- Telefone duplicado exige confirmação explícita de contato compartilhado.
- Posse de conversa: só quem assumiu responde/devolve/encerra; reenvio idempotente; nova mensagem após encerramento abre nova sessão preservando as anteriores.
- Métricas: definições de previstas, ocupação, taxa de faltas; "Sem dados" quando não há denominador; comparação em p.p. para taxas e "Sem base de comparação" para base zero; disponibilidade histórica preservada.

### 10.2 Fluxos e comportamentos de interface

- **Fluxo âncora da demo**: Conversas → Ana Beatriz → Assumir → Ver cadastro → Remarcar → salvar horário livre → conferir Agenda e Início, com **"Voltar à conversa"** via `context`.
- **Estado na URL** (filtros, seleção, modais) e navegação "voltar" do navegador funcionando.
- **Agenda**: troca automática dia-por-profissional ↔ semana-individual; escala proporcional ao tempo (sem distorção para consultas curtas); consultas simultâneas lado a lado; cabeçalho/eixo fixos e rolagem própria; faixas "Clínica fechada"; consultas fora do expediente nunca somem; horário livre clicável cria agendamento pré-preenchido; indicador de motivo de cancelamento.
- **Fluxo de bloqueio em etapas** com revisão de conflitos e rascunho preservado.
- **Campos de data/hora digitáveis** (`10112026`, `0930`), com formatação ao sair do campo.
- **Feedback**: banners de erro/sucesso com `role="alert"`/`"status"`; botões em estado "Salvando…"; formulário preserva dados após falha.
- **Mensagens**: status de entrega visível, "Tentar novamente", separadores de data/sessão, auto-scroll inteligente + "Últimas mensagens", Enter envia.
- **Confirmações destrutivas** em modal (cancelar consulta, encerrar atendimento, inativar, remover bloqueio, arquivar, restaurar demo).
- **Transparência da demonstração**: avisos de dados fictícios, respostas simuladas, referência de data/hora no rodapé, Ferramentas da demonstração.
- **Tema claro/escuro** sem flash, respeitando preferência do sistema e persistindo escolha.
- **Assistente** global com contexto removível, links e histórico persistente.

### 10.3 Acessibilidade (fortemente testada)

- Skip link, `aria-current`, `aria-sort` em tabelas ordenáveis, `aria-pressed` em toggles, `aria-live` em histórico, `role="log"`, padrão ARIA de tabs com teclado, regiões roláveis focáveis.
- Modal com foco preso, Esc, fundo `inert`, restauração de foco e pilha de modais.
- Foco visível (`outline 2px` na cor primária); contraste verificado em ambos os temas.
- Gráfico com `aria-label` + tabela de dados alternativa; variações com texto para leitores de tela ("Variação favorável/desfavorável").
- `prefers-reduced-motion` respeitado; sem transbordamento horizontal global em 390–1440 px.

### 10.4 Ganchos técnicos usados por testes (preservar ou migrar junto)

Atributos `data-appointment-id`, `data-professional-id`, `data-conversation-id`, `data-conflict-id`, `data-message-id`, `data-pixels-per-minute`, `data-start-minute`, `data-end-minute`, `data-density`, `data-theme`, `data-status`, `data-tone`; `id="main-content"`; e os `aria-label`s/textos de botões.

---

## 11. Resumo para o consultor de UI/UX

- **Produto**: CRM de recepção/gestão de clínica, em PT-BR, com 3 áreas de topo (**Início**, **Conversas**, **Gestão** com 5 sub-áreas) + **Assistente IA** global. Demo local, sem backend.
- **Usuário**: recepção e administração; tarefas de alta frequência (agenda, fila de conversas, confirmações) convivem com análise gerencial.
- **Ponto de partida visual**: verde institucional + neutros esverdeados, flat, denso, tipografia pequena, temas claro/escuro já tokenizados, três densidades.
- **Ativos reaproveitáveis**: tokens bem nomeados (cores semânticas, espaço, tipografia, densidade), primitivos simples, acessibilidade madura, estados vazios/erro já previstos.
- **Dívidas que o redesign pode resolver**: CSS monolítico com código morto, mistura Tailwind/CSS, inconsistências de cor/rótulo de status, três estilos de abas, dois tipos de gráfico, métricas com marcação divergente, fonte não carregada, breakpoints dispersos, cor de profissional subutilizada.
- **Restrições**: Next 16 (breaking changes), tudo client-side, calendário com geometria em código, testes E2E acoplados a classes, `data-*` e valores de cor computados.
