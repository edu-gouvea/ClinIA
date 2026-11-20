# Decisões de produto e arquitetura

Registro das decisões tomadas após a auditoria de novembro de 2026. Cada uma diz o que foi decidido, por quê e o que muda para o grupo. As decisões 2 e 3 afetam o trabalho de outros integrantes e devem ser confirmadas com eles.

## 1. Um único sistema de estilos: CSS próprio com tokens

**Decisão.** O Tailwind foi removido. Todo estilo usa as classes do projeto e os tokens de `src/app/tokens.css`.

**Por quê.** Só a tela de Configurações usava utilitários, e parte deles não funcionava: o Tailwind 4 coloca os utilitários em `@layer utilities`, e o CSS do projeto, sem camada, sempre vence (`className="card p-6"` ignorava o `p-6`). Dois sistemas de estilo significam duas formas de fazer a mesma coisa e telas que não se parecem.

**Consequências.**
- O reset (preflight) do Tailwind foi mantido em `src/app/reset.css`, na mesma camada `base`, para que nada mudasse visualmente. Licença MIT, com atribuição no arquivo.
- Configurações e Equipe foram reescritas com os componentes compartilhados (abas, chip de filtro, faixa de KPIs, editor de horários).
- Código novo não usa classes utilitárias. O guia está em [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## 2. O ClinIA não guarda texto clínico

**Decisão.** As anotações de consulta foram retiradas do produto: o tipo `ConsultationNote`, o comando `appointment.note`, a seção no detalhe da consulta e a aba "Anotações" do paciente. Fica apenas a observação administrativa do paciente (`Patient.notes` → `patients.administrative_notes`).

**Por quê.**
- O ClinIA é um CRM de recepção, não um prontuário. As anotações eram texto livre, versionado e atribuído ao profissional, mas salvo pela administradora: dado sensível de saúde registrado por quem não o escreveu.
- O banco aprovado já decidiu o mesmo: `docs/banco/decisoes-e-integracao.md` declara anotações clínicas fora do escopo e não há tabela para elas.
- A IA lê o mesmo estado que as telas. Texto clínico ali seria um vazamento esperando acontecer.

**Consequências.**
- Bases salvas por versões anteriores têm as anotações apagadas do navegador ao abrir (`upgradeStoredState`).
- Se a recepção precisar registrar algo depois da consulta, o caminho é um campo estruturado e não clínico (por exemplo, "retorno em X dias"), que a IA pode usar para reagendar.

## 3. O back-end é dono do contrato das ferramentas da IA

**Decisão.** As ferramentas que os agentes de IA chamam são os mesmos serviços que as telas usam, com as mesmas regras. Não há endpoint exclusivo da IA.

| Quem | Papel |
| --- | --- |
| Front-end | Propõe o rascunho: `src/lib/ai-tools.ts`, ligado aos comandos de domínio reais e verificado por testes |
| Back-end | Publica o contrato final e aplica as regras e permissões no servidor |
| Integrante de IA | Escolhe o subconjunto de ferramentas, os prompts e as políticas de encaminhamento |

**Escopos.**
- **Agente do paciente (WhatsApp):** lê horários livres, a base de conhecimento e as próprias consultas; escreve **somente nas consultas do próprio paciente** (agendar, remarcar, confirmar, cancelar) e responde ou encaminha a conversa (`conversation.ai_reply`). O `patientId` vem da identidade do WhatsApp, nunca do modelo.
- **Assistente interno:** só lê. Pode propor um comando, que só roda depois que a pessoa confirma na tela.
- Cadastro da clínica, equipe, base de conhecimento, bloqueios e posse de conversas são exclusivos de pessoas (`humanOnlyCommands`).

**Consequências.** Os testes em `tests/ai-and-service.test.ts` garantem que todo comando é de uma ferramenta ou exclusivo de pessoas (nunca dos dois) e que os escopos acima valem. Um comando novo que não seja classificado quebra o typecheck.
