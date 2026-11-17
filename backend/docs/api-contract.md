# Contrato da API — ClinIA Backend

Versão: `v1` · Prefixo: `/api/v1`

---

## Convenção de nomes

O CRM usa **camelCase** em todos os tipos TypeScript e mocks (ex.: `patientId`, `cancelReason`, `assigneeId`). A API segue a mesma convenção para garantir compatibilidade sem transformação no frontend.

Implementação Pydantic:
```python
from pydantic import ConfigDict, alias_generator
from pydantic.alias_generators import to_camel

class APISchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,   # aceita snake_case internamente
    )
```

Campos internos do banco (snake_case) → respostas da API (camelCase).

---

## Comportamento padrão — recursos com `is_active`

- Listagens retornam **somente registros ativos** por padrão.
- `?includeInactive=true` habilita a visão administrativa (retorna ativos e inativos).
- Endpoints do agente e `/slots` nunca aceitam `includeInactive`.
- `POST` para recursos únicos por nome: se o nome já existe mas está inativo, retorna `409 CONFLICT` com `{ "error": { "code": "CONFLICT", "message": "...", "details": { "existingId": "uuid" } } }` para o CRM oferecer reativação.

---

## Paginação

Todos os endpoints de listagem retornam:

```json
{
  "items": [...],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

Query params de paginação: `page` (default 1) e `pageSize` (default 20, máx 100).

---

## Erros

Sempre no formato:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Recurso não encontrado.",
    "details": null
  }
}
```

Códigos: `NOT_FOUND` (404), `CONFLICT` (409), `FORBIDDEN` (403), `BUSINESS_RULE_VIOLATION` (422), `VALIDATION_ERROR` (422), `UNAUTHORIZED` (401), `INTERNAL_ERROR` (500).

---

## Status mapeados (CRM → API)

| CRM | API |
|-----|-----|
| `agendada` | `pending` |
| `confirmada` | `confirmed` |
| `cancelada` | `cancelled` |
| `realizada` | `completed` |
| `falta` | `no_show` |
| `ia` | `bot` |
| `aguardando` | `waiting_human` |
| `humano` | `human` |
| `encerrada` | `closed` |
| `archived: true` | `isActive: false` |

---

## Autenticação

### POST /auth/login

Acesso: público.

**Body:**
```json
{ "email": "marina@cliniaflorescer.com", "password": "s3cr3t" }
```

**200:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 1800,
  "user": {
    "id": "uuid",
    "name": "Marina Costa",
    "email": "marina@cliniaflorescer.com",
    "role": "admin",
    "clinicId": "uuid"
  }
}
```

**Erros:** `401 UNAUTHORIZED` (credenciais inválidas), `403 FORBIDDEN` (usuário inativo).

---

### POST /auth/refresh

Acesso: público (token de refresh no body).

**Body:** `{ "refreshToken": "eyJ..." }`

**200:** mesmo formato de `/auth/login`.

**Erros:** `401 UNAUTHORIZED` (token expirado ou inválido).

---

### GET /auth/me

Acesso: qualquer usuário autenticado.

**200:**
```json
{
  "id": "uuid",
  "name": "Marina Costa",
  "email": "marina@cliniaflorescer.com",
  "role": "admin",
  "clinicId": "uuid",
  "isActive": true,
  "lastLoginAt": "2026-11-17T10:15:00Z"
}
```

---

## Clínicas

### GET /clinics

Acesso: `superadmin`.

**200:** lista paginada de clínicas.

---

### POST /clinics

Acesso: `superadmin`.

**Body:**
```json
{
  "name": "Clínica Florescer",
  "slug": "florescer",
  "timezone": "America/Recife",
  "address": "Rua das Acácias, 120 · Boa Vista, Recife",
  "phone": "(81) 3000-0100",
  "whatsappPhoneNumberId": null
}
```

**201:** objeto da clínica criada.

---

### GET /clinics/me

Acesso: `admin`, `attendant`, `professional`.

**200:**
```json
{
  "id": "uuid",
  "name": "Clínica Florescer",
  "slug": "florescer",
  "timezone": "America/Recife",
  "address": "...",
  "phone": "(81) 3000-0100",
  "isActive": true,
  "settings": {
    "minBookingNoticeHours": 2,
    "minCancelNoticeHours": 24,
    "bookingWindowDays": 30,
    "privacyNoticeText": "...",
    "handoffMessageText": "...",
    "clinicHours": [
      { "day": 1, "start": "08:00", "end": "18:00" },
      { "day": 6, "start": "08:00", "end": "14:00" }
    ]
  }
}
```

---

### PATCH /clinics/me

Acesso: `admin`.

Aceita parcial (somente campos enviados são atualizados). Campos permitidos: `name`, `address`, `phone`, `settings`.

**200:** clínica atualizada.

**Erros:** `422 BUSINESS_RULE_VIOLATION` se `clinicHours` deixar consultas futuras fora do expediente (retorna lista de conflitos em `details`).

---

## Usuários

### GET /users

Acesso: `admin`.

**Query:** `q` (busca por nome/email), `role`, `isActive`, `page`, `pageSize`.

**200:** lista paginada com campos: `id`, `name`, `email`, `role`, `isActive`, `lastLoginAt`.

---

### POST /users

Acesso: `admin`.

**Body:**
```json
{
  "name": "Rafael Melo",
  "email": "rafael@cliniaflorescer.com",
  "password": "...",
  "role": "attendant"
}
```

**201:** usuário criado (sem `passwordHash`).

---

### GET /users/{id}

Acesso: `admin` ou o próprio usuário.

**200:** objeto completo do usuário.

**Erros:** `404`.

---

### PATCH /users/{id}

Acesso: `admin` ou o próprio usuário (somente campos permitidos ao perfil).

**Erros:** `404`, `409 CONFLICT` (email duplicado).

---

### DELETE /users/{id}

Acesso: `admin`. **Desativa** o usuário (não remove do banco).

**204.**

---

## Especialidades

### GET /specialties

Acesso: `admin`, `attendant`, `professional`.

**Query:** `isActive` (default true).

**200:**
```json
{
  "items": [
    { "id": "uuid", "name": "Cardiologia", "description": null, "isActive": true }
  ],
  "total": 4, "page": 1, "pageSize": 20
}
```

---

### POST /specialties

Acesso: `admin`.

**Body:** `{ "name": "Cardiologia", "description": null }`

**201.** Erros: `409 CONFLICT` (nome duplicado na clínica).

---

### GET /specialties/{id}

Acesso: `admin`, `attendant`.

---

### PATCH /specialties/{id}

Acesso: `admin`.

---

### DELETE /specialties/{id}

Acesso: `admin`. Desativa. Erros: `422 BUSINESS_RULE_VIOLATION` se houver profissionais ou agendamentos ativos vinculados.

---

## Convênios

### GET /insurances

Acesso: `admin`, `attendant`.

**Query:** `isActive`.

---

### POST /insurances

Acesso: `admin`. **Body:** `{ "name": "Viva Saúde" }`. Erros: `409` (nome duplicado).

---

### GET /insurances/{id}

Acesso: `admin`, `attendant`.

---

### PATCH /insurances/{id}

Acesso: `admin`.

---

### DELETE /insurances/{id}

Acesso: `admin`. Desativa. Erros: `422` se houver agendamentos ativos vinculados.

---

## Profissionais

### GET /professionals

Acesso: `admin`, `attendant`.

**Query:** `q`, `specialtyId`, `isActive`, `page`, `pageSize`.

**200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Dra. Clara Mendes",
      "specialties": [{ "id": "uuid", "name": "Cardiologia" }],
      "appointmentDurationMinutes": 30,
      "color": "#266b53",
      "isActive": true,
      "userId": null
    }
  ],
  "total": 4, "page": 1, "pageSize": 20
}
```

---

### POST /professionals

Acesso: `admin`.

**Body:**
```json
{
  "name": "Dra. Clara Mendes",
  "registrationNumber": "CRM-PE 12345",
  "bio": null,
  "appointmentDurationMinutes": 30,
  "color": "#266b53",
  "userId": null,
  "specialtyIds": ["uuid"]
}
```

**201.**

---

### GET /professionals/{id}

Acesso: `admin`, `attendant`.

---

### PATCH /professionals/{id}

Acesso: `admin`.

---

### DELETE /professionals/{id}

Acesso: `admin`. Desativa. Erros: `422` se tiver consultas futuras (`details.conflictCount`).

---

### PUT /professionals/{id}/specialties

Acesso: `admin`. Substitui todas as especialidades.

**Body:** `{ "specialtyIds": ["uuid1", "uuid2"] }`

**200:** profissional com especialidades atualizadas.

---

## Disponibilidade

### GET /professionals/{id}/availability-rules

Acesso: `admin`, `attendant`.

**200:**
```json
{
  "items": [
    { "id": "uuid", "weekday": 1, "startTime": "08:00", "endTime": "18:00", "isActive": true }
  ]
}
```

---

### PUT /professionals/{id}/availability-rules

Acesso: `admin`. Substitui a semana inteira.

**Body:**
```json
{
  "rules": [
    { "weekday": 1, "startTime": "08:00", "endTime": "12:00" },
    { "weekday": 1, "startTime": "13:00", "endTime": "17:00" }
  ]
}
```

**200.** Erros: `422 BUSINESS_RULE_VIOLATION` se sobreposição de horários, ou se consultas futuras ficarem fora da disponibilidade (retorna `details.conflicts`).

---

### GET /availability-blocks

Acesso: `admin`, `attendant`.

**Query:** `professionalId`, `from` (data), `to` (data).

**200:** lista de bloqueios.

---

### POST /availability-blocks

Acesso: `admin`.

**Body:**
```json
{
  "professionalId": "uuid",
  "startsAt": "2026-11-20T14:00:00Z",
  "endsAt": "2026-11-20T15:00:00Z",
  "reason": "Reunião de equipe"
}
```

**201.** `professionalId: null` = bloqueia toda a clínica.

---

### DELETE /availability-blocks/{id}

Acesso: `admin`. **204.**

---

## Horários livres

### GET /slots

Acesso: `admin`, `attendant`, `professional`, `agent` (via serviço interno).

**Query:** `professionalId` ou `specialtyId` (um obrigatório), `dateFrom`, `dateTo`, `durationMinutes` (default: duração do profissional), `patientId` (exclui conflito do mesmo paciente).

**200:**
```json
{
  "slots": [
    {
      "professionalId": "uuid",
      "professionalName": "Dra. Clara Mendes",
      "date": "2026-11-20",
      "start": "09:00",
      "end": "09:30"
    }
  ]
}
```

---

## Pacientes

### GET /patients

Acesso: `admin`, `attendant`.

**Query:** `q` (nome ou telefone), `insuranceId`, `page`, `pageSize`, `sort` (`name`|`createdAt`), `order`.

**200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Ana Beatriz Santos",
      "phone": "+5581900000101",
      "insurance": { "id": "uuid", "name": "Viva Saúde" },
      "notes": "Prefere contato no período da manhã.",
      "createdAt": "2026-11-01T09:00:00Z"
    }
  ],
  "total": 24, "page": 1, "pageSize": 20
}
```

---

### POST /patients

Acesso: `admin`, `attendant`.

**Body:**
```json
{
  "name": "Ana Beatriz Santos",
  "phone": "+5581900000101",
  "insuranceId": "uuid",
  "notes": "",
  "allowSharedPhone": false
}
```

**201.** Erros: `409 CONFLICT` se telefone já existe e `allowSharedPhone: false`.

---

### GET /patients/{id}

Acesso: `admin`, `attendant`.

**200:** objeto completo com `birthDate`, `email`, `notes`, `privacyNoticeSentAt`, `anonymizedAt`.

---

### PATCH /patients/{id}

Acesso: `admin`, `attendant`.

**Erros:** `409` (telefone duplicado sem `allowSharedPhone`).

---

### GET /patients/{id}/appointments

Acesso: `admin`, `attendant`.

**Query:** `page`, `pageSize`, `status`.

**200:** lista paginada de agendamentos do paciente.

---

### GET /patients/{id}/export

Acesso: `admin`. Retorna JSON com todos os dados não anonimizados do paciente (LGPD art. 18).

**200:** objeto com dados do paciente, agendamentos e conversas (sem conteúdo de mensagens).

---

### POST /patients/{id}/anonymize

Acesso: `admin`. Apaga dados pessoais, preserva IDs e datas para estatísticas.

**204.** Erros: `409 CONFLICT` se paciente tem agendamentos futuros em aberto.

---

## Agendamentos

### GET /appointments

Acesso: `admin`, `attendant`.

**Query:** `professionalId`, `specialtyId`, `patientId`, `status`, `source`, `dateFrom`, `dateTo`, `reschedule` (boolean — `true` retorna só `pending` com `rescheduledFromId` preenchido), `page`, `pageSize`.

**200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "patientId": "uuid",
      "patientName": "Ana Beatriz Santos",
      "professionalId": "uuid",
      "professionalName": "Dra. Clara Mendes",
      "specialtyId": "uuid",
      "specialtyName": "Cardiologia",
      "startsAt": "2026-11-17T14:30:00Z",
      "endsAt": "2026-11-17T15:00:00Z",
      "status": "pending",
      "paymentType": "insurance",
      "insurance": { "id": "uuid", "name": "Viva Saúde" },
      "source": "dashboard",
      "cancellationReason": null,
      "notes": null,
      "durationMinutes": 30,
      "rescheduledFromId": null,
      "rescheduledFrom": null,
      "rescheduledToId": null,
      "createdAt": "2026-11-15T09:00:00Z"
    }
  ],
  "total": 150, "page": 1, "pageSize": 20
}
```

---

### POST /appointments

Acesso: `admin`, `attendant`, `agent` (via serviço interno).

**Body:**
```json
{
  "patientId": "uuid",
  "professionalId": "uuid",
  "specialtyId": "uuid",
  "startsAt": "2026-11-20T09:00:00Z",
  "durationMinutes": 30,
  "paymentType": "insurance",
  "insuranceId": "uuid",
  "source": "dashboard",
  "notes": null
}
```

**201.** Erros: `409 CONFLICT` (sobreposição de horário), `422 BUSINESS_RULE_VIOLATION` (fora da disponibilidade, além do booking window etc.).

---

### GET /appointments/{id}

Acesso: `admin`, `attendant`.

**200:** objeto completo. Quando `rescheduledFromId` está preenchido, `rescheduledFrom` tem o formato:
```json
{
  "startsAt": "2026-11-14T10:00:00Z",
  "endsAt": "2026-11-14T10:30:00Z",
  "professionalName": "Dra. Clara Mendes"
}
```

---

### POST /appointments/{id}/confirm

Acesso: `admin`, `attendant`.

**204.** Transição: `pending` → `confirmed`. Erros: `409` se status inválido para transição.

---

### POST /appointments/{id}/reject

Acesso: `admin`, `attendant`.

**Body:** `{ "reason": "Horário não disponível." }` (opcional)

**204.** Transição: `pending` → `rejected`.

---

### POST /appointments/{id}/cancel

Acesso: `admin`, `attendant`.

**Body:** `{ "reason": "Solicitação do paciente." }` (opcional)

**204.** Transição: `pending|confirmed` → `cancelled`.

---

### POST /appointments/{id}/complete

Acesso: `admin`, `attendant`, `professional`.

**Body:** `{ "notes": "Anotação administrativa." }` (opcional)

**204.** Transição: `confirmed` → `completed`.

---

### POST /appointments/{id}/no-show

Acesso: `admin`, `attendant`.

**204.** Transição: `confirmed` → `no_show`.

---

### POST /appointments/{id}/reschedule

Acesso: `admin`, `attendant`.

**Body:** mesmo de `POST /appointments` (cria novo agendamento vinculado).

**201:** novo agendamento com `rescheduledFromId` preenchido e `rescheduledFrom` com dados do original.

**Erros:** `409 RESCHEDULE_ALREADY_PENDING` (já existe remarcação pendente para este agendamento), `422`.

**Regras:**
- Só uma remarcação `pending` por agendamento; rejeitar o novo restaura o original.
- Confirmar o novo muda o original para `cancelled` com `cancellationReason = "remarcado"`.

---

## Base de Conhecimento

### GET /knowledge-documents

Acesso: `admin`, `attendant`, `agent` (interno).

**Query:** `category`, `isActive`, `page`, `pageSize`.

**200:** lista paginada com `id`, `title`, `category`, `isActive`.

---

### POST /knowledge-documents

Acesso: `admin`.

**Body:** `{ "title": "...", "category": "faq", "content": "...", "isActive": true }`

**201.**

---

### GET /knowledge-documents/{id}

Acesso: `admin`, `attendant`.

---

### PATCH /knowledge-documents/{id}

Acesso: `admin`.

---

### DELETE /knowledge-documents/{id}

Acesso: `admin`. Desativa (`isActive: false`).

---

### GET /knowledge-documents/search

Acesso: `admin`, `attendant`, `agent` (interno).

**Query:** `q` (texto livre, buscado no `search_vector`), `category`.

**200:** lista de documentos ordenada por relevância (sem paginação, máx 10).

---

## Conversas

### GET /conversations

Acesso: `admin`, `attendant`.

**Query:** `status` (`bot`|`waiting_human`|`human`|`closed`), `assignedUserId` (`me`|`<uuid>`), `channel`, `patientId`, `page`, `pageSize`.

**200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "channel": "whatsapp",
      "contactPhone": "+5581900000101",
      "contactName": "Ana Beatriz",
      "patientId": "uuid",
      "patientName": "Ana Beatriz Santos",
      "status": "waiting_human",
      "assignedUserId": null,
      "lastMessageAt": "2026-11-17T10:20:00Z",
      "handoff": {
        "reason": "Pedido de remarcação",
        "requestedAt": "2026-11-17T10:18:00Z"
      }
    }
  ],
  "total": 8, "page": 1, "pageSize": 20
}
```

---

### GET /conversations/{id}

Acesso: `admin`, `attendant`.

**200:** objeto completo sem mensagens (use `/messages`).

---

### GET /conversations/{id}/messages

Acesso: `admin`, `attendant`.

**Query:** `page`, `pageSize`, `before` (cursor de timestamp para paginação reversa).

**200:** lista de mensagens mais antigas → mais recentes:

```json
{
  "items": [
    {
      "id": "uuid",
      "direction": "inbound",
      "senderType": "patient",
      "senderUserId": null,
      "content": "Bom dia! Preciso remarcar.",
      "deliveryStatus": "delivered",
      "metadata": null,
      "createdAt": "2026-11-17T09:15:00Z"
    }
  ],
  "total": 12, "page": 1, "pageSize": 50
}
```

---

### POST /conversations/{id}/messages

Acesso: `attendant` (apenas se conversa `human` e `assignedUserId` = usuário atual).

**Body:** `{ "content": "Vou verificar o horário disponível." }`

**201:** mensagem criada.

---

### POST /conversations/{id}/assign

Acesso: `admin`, `attendant`. Assume a conversa.

**Body:** `{ "userId": "uuid" }` (admin pode atribuir a outro; attendant só a si mesmo).

**204.** Transição: `waiting_human` → `human`.

---

### POST /conversations/{id}/release

Acesso: `admin`, `attendant`. Devolve ao bot.

**204.** Transição: `human` → `bot`.

---

### POST /conversations/{id}/close

Acesso: `admin`, `attendant`.

**204.** Transição: qualquer → `closed`.

---

### GET /handoffs

Acesso: `admin`, `attendant`.

**Query:** `status` (`open`|`resolved`), `page`, `pageSize`.

**200:** lista de `human_handoffs` com dados da conversa e paciente.

---

## Dashboard

### GET /dashboard/summary

Acesso: `admin`, `attendant`.

**Query:** `days` (1|7|30, default 7), `professionalId`, `specialtyId`.

**200:**
```json
{
  "period": { "start": "2026-11-10", "end": "2026-11-17" },
  "metrics": {
    "planned": 12,
    "completed": 48,
    "cancelled": 5,
    "noShow": 3,
    "total": 68,
    "availableMinutes": 2400,
    "bookedMinutes": 1440,
    "occupancy": 60.0,
    "absenceRate": 5.9
  },
  "today": {
    "pending": 8,
    "freeSlots": 14,
    "conversationsWaiting": 2,
    "conversationsHuman": 1,
    "conversationsBot": 3,
    "pendingReschedules": 1,
    "confirmationsPending": 4
  },
  "professionals": [
    {
      "professionalId": "uuid",
      "name": "Dra. Clara Mendes",
      "color": "#266b53",
      "completed": 15,
      "occupancy": 72.5,
      "missed": 1,
      "cancelled": 2,
      "planned": 3
    }
  ],
  "dailyBreakdown": [
    {
      "date": "2026-11-11",
      "completed": 8,
      "missed": 1,
      "cancelled": 0,
      "planned": 0
    }
  ]
}
```

---

## Auditoria

### GET /audit-logs

Acesso: `admin`.

**Query:** `actorType`, `actorUserId`, `entityType`, `entityId`, `action`, `from`, `to`, `page`, `pageSize`.

**200:** lista paginada de `audit_logs`.

---

## Simulador

### POST /simulator/{clinicSlug}/messages

Simula uma mensagem de paciente chegando via WhatsApp.

Acesso: público (controlado por `SIMULATOR_ENABLED`).

**Body:**
```json
{
  "phone": "+5581900000101",
  "text": "Bom dia! Quero remarcar minha consulta."
}
```

**200:**
```json
{
  "conversationId": "uuid",
  "response": "Olá! Sou o assistente da Clínica Florescer..."
}
```

---

### GET /simulator/{clinicSlug}/history

Acesso: público (quando `SIMULATOR_ENABLED`).

**Query:** `phone`.

**200:** histórico de mensagens da conversa ativa.

---

### POST /simulator/{clinicSlug}/reset

Acesso: público (quando `SIMULATOR_ENABLED`).

**Query:** `phone`.

**204.** Fecha a conversa ativa do número.

---

## Webhooks WhatsApp

### GET /webhooks/whatsapp

Verificação do webhook pelo Meta (challenge).

**Query:** `hub.mode`, `hub.verify_token`, `hub.challenge`.

**200:** retorna `hub.challenge` em texto puro.

---

### POST /webhooks/whatsapp

Recebe eventos do WhatsApp Business API.

**200:** `{ "status": "ok" }` (sempre, para evitar reenvio pelo Meta).

---

## Saúde

### GET /health

Sem autenticação. Retorna `200` se a aplicação está em pé.

**200:** `{ "status": "ok" }`

---

### GET /health/ready

Sem autenticação. Testa conectividade com banco e dependências críticas.

**200:** `{ "status": "ok", "db": "ok" }`

**503:** `{ "status": "degraded", "db": "error" }`

---

## WebSocket — Tempo Real

### WS /ws/events

Conexão autenticada (token JWT na query: `?token=<access_token>`).

Uso: CRM se inscreve para receber eventos em tempo real da clínica.

#### Eventos emitidos pelo servidor

**message.created**
```json
{
  "event": "message.created",
  "data": {
    "conversationId": "uuid",
    "message": {
      "id": "uuid",
      "direction": "inbound",
      "senderType": "patient",
      "content": "Bom dia!",
      "deliveryStatus": "delivered",
      "createdAt": "2026-11-17T09:15:00Z"
    }
  }
}
```

**conversation.created**
```json
{
  "event": "conversation.created",
  "data": {
    "id": "uuid",
    "channel": "whatsapp",
    "contactPhone": "+5581900000101",
    "patientId": "uuid",
    "patientName": "Ana Beatriz Santos",
    "status": "bot",
    "lastMessageAt": "2026-11-17T09:15:00Z"
  }
}
```

**conversation.updated**
```json
{
  "event": "conversation.updated",
  "data": {
    "id": "uuid",
    "status": "waiting_human",
    "assignedUserId": null,
    "lastMessageAt": "2026-11-17T09:18:00Z"
  }
}
```

**handoff.requested**
```json
{
  "event": "handoff.requested",
  "data": {
    "handoffId": "uuid",
    "conversationId": "uuid",
    "contactPhone": "+5581900000101",
    "patientName": "Ana Beatriz Santos",
    "reason": "Pedido de remarcação",
    "requestedAt": "2026-11-17T09:18:00Z"
  }
}
```

**appointment.created**
```json
{
  "event": "appointment.created",
  "data": {
    "id": "uuid",
    "patientId": "uuid",
    "patientName": "Ana Beatriz Santos",
    "professionalId": "uuid",
    "professionalName": "Dra. Clara Mendes",
    "startsAt": "2026-11-20T09:00:00Z",
    "endsAt": "2026-11-20T09:30:00Z",
    "status": "pending"
  }
}
```

**appointment.updated**
```json
{
  "event": "appointment.updated",
  "data": {
    "id": "uuid",
    "status": "confirmed",
    "decidedByUserId": "uuid",
    "decidedAt": "2026-11-17T09:20:00Z"
  }
}
```

---

### WS /ws/simulator/{clinicSlug}

**Query:** `phone` (número do contato simulado).

Sem autenticação (controlado por `SIMULATOR_ENABLED`).

Uso: painel de simulador do CRM — recebe em tempo real as respostas do agente.

Recebe os mesmos eventos `message.created` e `conversation.updated` filtrados pela conversa do número.
