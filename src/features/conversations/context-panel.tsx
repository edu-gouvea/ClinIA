'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUp, ArrowUpRight, Sparkles, User, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Avatar, Badge, Button } from '@/components/ui';
import { formatDate, formatTime } from '@/lib/date';
import { draftReply, futureAppointments, relativeDay, type ConversationAnswer, type SlotSuggestion } from '@/lib/conversation-assistant';
import { appointmentStatusLabels, appointmentStatusTones } from '@/lib/status-presentation';
import type { Conversation, DemoState } from '@/lib/types';

export type PanelTab = 'paciente' | 'assistente';
export type Exchange = { id: string; question: string; answer: ConversationAnswer };
export const assistantShortcuts = ['Sugerir resposta', 'Horários livres', 'Próximas consultas', 'Resumir conversa'];

type Props = {
  state: DemoState; conversation: Conversation; tab: PanelTab; onTab: (tab: PanelTab) => void; onClose: () => void;
  exchanges: Exchange[]; onAsk: (question: string) => void; onClear: () => void;
  selectedSlot?: string; onSelectSlot: (id: string) => void; canInsert: boolean; insertBlocked: string; onInsert: (text: string) => void;
};

/** Contextual panel: fixed header (tabs + close) outside the scrolling area. */
export function ContextPanel(props: Props) {
  const { tab, onTab, onClose } = props;
  const tabs: [PanelTab, string][] = [['paciente', 'Paciente'], ['assistente', 'Assistente']];
  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next: PanelTab = event.key === 'Home' ? 'paciente' : event.key === 'End' ? 'assistente' : tab === 'paciente' ? 'assistente' : 'paciente';
    onTab(next);
    requestAnimationFrame(() => document.getElementById(`context-tab-${next}`)?.focus());
  }
  return <div className="context-panel">
    <div className="context-panel-header">
      <div className="context-tabs" role="tablist" aria-label="Painel contextual">
        {tabs.map(([key, label]) => <button key={key} id={`context-tab-${key}`} type="button" role="tab" aria-selected={tab === key} aria-controls={`context-panel-${key}`} tabIndex={tab === key ? 0 : -1} onClick={() => onTab(key)} onKeyDown={onKey}>
          {key === 'paciente' ? <User size={14} aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" className="ai-icon" />}{label}
        </button>)}
      </div>
      <Button variant="ghost" size="icon" aria-label="Fechar painel" onClick={onClose}><X size={16} /></Button>
    </div>
    <div id={`context-panel-${tab}`} role="tabpanel" aria-labelledby={`context-tab-${tab}`} className={`context-panel-body context-${tab}`}>
      {tab === 'paciente' ? <PatientTab {...props} /> : <AssistantTab {...props} />}
    </div>
  </div>;
}

function PatientTab({ state, conversation }: Props) {
  const patient = state.patients.find(item => item.id === conversation.patientId)!;
  const upcoming = futureAppointments(state, patient.id);
  return <div className="patient-tab">
    <div className="patient-identity"><Avatar name={patient.name} size="md" /><div><h2>{patient.name}</h2><Link href={`/gestao/pacientes?id=${patient.id}&context=${conversation.id}`} className="text-link">Ver cadastro<ArrowUpRight size={14} aria-hidden="true" /></Link></div></div>
    <dl className="patient-data">
      <dt>Telefone</dt><dd className="tabular">{patient.phone}</dd>
      <dt>Convênio</dt><dd>{patient.insurance || 'Particular'}</dd>
      <dt>Observações</dt><dd className={patient.notes ? 'patient-notes' : 'is-empty'}>{patient.notes || 'Sem observações'}</dd>
    </dl>
    <section className="patient-appointments" aria-labelledby="patient-appointments-title">
      <div className="patient-section-head"><h3 id="patient-appointments-title">Próximas consultas</h3>{upcoming.length > 0 && <span className="tabular">Exibindo {Math.min(3, upcoming.length)} de {upcoming.length}</span>}</div>
      {upcoming.length ? <ul className="patient-appointment-list">{upcoming.slice(0, 3).map(appointment => {
        const professional = state.professionals.find(person => person.id === appointment.professionalId);
        return <li key={appointment.id} data-appointment-id={appointment.id}>
          <div><strong className="tabular">{relativeDay(appointment.date, state.referenceDate)} · {appointment.start}</strong><span>{professional?.name} · {appointment.specialty}</span></div>
          <div className="patient-appointment-actions"><Badge tone={appointmentStatusTones[appointment.status]}>{appointmentStatusLabels[appointment.status]}</Badge>
            <Link href={`/gestao/agenda?patient=${patient.id}&edit=${appointment.id}&context=${conversation.id}&date=${appointment.date}`} className="text-link" aria-label={`Remarcar consulta de ${relativeDay(appointment.date, state.referenceDate)} às ${appointment.start}`}>Remarcar</Link></div>
        </li>;
      })}</ul> : <p className="patient-empty">Sem consultas futuras agendadas.</p>}
      <Link href={`/gestao/agenda?patient=${patient.id}&context=${conversation.id}`} className="text-link">Ver agenda do paciente<ArrowRight size={14} aria-hidden="true" /></Link>
    </section>
    <details className="patient-history"><summary>Histórico de atendimento</summary><ol>{conversation.events.length ? conversation.events.map(event => <li key={event.id}><p>{event.description}</p><small className="tabular">{formatDate(event.at)} · {formatTime(event.at)} · {state.users.find(user => user.id === event.authorId)?.name || (event.authorId === 'ia' ? 'IA de atendimento' : 'Sistema simulado')}</small></li>) : <li><p>Nenhuma alteração administrativa.</p></li>}</ol></details>
  </div>;
}

function AssistantTab({ state, conversation, exchanges, onAsk, onClear, selectedSlot, onSelectSlot, canInsert, insertBlocked, onInsert }: Props) {
  const [question, setQuestion] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [exchanges.length]);
  function ask(text: string) { if (!text.trim()) return; onAsk(text.trim()); setQuestion(''); }
  return <div className="assistant-tab">
    <div className="assistant-scroll">
      {exchanges.length > 0 && <div className="assistant-tab-actions"><Button variant="ghost" onClick={onClear}>Nova consulta</Button></div>}
      {exchanges.length === 0 && <div className="assistant-empty">
        <span className="assistant-empty-icon" aria-hidden="true"><Sparkles size={18} /></span>
        <h2>Pergunte sobre esta conversa</h2>
        <p>Consulte agenda, horários livres e dados do paciente sem sair do atendimento.</p>
        <div className="assistant-shortcuts">{assistantShortcuts.map(item => <button key={item} type="button" className="chip" onClick={() => ask(item)}>{item}</button>)}</div>
      </div>}
      <div className="assistant-exchanges" aria-live="polite">
        {exchanges.map(exchange => {
          const slots = exchange.answer.slots;
          const chosen = slots?.find(slot => slot.id === selectedSlot) ?? slots?.[0];
          const draft = exchange.answer.draft ? (chosen && draftReply(state, conversation, chosen)) || exchange.answer.draft : undefined;
          return <div key={exchange.id} className="ca-exchange">
            <p className="ca-question">{exchange.question}</p>
            <div className="ca-answer">
              <span className="ca-answer-icon" aria-hidden="true"><Sparkles size={12} /></span>
              <div className="ca-answer-body">
                <p>{exchange.answer.text}</p>
                {exchange.answer.intent === 'slots' && slots && slots.length > 0 && <SlotPicker slots={slots} selected={chosen} onSelect={onSelectSlot} />}
                {draft && <div className="ca-draft">
                  <p>{draft.text}</p>
                  <div className="ca-sources" aria-label="Fontes">{draft.sources.map(source => <span key={source.kind} className="chip chip-static" title={source.title}>{source.label}</span>)}</div>
                  <button type="button" className="ca-insert" disabled={!canInsert} aria-describedby={canInsert ? undefined : `insert-reason-${exchange.id}`} onClick={() => onInsert(draft.text)}>Inserir na resposta</button>
                  {!canInsert && <small id={`insert-reason-${exchange.id}`} className="ca-insert-reason">{insertBlocked}</small>}
                </div>}
                {exchange.answer.links?.map(link => <Link key={link.href} href={link.href} className="text-link">{link.label}<ArrowRight size={14} aria-hidden="true" /></Link>)}
              </div>
            </div>
          </div>;
        })}
        <div ref={end} />
      </div>
    </div>
    <form className="assistant-form" onSubmit={event => { event.preventDefault(); ask(question); }}>
      <label className="sr-only" htmlFor={`assistant-input-${conversation.id}`}>Pergunte sobre esta conversa</label>
      <div className="assistant-input"><input ref={input} id={`assistant-input-${conversation.id}`} placeholder="Pergunte sobre esta conversa…" value={question} onChange={event => setQuestion(event.target.value)} maxLength={300} />
        <button type="submit" className="btn btn-icon assistant-ask" aria-label="Perguntar" disabled={!question.trim()}><ArrowUp size={16} /></button></div>
      <p>Respostas simuladas · o assistente não envia mensagens sozinho</p>
    </form>
  </div>;
}

function SlotPicker({ slots, selected, onSelect }: { slots: SlotSuggestion[]; selected?: SlotSuggestion; onSelect: (id: string) => void }) {
  return <div className="ca-slots" role="group" aria-label="Horários sugeridos">{slots.map(slot => <button key={slot.id} type="button" className="ca-slot" aria-pressed={slot.id === selected?.id} onClick={() => onSelect(slot.id)}>
    <span className="tabular">{slot.label}</span><small>{slot.duration} min</small>
  </button>)}</div>;
}

export const insertBlockedReason = (state: DemoState, conversation: Conversation) => {
  if (conversation.status === 'humano' && conversation.assigneeId && conversation.assigneeId !== state.currentUserId) {
    return `${state.users.find(user => user.id === conversation.assigneeId)?.name ?? 'Outro atendente'} está atendendo esta conversa.`;
  }
  return conversation.status === 'encerrada' ? 'A conversa está encerrada.' : 'Assuma a conversa para inserir o rascunho na resposta.';
};
