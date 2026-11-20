# ClinIA — Eng_de_Software

Projeto da disciplina de Engenharia de Software — Professor Glêdson.

CRM administrativo para recepção e gestão de clínicas, com atendimento por IA no WhatsApp. Aplicação navegável em Next.js, React e TypeScript, com CSS próprio baseado em tokens. Todos os dados são fictícios; não é necessário configurar backend, banco de dados ou chaves de API.

O ClinIA é administrativo, não é prontuário: não guarda texto clínico. As decisões de produto e arquitetura estão em [docs/DECISOES.md](docs/DECISOES.md).

## Rodar localmente

Pré-requisito: Node.js 20.9 ou superior; desenvolvimento e verificação realizados com Node.js 24.20.0.

```bash
npm ci
npm run dev
```

Na raiz do repositório. Abra **http://localhost:3000/inicio**. Mantenha o terminal aberto; `Ctrl+C` encerra o servidor.

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

- **Início:** saudação de quem está usando, próximas consultas de hoje, pendências, desempenho por período e insight simulado.
- **Conversas:** abra Ana Beatriz Santos, assuma a conversa e envie uma mensagem. O painel do paciente permite acessar seu cadastro e remarcar a consulta. Outros atendentes têm acompanhamento sem transferência silenciosa.
- **Agenda:** visão geral diária com colunas por profissional e semana individual ao selecionar um médico. Posição e altura proporcionais aos horários reais, consultas simultâneas lado a lado e expediente dinâmico. Filtros, horários livres, bloqueios e ações continuam integrados. As alterações aparecem no paciente, nos indicadores e nas respostas novas do assistente.
- **Visão gerencial:** indicadores da agenda com comparação ao período anterior, desfecho das consultas, **atendimento no WhatsApp** (sessões, resolvidas pela IA, encaminhamentos e tempo até assumir) e atividade por profissional.
- **Equipe:** profissionais (cards ou tabela, filtros e paginação) e atendentes. A atividade de cada profissional usa os mesmos indicadores e gráfico do Início. Inativar preserva histórico e sinaliza consultas futuras para revisão.
- **Pacientes:** busca, filtro de convênio, cadastro, edição e histórico (atividade, consultas e conversas). Contatos com telefone compartilhado exigem confirmação explícita do vínculo.
- **Configurações:** dados da clínica, horários, convênios, especialidades, disponibilidade, bloqueios e base de conhecimento administrativa.
- **Assistente IA:** painel global, inicialmente fechado, com cinco intenções demonstráveis, contexto removível e respostas com links. O histórico acompanha a navegação e o recarregamento.
- **Perfis:** abra o perfil (rodapé da barra lateral) e use **Ver como** para alternar entre a administradora e um atendente. A recepção trabalha em Início, Conversas, Agenda e Pacientes; Visão gerencial, Equipe e Configurações são da administração.

Para testar ponta a ponta: **Conversas → Ana Beatriz → Assumir conversa → Ver cadastro → Remarcar → salvar um horário livre futuro → conferir Agenda e Início**.

## Agenda e aparência

- **Visões:** em “Todos os profissionais”, a agenda mostra um dia com cada médico em sua coluna. Selecionar um profissional abre a semana dele; os botões **Dia/Semana** alternam a visão (a semana exige um profissional). As setas avançam um dia ou uma semana conforme a visão.
- **Bloqueios exibidos:** na visão geral, o painel mostra os bloqueios do dia exibido. Com um médico selecionado, mostra somente os bloqueios dele em toda a semana visível, com a data de cada registro.
- **Disponibilidade:** expanda o nome do médico no painel lateral para consultar e selecionar seus horários. Com um profissional selecionado, o painel dele já aparece aberto.

- **Remarcação:** paciente e especialidade permanecem fixos. A troca de médico é limitada a profissionais ativos da mesma especialidade.
- **Cancelamentos:** os cards indicam quando existe motivo informado. Abra a consulta para ler o texto completo no detalhamento, preservado no histórico.
- **Bloqueios:** ao encontrar consultas no intervalo, o formulário abre uma revisão. Remarque ou cancele cada consulta, volte à revisão e use **Concluir e criar bloqueio** quando o intervalo estiver livre. As alterações nas consultas são salvas individualmente; o bloqueio é salvo na conclusão. Consultas com resultado registrado exigem ajustar o intervalo.
- **Datas e horários:** digite `10112026` ou `10/11/2026`, e `0930` ou `09:30`. O campo aceita a digitação completa e formata ao sair dele ou pressionar Enter. Datas também têm seletor de calendário.
- **Escala compacta:** a agenda usa 120 pixels por hora, sem aumentar a escala quando há consultas curtas. As demais telas compartilham tokens de espaçamento, tipografia, bordas e cores. A grade tem rolagem própria e cabeçalhos fixos.
- **Temas:** use **Tema escuro** na barra lateral. A preferência inicial acompanha o sistema; a escolha manual fica salva e vale para todas as telas, formulários e assistente.

## Persistência e relógio da demonstração

O estado fica em `localStorage`, chave `clinia.demo.v1`, com validação de versão, formato e relações. Na primeira abertura, a base usa a data atual no fuso `America/Recife`, fixando o relógio em **10h15**. Essa referência fica estável ao recarregar. Há dados históricos de 65 dias e agenda futura de 12 dias; as pessoas podem ter várias consultas e sessões.

Para iniciar novamente, use **Gestão → Configurações → Ferramentas da demonstração → Restaurar demonstração** e confirme. Isso substitui apenas a base local desta aplicação e atualiza a data de referência. Consultas de hoje podem ser marcadas como realizadas ou falta em qualquer horário, inclusive antes do início previsto. Dias seguintes ficam bloqueados. Consultas anteriores sem resultado continuam pendentes e podem ser regularizadas. “Hoje” segue a referência estável da demonstração exibida no rodapé.

Ao abrir uma base salva por uma versão anterior, ela é atualizada automaticamente: usuários ganham nível de acesso e anotações de consulta antigas são apagadas do navegador.

Em **Ferramentas da demonstração**, “Testar falha de salvamento” faz a próxima alteração falhar uma vez. O formulário mantém os dados e a nova tentativa pode concluir. No simulador de mensagem recebida da conversa é possível preparar uma falha de envio e verificar a nova tentativa sem duplicação. Ao devolver uma conversa à IA, ela só responde após a próxima mensagem simulada; após encerramento, uma mensagem recebida abre nova sessão preservando as anteriores.

## Organização

| Caminho | Responsabilidade |
| --- | --- |
| `src/app/` | Rotas App Router, layout e estilos (`tokens.css`, `reset.css`, `design-system.css` e um arquivo por área) |
| `src/components/` | Shell, primitivos (`ui.tsx`), abas, chip de filtro, faixa de KPIs, editor de horários, `useAction`/`Feedback` e o provider de dados |
| `src/features/` | Uma pasta ou arquivo por área: início, gestão, conversas, agenda, pacientes, equipe e configurações |
| `src/lib/services.ts` | Domínio: aplica comandos e revalida todas as regras; lança `CommandError` |
| `src/lib/errors.ts` | Contrato de erro (`code`, `field`, mapa para HTTP) |
| `src/lib/permissions.ts` | O que administração e recepção podem fazer |
| `src/lib/data/data-source.ts` | Interface única entre telas e dados |
| `src/lib/demo/` | Tudo o que a demonstração simula: base local, latência, falhas, entrega do WhatsApp e respostas da IA |
| `src/lib/ai-tools.ts` | Rascunho do catálogo de ferramentas dos agentes de IA |
| `src/lib/*-presentation.ts`, `metrics.ts`, `*-analysis.ts` | Consultas e indicadores puros, candidatos a read-models da API |
| `src/lib/date.ts`, `format.ts` | Datas no fuso da clínica e formatação pt-BR, em um só lugar |

Para integrar o back-end, implemente um `DataSource` HTTP e passe-o ao `DemoProvider`; nenhuma tela muda. O contrato (comandos, erros, fuso, papéis e ferramentas da IA) está em [docs/INTEGRACAO.md](docs/INTEGRACAO.md). O guia visual está em [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

## Verificação

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Os testes unitários (`tests/*.test.ts`) cobrem regras de negócio, indicadores, contrato de erro, permissões, fuso, catálogo de ferramentas da IA e apresentação. Para listar os casos individualmente:

```bash
node --import tsx --test --test-isolation=none --test-reporter=spec tests/*.test.ts
```

Os testes de navegador (`tests/e2e/`) usam contextos isolados e não alteram o perfil de navegação do usuário. Se nada responder na porta 3000, o Playwright gera o build de produção e sobe o servidor sozinho; se já houver um servidor, ele é reaproveitado e nunca encerrado:

```bash
npm run test:e2e
```

A configuração aproveita `/usr/bin/google-chrome` quando disponível. Em outra máquina, instale o Chromium de teste com `npx playwright install chromium`, ou informe o executável com `CLINIA_CHROME_PATH`. Para outra porta, use, por exemplo, `CLINIA_BASE_URL=http://localhost:3001 npm run test:e2e`.

As capturas geradas pelos testes ficam em `docs/qa/` (fora do git). A integração contínua (`.github/workflows/frontend.yml`) roda lint, tipos, testes unitários, build e testes de navegador a cada push.

## Versões e limites

Versões fixadas em `package.json` e `package-lock.json`: Next.js **16.4.6**, React **19.3.1**, TypeScript **5.9.3** e Lucide **0.468.0**. O reset de estilos foi mantido do Tailwind (licença MIT) em `src/app/reset.css`; o Tailwind não é mais dependência. Playwright **1.65.0** é usado apenas nos testes.

Persistência, identidade, mensagens de WhatsApp e IA operam como **demonstração local**. Não há login real (a troca de perfil substitui o login), integração com WhatsApp, envio externo, LLM, sincronização entre dispositivos ou backend. O assistente consulta e sugere; ele não executa alterações. A demonstração é destinada a uma aba ativa por vez; concorrência entre sessões dependerá da integração futura. O ClinIA não registra conteúdo clínico. Gestão financeira e autorização por médico dependem de integração futura. Nenhum dado real de paciente foi utilizado.

## Banco PostgreSQL — proposta do integrante 5

Estrutura, dados fictícios, testes de integridade/concorrência e instruções locais em [database/README.md](database/README.md). A aplicação continua usando a demonstração local; a conexão à API depende da integração com o backend.
