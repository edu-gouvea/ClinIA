# ClinIA — Eng_de_Software

Projeto da disciplina de Engenharia de Software — Professor Glêdson.

Aplicação navegável em Next.js, React, TypeScript e Tailwind, implementada conforme `ClinIA_Prompt_Implementacao.md`. Todos os dados são fictícios; não é necessário configurar backend, banco de dados ou chaves de API.

## Rodar localmente

Pré-requisito: Node.js 20.9 ou superior; desenvolvimento e verificação realizados com Node.js 24.20.0.

```bash
cd /home/user/Documentos/ClinIA
npm ci
npm run dev
```

Abra **http://localhost:3000/inicio**. As dependências já estão instaladas neste workspace, então `npm ci` é opcional para a primeira execução aqui. Mantenha o terminal aberto; `Ctrl+C` encerra o servidor.

Se a porta 3000 estiver ocupada:

```bash
npm run dev -- --port 3001
```

Nesse caso, acesse **http://localhost:3001/inicio**. Use sempre o mesmo endereço e porta para acessar os mesmos dados locais: `localhost`, `127.0.0.1` e portas distintas têm armazenamentos separados.

Para executar a versão de produção local:

```bash
npm run build
npm start
```

## Explorar os fluxos

- **Início:** indicadores por período, evolução, fila atual, próximos horários de hoje, pendências e observação simulada.
- **Conversas:** abra Ana Beatriz Santos, assuma a conversa e envie uma mensagem. O painel do paciente permite acessar seu cadastro e remarcar a consulta. Outros atendentes têm acompanhamento sem transferência silenciosa.
- **Agenda:** visão geral diária com colunas por profissional e semana individual ao selecionar um médico. Posição e altura proporcionais aos horários reais, consultas simultâneas lado a lado e expediente dinâmico. Filtros, horários livres, bloqueios e ações continuam integrados. As alterações aparecem no paciente, nos indicadores e nas respostas novas do assistente.
- **Equipe:** profissionais, disponibilidade, atividade individual e atendentes. Inativar preserva histórico e sinaliza consultas futuras para revisão.
- **Pacientes:** busca, cadastro, edição e histórico. Contatos com telefone compartilhado exigem confirmação explícita do vínculo.
- **Configurações:** dados da clínica, horários, convênios, especialidades, disponibilidade, bloqueios e base de conhecimento administrativa.
- **Assistente IA:** painel global, inicialmente fechado, com cinco intenções demonstráveis, contexto removível e respostas com links. O histórico acompanha a navegação e o recarregamento.

Para testar ponta a ponta: **Conversas → Ana Beatriz → Assumir conversa → Ver cadastro → Remarcar → salvar um horário livre futuro → conferir Agenda e Início**.

## Agenda e aparência

- **Visões:** em “Todos os profissionais”, a agenda mostra um dia com cada médico em sua coluna. Clique no nome do médico ou selecione-o no filtro para abrir sua semana. A visualização é automática, sem botões Dia/Semana. Todos os profissionais mostram o dia; um médico específico mostra sempre a semana. As setas avançam um dia ou uma semana conforme o filtro.
- **Bloqueios exibidos:** na visão geral, o painel mostra os bloqueios do dia exibido. Com um médico selecionado, mostra somente os bloqueios dele em toda a semana visível, com a data de cada registro.
- **Disponibilidade:** expanda o nome do médico no painel lateral para consultar e selecionar seus horários. Com um profissional selecionado, o painel dele já aparece aberto.

- **Remarcação:** paciente e especialidade permanecem fixos. A troca de médico é limitada a profissionais ativos da mesma especialidade.
- **Cancelamentos:** os cards indicam quando existe motivo informado. Abra a consulta para ler o texto completo no detalhamento, preservado no histórico.
- **Bloqueios:** ao encontrar consultas no intervalo, o formulário abre uma revisão. Remarque ou cancele cada consulta, volte à revisão e use **Concluir e criar bloqueio** quando o intervalo estiver livre. As alterações nas consultas são salvas individualmente; o bloqueio é salvo na conclusão. Consultas com resultado registrado exigem ajustar o intervalo.
- **Anotações:** abra uma consulta realizada, preencha **Anotações da consulta** e salve. As versões anteriores permanecem disponíveis. O histórico do paciente também oferece acesso direto. Na demonstração, o registro fica vinculado ao profissional da consulta e identifica a administradora que o salvou.
- **Datas e horários:** digite `10112026` ou `10/11/2026`, e `0930` ou `09:30`. O campo aceita a digitação completa e formata ao sair dele ou pressionar Enter. Datas também têm seletor de calendário.
- **Escala compacta:** a agenda usa 120 pixels por hora, sem aumentar a escala quando há consultas curtas. As demais telas compartilham tokens de espaçamento, tipografia, bordas e cores. A grade tem rolagem própria e cabeçalhos fixos.
- **Temas:** use o botão de lua/sol no topo. A preferência inicial acompanha o sistema; a escolha manual fica salva e vale para todas as telas, formulários e assistente.

## Persistência e relógio da demonstração

O estado fica em `localStorage`, chave `clinia.demo.v1`, com validação de versão, formato e relações. Na primeira abertura, a base usa a data atual no fuso `America/Recife`, fixando o relógio em **10h15**. Essa referência fica estável ao recarregar. Há dados históricos de 65 dias e agenda futura de 12 dias; as pessoas podem ter várias consultas e sessões.

Para iniciar novamente, use **Gestão → Configurações → Ferramentas da demonstração → Restaurar demonstração** e confirme. Isso substitui apenas a base local desta aplicação e atualiza a data de referência. Consultas de hoje podem ser marcadas como realizadas ou falta em qualquer horário, inclusive antes do início previsto. Dias seguintes ficam bloqueados. Consultas anteriores sem resultado continuam pendentes e podem ser regularizadas. “Hoje” segue a referência estável da demonstração exibida no rodapé.

Em **Ferramentas da demonstração**, “Testar falha de salvamento” faz a próxima alteração falhar uma vez. O formulário mantém os dados e a nova tentativa pode concluir. No simulador de mensagem recebida da conversa é possível preparar uma falha de envio e verificar a nova tentativa sem duplicação. Ao devolver uma conversa à IA, ela só responde após a próxima mensagem simulada; após encerramento, uma mensagem recebida abre nova sessão preservando as anteriores.

## Organização e integração futura

| Caminho | Responsabilidade |
| --- | --- |
| `src/app/` | Rotas App Router, layout, estilos e estados de erro |
| `src/app/tokens.css` | Cores dos temas, tipografia, espaços e três níveis de densidade |
| `src/app/design-system.css` | Estilos dos componentes compartilhados |
| `src/features/` | Início/gestão, conversas, agenda, pacientes, equipe e configurações |
| `src/components/ui.tsx` | Botões, busca, campos, modais com gestão de foco, estados e avatares |
| `src/components/demo-provider.tsx` | Leitura do estado local após hidratação, serialização de alterações e persistência |
| `src/lib/services.ts` | Comandos assíncronos simulados, validações e eventos |
| `src/lib/metrics.ts` | Indicadores, disponibilidade efetiva e horários livres |
| `src/lib/demo-data.ts` | Base fictícia determinística |
| `src/lib/state-validation.ts` | Validação dos dados persistidos |
| `src/lib/assistant.ts` | Cinco intenções locais e contexto das respostas |
| `src/lib/types.ts` | Tipos da demonstração, sem contrato definitivo de API |

Para integrar a aplicação real, substitua a carga/persistência do provider e o despacho de `runCommand` por um adaptador de consultas/mutações da equipe. Preserve os componentes por funcionalidade e extraia os tipos conforme o contrato efetivamente acordado. Validações, identidade, autorização e concorrência deverão ser garantidas pelo servidor; as verificações locais servem à demonstração e à experiência de formulário. Não há endpoints, SQL ou autenticação de produção definidos nesta entrega.

## Verificação

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Os 49 testes de regras, apresentação e assistente estão em `tests/core.test.ts`, `tests/scheduling.test.ts`, `tests/conversations.test.ts`, `tests/metric-comparison.test.ts`, `tests/management.test.ts`, `tests/team.test.ts` e `tests/assistant.test.ts`. O runner pode resumir por arquivo conforme a versão do Node. No Node 22.8 ou superior, para listar os casos individualmente:

```bash
node --import tsx --test --test-isolation=none --test-reporter=spec tests/*.test.ts
```

Os testes de navegador usam contextos isolados e não alteram o perfil de navegação do usuário. Com o servidor iniciado, execute em outro terminal:

```bash
npm run test:e2e
```

A configuração aproveita `/usr/bin/google-chrome` quando disponível. Em outra máquina, instale o Chromium de teste com `npx playwright install chromium`, ou informe o executável com `CLINIA_CHROME_PATH`. Para outra porta, use, por exemplo, `CLINIA_BASE_URL=http://localhost:3001 npm run test:e2e`.

Consulte `docs/VERIFICACAO.md` para o registro do que foi realmente verificado e `docs/qa/` para capturas da interface.

O guia de estilos está em [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md). O andamento das próximas implementações está em [docs/ETAPAS_REFINAMENTO_UI_UX.md](docs/ETAPAS_REFINAMENTO_UI_UX.md).

A matriz de responsividade, acessibilidade e os limites da validação estão em [docs/REVISAO_FINAL_UI_UX.md](docs/REVISAO_FINAL_UI_UX.md).

## Versões e limites

Versões fixadas em `package.json` e `package-lock.json`: Next.js **16.4.6**, React **19.3.1**, TypeScript **5.9.3**, Tailwind **4.3.5** e Lucide **0.468.0**. Playwright **1.65.0** é usado apenas nos testes.

Persistência, identidade administrativa, mensagens de WhatsApp e IA operam como **demonstração local**. Não há login real, integração com WhatsApp, envio externo, LLM, sincronização entre dispositivos ou backend. O assistente consulta e sugere; ele não executa alterações. A demonstração é destinada a uma aba ativa por vez; concorrência entre sessões dependerá da integração futura. As anotações de consulta são locais e fictícias. Prontuário completo, gestão financeira e autorização por médico dependem de integração futura. Nenhum dado real de paciente foi utilizado.

## Banco PostgreSQL — proposta do integrante 5

Estrutura, dados fictícios, testes de integridade/concorrência e instruções locais em [database/README.md](database/README.md). A aplicação continua usando a demonstração local; a conexão à API depende da integração com o backend.
