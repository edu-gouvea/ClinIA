# Design system

Como o ClinIA se parece e como manter as telas iguais entre si. Um único sistema: CSS próprio, tokens em variáveis e componentes React compartilhados. Não use classes utilitárias (veja [DECISOES.md](DECISOES.md#1-um-único-sistema-de-estilos-css-próprio-com-tokens)).

## Arquivos de estilo

Importados por `src/app/globals.css`, nesta ordem:

| Arquivo | Conteúdo |
| --- | --- |
| `reset.css` | reset de base (preflight do Tailwind, MIT), em `@layer base` |
| `tokens.css` | cores dos dois temas, tipografia, espaços, raios e densidades |
| `design-system.css` | componentes compartilhados: botão, badge, campo, modal, tabela, abas, chip de filtro |
| `shell.css` | barra lateral, menu móvel, perfil |
| um arquivo por área | `home`, `conversations`, `management`, `team`, `agenda-page`, `patients`, `booking`, `settings` |

Regra: um estilo de componente compartilhado mora em `design-system.css`; o arquivo da área só ajusta layout (altura, distribuição, espaçamento).

## Tokens

- **Cores:** sempre por variável semântica (`--ink`, `--muted`, `--surface`, `--border`, `--success-*`, `--warning-*`, `--danger-*`, `--info-*`, `--ai`). Nenhum hexadecimal fora de `tokens.css` (exceto a cor inicial de um profissional novo, que é dado e não estilo). O tema escuro redefine as mesmas variáveis.
- **Tipografia:** use os atalhos `font: var(--type-caption | --type-body-sm | --type-body | --type-title-sm | --type-title | --type-page | --type-metric)`. Texto mínimo de 12 px; as únicas exceções são decorativas e ocultas de leitores de tela (iniciais do avatar de 24 px e a seta ▲▼ dos indicadores).
- **Espaço:** `--space-1` (4 px) a `--space-12` (48 px).
- **Densidade:** o atributo `data-density` (`compact`, `standard`, `comfortable`) ajusta `--control-height` (28/32/40 px), paddings e gaps. Controles devem herdar `--control-height` em vez de fixar altura.
- **Breakpoints:** 640, 768, 1024, 1280 e 1536 px, definidos em `src/lib/breakpoints.ts` (um teste falha se o CSS divergir).

## Status

`src/lib/status-presentation.ts` é a única fonte de rótulo e tom de cada situação. Consulta: A confirmar (aviso), Confirmada (informação), Realizada (sucesso), Falta (perigo), Cancelada (neutro). Conversa: Aguardando atendente (aviso), Com atendente (informação), Com IA (violeta `--ai`), Encerrada (neutro).

## Componentes

| Componente | Arquivo | Use para |
| --- | --- | --- |
| `Button`, `Badge`, `Field`, `SearchInput`, `Avatar`, `EmptyState`, `PageHeading` | `components/ui.tsx` | primitivos |
| `Modal`, `Drawer`, `Menu`, `Popover` | `components/ui.tsx` | sobreposições com foco preso, Esc e restauração de foco |
| `Tabs` + `tabPanelProps` | `components/tabs.tsx` | toda lista de abas; `underline` para seções de página, `pill` para cabeçalho de painel |
| `FilterChip` | `components/filter-chip.tsx` | filtro de escolha única: tracejado vazio, sólido "Nome: valor" com × quando aplicado (classes `choice-chip-*`) |
| `KpiStrip` | `components/kpi-strip.tsx` | faixa de indicadores (Início, Visão gerencial, Equipe); célula vira link se tiver `href` |
| `StackedBarChart` | `components/stacked-bar-chart.tsx` | consultas por dia; séries em `lib/appointment-chart.ts` |
| `HoursEditor` | `components/hours-editor.tsx` | horários semanais (clínica e profissionais) |
| `ProfessionalAvatar` | `components/professional-avatar.tsx` | a cor do profissional aparece só aqui |
| `useAction` + `Feedback` | `components/use-action.ts`, `feedback.tsx` | ciclo ocupado/erro/sucesso de uma ação; `field` marca o campo inválido |

O chip de filtros ativos da Agenda (`.filter-chip`, formato pílula) é outro componente; o chip de escolha usa `.choice-chip` para não colidir.

## Formatação

`src/lib/format.ts` e `src/lib/date.ts`: `plural`, `formatRate` (uma casa decimal, "Sem dados" sem denominador), `formatDecimal`, `normalizeText`, `normalizePhone`, nomes de meses e dias, `shortPeriod`. Não redefina essas funções numa tela.

## Acessibilidade

Foco visível de 2 px, contraste ≥ 4,5:1 nos dois temas, `aria-sort` em cabeçalhos ordenáveis, tabela alternativa nos gráficos, `prefers-reduced-motion` respeitado e alvos de 44 px abaixo de 768 px. Os testes de navegador verificam esses pontos.
