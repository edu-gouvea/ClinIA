# Integração com o back-end

O que o front-end espera da API e onde trocar a demonstração pelo serviço real. Complementa a proposta de banco em [banco/decisoes-e-integracao.md](banco/decisoes-e-integracao.md).

## Ponto de troca: `DataSource`

As telas leem e alteram dados por um único objeto, a interface `DataSource` (`src/lib/data/data-source.ts`). O `DemoProvider` recebe a implementação por propriedade; hoje é `localDemoSource` (`src/lib/demo/local-source.ts`).

```ts
interface DataSource {
  load(): Promise<{ state: DemoState; warning?: string }>;
  execute(state: DemoState, command: Command): Promise<DemoState>;
  reset?(): Promise<DemoState>;                         // só demonstração
  switchUser?(state: DemoState, userId: string): Promise<DemoState>; // só demonstração
}
```

Para integrar, escreva um `HttpDataSource` que:
1. em `load`, busca o snapshot inicial da clínica do usuário autenticado;
2. em `execute`, envia o comando, devolve o estado resultante do servidor (nunca um palpite otimista) e, em caso de erro, rejeita com `commandErrorFrom(body)`;
3. não implementa `reset` nem `switchUser` (a identidade vem do login).

O provider já serializa os comandos de um cliente e trata `field: 'storage'` como falha global.

**Limite atual.** As telas ainda recebem o snapshot inteiro e calculam filtros e indicadores no cliente. Isso funciona para uma clínica pequena; para volumes reais, as funções puras de `src/lib/*-presentation.ts`, `metrics.ts`, `management-analysis.ts`, `service-analysis.ts` e `attendance-metrics.ts` são os candidatos naturais a read-models da API (mesma entrada e saída, executadas no servidor). Esse é o próximo passo, tela a tela.

## Comandos

União `Command` em `src/lib/types.ts`. Cada um corresponde a uma transação no servidor.

| Comando | Quem | Observação |
| --- | --- | --- |
| `appointment.save` | recepção, agente do paciente | criar ou remarcar; mesma especialidade e paciente na remarcação |
| `appointment.status` | recepção, agente do paciente | confirmar, cancelar; realizada/falta só hoje ou antes |
| `patient.save` | recepção | telefone compartilhado exige `allowSharedPhone` |
| `professional.save` | administração | inclui ativar/inativar |
| `clinic.save` | administração | o fuso não muda por aqui |
| `block.save`, `block.delete` | recepção | bloqueio recusado se houver consultas no intervalo |
| `knowledge.save` | administração | inclui arquivar |
| `conversation.claim`, `.return`, `.close` | recepção | só quem assumiu responde, devolve ou encerra |
| `conversation.send` | recepção | idempotente por `messageId`; cria a mensagem como `pendente` |
| `conversation.delivery` | provedor do WhatsApp (webhook) | `enviada` ou `falha`; relatório tardio nunca desfaz uma entrega |
| `conversation.receive` | provedor do WhatsApp (webhook) | após encerramento, abre nova sessão |
| `conversation.ai_reply` | agente do paciente | com `handoff`, encaminha à recepção com o motivo |
| `assistant.add` | assistente interno | histórico local; pode continuar no navegador |

`Message.attempts` conta as tentativas de envio (outbox). A proposta do banco já tem `idempotency_key` e `external_id` para isso.

## Contrato de erro

`src/lib/errors.ts`. A API responde `{ code, message, field? }`; o adaptador reconstrói o `CommandError` com `commandErrorFrom`.

| `code` | HTTP | Significado | Exemplo |
| --- | --- | --- | --- |
| `validation` | 422 | entrada viola uma regra | telefone com 9 dígitos (`field: 'phone'`) |
| `not_found` | 404 | registro não existe | consulta removida |
| `conflict` | 409 | horário ou registro ocupado | sobreposição na agenda (`field: 'start'`); `23P01` do PostgreSQL |
| `forbidden` | 403 | ação pertence a outra pessoa ou perfil | conversa de outro atendente; recepção salvando a clínica |
| `invalid_state` | 409 | transição não permitida | cancelar consulta já realizada |
| `unavailable` | 503 | falha temporária; repetir funciona | rede, banco indisponível |

`message` é texto final em pt-BR para a pessoa. `field` permite marcar o campo com `aria-invalid` (veja o cadastro de paciente).

## Datas, horários e fuso

- Os dados guardam **data e hora de parede** no fuso da clínica (`date: 'AAAA-MM-DD'`, `start: 'HH:MM'`). O servidor converte para `starts_at`/`ends_at` (`timestamptz`) com o fuso de `clinics.timezone`.
- `dateTime(date, time, zone)` em `src/lib/date.ts` calcula o deslocamento correto para a data (inclusive horário de verão). O fuso ativo é definido quando a clínica carrega.
- O fuso é definido na implantação da clínica: `clinic.save` recusa mudança, porque alterá-lo moveria toda a agenda.
- "Agora" vem do estado (`state.now`). Na demonstração ele fica fixo; o adaptador real deve preenchê-lo com o relógio do servidor a cada carga.

## Identidade e permissões

- `DemoUser.access` é `'admin' | 'attendant'`, o mesmo enum de `users.role` no banco. `role` é o cargo exibido.
- A tabela de permissões está em `src/lib/permissions.ts` e é aplicada em dois lugares: no domínio (`forbidden`) e na interface (navegação e guarda de rota). O servidor deve aplicar a mesma tabela; a interface só esconde o que falharia.

| Área | Administração | Recepção |
| --- | --- | --- |
| Início, Conversas, Agenda, Pacientes | sim | sim |
| Visão gerencial | sim | não |
| Equipe | sim | não |
| Configurações | sim | não |

## Ferramentas da IA

Rascunho em `src/lib/ai-tools.ts`; decisões e escopos em [DECISOES.md](DECISOES.md#3-o-back-end-é-dono-do-contrato-das-ferramentas-da-ia). Cada ferramenta de escrita aponta para um comando acima; o servidor preenche o escopo (por exemplo, o `patientId` do agente do paciente), nunca o modelo.

## Pendências para alinhar com o grupo

- Formato JSON do snapshot e dos read-models por tela.
- Provedor de autenticação e como `currentUserId` chega ao front.
- Tempo real nas conversas (assinatura ou polling) e concorrência entre atendentes.
- Retenção e LGPD das mensagens do WhatsApp.
