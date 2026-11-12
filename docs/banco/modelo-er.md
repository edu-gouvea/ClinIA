# Modelo entidade-relacionamento — proposta v1

```mermaid
erDiagram
    clinics ||--o{ users : possui
    clinics ||--o{ patients : cadastra
    clinics ||--o{ professionals : possui
    clinics ||--o{ specialties : oferece
    clinics ||--o{ insurances : aceita
    clinics ||--o{ clinic_hours : funciona
    professionals ||--o{ professional_specialties : atende
    specialties ||--o{ professional_specialties : vincula
    professionals ||--o{ professional_availability : disponibiliza
    professionals ||--o{ calendar_entries : agenda
    patients o|--o{ calendar_entries : consulta
    specialties o|--o{ calendar_entries : classifica
    users o|--o{ calendar_entries : cria
    patients ||--o{ conversations : conversa
    users o|--o{ conversations : assume
    conversations ||--o{ conversation_sessions : preserva
    conversation_sessions ||--o{ messages : registra
    conversation_sessions ||--o{ human_handoffs : encaminha
    users o|--o{ messages : envia
    users o|--o{ human_handoffs : atende
    clinics ||--o{ knowledge_documents : informa
    clinics ||--o{ audit_events : audita
    users o|--o{ audit_events : executa
```

Todos os registros subordinados incluem `clinic_id`. Relacionamentos usam chaves estrangeiras compostas para impedir vínculos entre clínicas. A figura omite essas linhas repetitivas; as restrições completas estão no SQL.

`calendar_entries` reúne consultas e bloqueios. `appointments` e `calendar_blocks` são views filtradas. Isso permite uma única restrição de exclusão para impedir disputa entre consulta e bloqueio. Bloqueios não têm paciente/especialidade; consultas exigem ambos.

Horários absolutos usam `timestamptz`; a apresentação usa o fuso da clínica. Faixas semanais usam dia 0=domingo até 6=sábado e horário local. Intervalos são `[início,fim)`: uma consulta pode começar exatamente quando a anterior termina.
