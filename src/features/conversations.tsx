'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeft, ArrowUpRight, Bot, CalendarDays, Check, CheckCheck,
  ChevronRight, CircleAlert, Info, MessageCircle, PanelRightClose,
  PanelRightOpen, Send, ShieldCheck, Sparkles,
  UserRound, X,
} from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Avatar, Badge, Button, EmptyState, Field, Modal, PageHeading, SearchInput } from '@/components/ui';
import { dateTime, formatDate, formatTime } from '@/lib/date';
import { orderConversations } from '@/lib/conversation-presentation';
import { MessageHistory } from './conversations/message-history';
import type { AppointmentStatus, Command, Conversation, Message } from '@/lib/types';

const appointmentLabels: Record<AppointmentStatus, string> = {
  agendada: 'Agendada', confirmada: 'Confirmada', cancelada: 'Cancelada', realizada: 'Realizada', falta: 'Falta',
};

function conversationLabel(conversation: Conversation, currentUserId: string) {
  if (conversation.status === 'ia') return 'Com IA';
  if (conversation.status === 'aguardando') return 'Aguardando atendente';
  if (conversation.status === 'encerrada') return 'Encerrada';
  return conversation.assigneeId === currentUserId ? 'Comigo' : 'Com outro atendente';
}

function conversationTone(conversation: Conversation): 'green' | 'amber' | 'gray' | 'blue' {
  return conversation.status === 'aguardando' ? 'amber'
    : conversation.status === 'ia' ? 'green'
      : conversation.status === 'humano' ? 'blue' : 'gray';
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const patientBreakpoint = '(min-width: 768px)';
const wideSnapshot = () => window.matchMedia(patientBreakpoint).matches;
const serverWideSnapshot = () => false;
function subscribeWidth(notify: () => void) {
  const media = window.matchMedia(patientBreakpoint);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
}

export function Conversations() {
  const { state, act } = useDemo();
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get('id');
  const statusFilter = params.get('status') || '';
  const assigneeFilter = params.get('assignee') || '';
  const reasonFilter = params.get('reason') || '';
  const [search, setSearch] = useState('');
  const [showPatient, setShowPatient] = useState(true);
  const [mobilePatientOpen, setMobilePatientOpen] = useState(false);
  const wide = useSyncExternalStore(subscribeWidth, wideSnapshot, serverWideSnapshot);
  const patientVisible = wide ? showPatient : mobilePatientOpen;
  const togglePatient = () => wide ? setShowPatient(value => !value) : setMobilePatientOpen(value => !value);
  const closePatient = () => wide ? setShowPatient(false) : setMobilePatientOpen(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ conversationId: string; message: Message } | null>(null);
  const [closeDialog, setCloseDialog] = useState(false);
  const [simulationDialog, setSimulationDialog] = useState(false);
  const [simulatedText, setSimulatedText] = useState('Olá! Gostaria de confirmar meu próximo horário.');
  const [failNextMessage, setFailNextMessage] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const selected = state.conversations.find((conversation) => conversation.id === selectedId);
  const patient = state.patients.find((item) => item.id === selected?.patientId);
  const owner = state.users.find((user) => user.id === selected?.assigneeId);
  const owned = selected?.status === 'humano' && selected.assigneeId === state.currentUserId;
  const claimable = selected && !selected.assigneeId && (selected.status === 'ia' || selected.status === 'aguardando');
  const waiting = state.conversations.filter((conversation) => conversation.status === 'aguardando').length;
  const ownedCount = state.conversations.filter((conversation) => conversation.status === 'humano' && conversation.assigneeId === state.currentUserId).length;
  const searchValue = normalize(search.trim());
  const filtered = orderConversations(state.conversations.filter((conversation) => {
    const contact = state.patients.find((item) => item.id === conversation.patientId);
    if (!contact) return false;
    if (statusFilter && conversation.status !== statusFilter) return false;
    if (reasonFilter === 'remarcacao' && (conversation.status === 'encerrada' || !normalize(conversation.reason || '').includes('remarc'))) return false;
    if (assigneeFilter === 'me' && conversation.assigneeId !== state.currentUserId) return false;
    if (assigneeFilter === 'other' && (!conversation.assigneeId || conversation.assigneeId === state.currentUserId)) return false;
    if (assigneeFilter && !['me', 'other'].includes(assigneeFilter) && conversation.assigneeId !== assigneeFilter) return false;
    return !searchValue || normalize(`${contact.name} ${contact.phone}`).includes(searchValue)
      || (search.replace(/\D/g, '').length > 0 && contact.phone.replace(/\D/g, '').includes(search.replace(/\D/g, '')));
  }), state.currentUserId);
  const appointments = state.appointments.filter((appointment) => appointment.patientId === patient?.id)
    .sort((left, right) => `${left.date} ${left.start}`.localeCompare(`${right.date} ${right.start}`));
  const upcoming = appointments.filter((appointment) => new Date(dateTime(appointment.date, appointment.start)).getTime() >= new Date(state.now).getTime() && ['agendada', 'confirmada'].includes(appointment.status));
  const displayedMessages = selected ? [...selected.messages] : [];
  if (pending && pending.conversationId === selected?.id && !displayedMessages.some((message) => message.id === pending.message.id)) {
    displayedMessages.push(pending.message);
  }

  useEffect(() => {
    const host = pageRef.current?.closest<HTMLElement>('.workspace-conversations');
    const viewport = window.visualViewport;
    function fitViewport() {
      const height = viewport && viewport.scale === 1 ? viewport.height : window.innerHeight;
      host?.style.setProperty('--conversation-viewport-height', `${height}px`);
    }
    fitViewport();
    window.addEventListener('resize', fitViewport);
    viewport?.addEventListener('resize', fitViewport);
    return () => {
      window.removeEventListener('resize', fitViewport);
      viewport?.removeEventListener('resize', fitViewport);
      host?.style.removeProperty('--conversation-viewport-height');
    };
  }, []);

  function navigate(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setError('');
    setNotice('');
    if (changes.id) { setShowPatient(true); setMobilePatientOpen(false); }
    router.push(`/conversas${next.size ? `?${next}` : ''}`, { scroll: false });
  }

  async function execute(command: Command, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await act(command);
      setNotice(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir. Tente novamente.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(retry?: Message) {
    if (!selected || !owned || busy) return;
    const text = (retry?.text || drafts[selected.id] || '').trim();
    if (!text) return;
    const id = retry?.id || `message-${crypto.randomUUID()}`;
    const message: Message = {
      id, text, author: 'humano', authorId: state.currentUserId,
      at: state.now, delivery: 'pendente', sessionId: selected.sessionId,
    };
    setPending({ conversationId: selected.id, message });
    const shouldFail = failNextMessage && !retry;
    const success = await execute({ type: 'conversation.send', id: selected.id, text, messageId: id, fail: shouldFail }, shouldFail ? 'Falha de envio simulada. Use “Tentar novamente” na mensagem.' : 'Mensagem enviada.');
    setPending(null);
    if (success) {
      setDrafts((current) => ({ ...current, [selected.id]: '' }));
      if (shouldFail) setFailNextMessage(false);
    }
  }

  const closed = selected?.status === 'encerrada';
  const disabledReason = closed ? 'Atendimento encerrado. Uma nova mensagem recebida inicia outra sessão e preserva o histórico.'
    : selected?.assigneeId && !owned ? `Em acompanhamento: ${owner?.name || 'outro atendente'} é responsável. Somente essa pessoa pode responder.`
      : 'Assuma esta conversa para habilitar o envio de mensagens.';

  const patientPanel = selected && patient && (<aside aria-label="Dados do paciente" className="conversation-patient">
          {wide && <div className="conversation-patient-heading"><h2>Dados do paciente</h2><Button variant="ghost" size="icon" aria-label="Fechar dados do paciente" onClick={closePatient}><X size={16} /></Button></div>}
          <div className="conversation-patient-identity"><Avatar name={patient.name} size="md" /><div><h3>{patient.name}</h3><p>Paciente da clínica</p></div></div>
          <Link href={`/gestao/pacientes?id=${patient.id}&context=${selected.id}`} className="conversation-patient-profile text-link">Ver cadastro<ArrowUpRight size={14} /></Link>
          <dl className="conversation-patient-data"><div><dt className="mb-1 text-[var(--muted)]">Telefone</dt><dd className="font-medium text-[var(--green-ink)]">{patient.phone}</dd></div><div><dt className="mb-1 text-[var(--muted)]">Convênio</dt><dd className="font-medium text-[var(--green-ink)]">{patient.insurance || 'Particular'}</dd></div>{patient.notes && <div><dt className="mb-1 text-[var(--muted)]">Observações administrativas</dt><dd className="leading-5 text-[var(--green-ink)]">{patient.notes}</dd></div>}</dl>
          <div className="mb-3 flex items-center gap-2 border-t border-[var(--border)] pt-5"><CalendarDays size={15} className="text-[var(--green-ink)]" /><h3 className="text-xs font-semibold">Próximos agendamentos</h3><span className="ml-auto text-xs text-[var(--muted)]">{upcoming.length}</span></div>
          {upcoming.length ? <div className="space-y-3">{upcoming.slice(0, 3).map((appointment) => {
            const professional = state.professionals.find((person) => person.id === appointment.professionalId);
            return <div key={appointment.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3"><div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold"><span>{formatDate(appointment.date)} · {appointment.start}</span><Badge tone={appointment.status === 'confirmada' ? 'green' : 'amber'}>{appointmentLabels[appointment.status]}</Badge></div><p className="mt-2 text-xs text-[var(--green-ink)]">{professional?.name}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{appointment.specialty} · {appointment.duration} min</p><Link href={`/gestao/agenda?patient=${patient.id}&edit=${appointment.id}&context=${selected.id}&date=${appointment.date}`} className="mt-3 flex items-center justify-between text-xs font-medium text-[var(--green-ink)]">Remarcar consulta<ChevronRight size={13} /></Link></div>;
          })}</div> : <p className="rounded-xl bg-[var(--surface-subtle)] p-4 text-xs leading-5 text-[var(--muted)]">Sem consultas futuras agendadas.</p>}
          {upcoming.length > 3 && <p className="conversation-preview-count">Exibindo 3 de {upcoming.length} consultas.</p>}
          <Link href={`/gestao/agenda?patient=${patient.id}&context=${selected.id}`} className="mt-4 flex items-center justify-between rounded-lg py-2 text-xs font-medium text-[var(--green-ink)]">Ver agenda do paciente<ArrowUpRight size={14} /></Link>
          <details className="mt-4 border-t border-[var(--border)] pt-4"><summary className="cursor-pointer text-xs font-semibold text-[var(--green-ink)]">Histórico de atendimento</summary><ol className="mt-4 space-y-3">{selected.events.length ? selected.events.map((event) => <li key={event.id} className="border-l-2 border-[var(--border)] pl-3"><p className="text-xs leading-5 text-[var(--green-ink)]">{event.description}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{formatDate(event.at)} · {formatTime(event.at)}<br />{state.users.find((user) => user.id === event.authorId)?.name || (event.authorId === 'ia' ? 'IA de atendimento' : 'Sistema simulado')}</p></li>) : <li className="text-xs text-[var(--muted)]">Nenhuma alteração administrativa.</li>}</ol></details>
        </aside>);

  return (
    <div ref={pageRef} className="conversations-page">
      <PageHeading eyebrow="ATENDIMENTO" title="Conversas"
        actions={<div className="flex flex-wrap items-center gap-2"><Badge tone="amber">{waiting} aguardando</Badge><Badge tone="blue">{ownedCount} comigo</Badge></div>} />

      {selectedId && !selected && <div className="warning-banner" role="alert">Conversa não encontrada. <Button variant="ghost" onClick={() => navigate({ id: null })}>Voltar para lista de conversas</Button></div>}

      <div className={`conversation-workspace ${selected ? 'has-conversation' : ''} ${wide && patientVisible && selected ? 'has-patient' : ''}`}>
        <aside aria-label="Lista de conversas" data-density="compact" className={`conversation-list flex min-w-0 flex-col border-r border-[var(--border)] ${selected ? 'hidden md:flex' : ''}`}>
          <div className="conversation-list-heading">
            <div className="conversation-inbox-title"><h2 className="text-base font-semibold">Caixa de entrada</h2><span className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--green-ink)]">{filtered.length}</span></div>
            <SearchInput aria-label="Buscar conversas por nome ou telefone" placeholder="Nome ou telefone" value={search} onChange={(event) => setSearch(event.target.value)} />
            <div className="conversation-filters">
              <select aria-label="Situação da conversa" value={statusFilter} onChange={(event) => navigate({ status: event.target.value, id: null })} >
                <option value="">Todas as situações</option><option value="ia">Com IA</option><option value="aguardando">Aguardando atendente</option><option value="humano">Com atendente</option><option value="encerrada">Encerradas</option>
              </select>
              <select aria-label="Responsável pela conversa" value={assigneeFilter} onChange={(event) => navigate({ assignee: event.target.value, id: null })} >
                <option value="">Todos os responsáveis</option><option value="me">Comigo</option><option value="other">Outro atendente</option>
                {state.users.filter((user) => user.id !== state.currentUserId).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </div>
            {reasonFilter === 'remarcacao' && <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[var(--muted)]"><span>Pedidos de remarcação</span><button type="button" aria-label="Remover filtro de remarcação" onClick={() => navigate({ reason: null })}><X size={15} /></button></div>}
          </div>
          <div className="conversation-list-scroll" role="region" aria-label="Conversas disponíveis" tabIndex={0}>
            {filtered.length === 0 ? <div className="p-4"><EmptyState title="Nenhuma conversa encontrada" description="Experimente outro nome, telefone ou situação."><Button variant="secondary" onClick={() => { setSearch(''); navigate({ status: null, assignee: null, reason: null, id: null }); }}>Limpar filtros</Button></EmptyState></div> : filtered.map((conversation) => {
              const contact = state.patients.find((item) => item.id === conversation.patientId)!;
              const lastMessage = [...conversation.messages].reverse().find((message) => message.author !== 'evento');
              const isSelected = conversation.id === selectedId;
              return <button key={conversation.id} type="button" aria-current={isSelected ? 'true' : undefined} data-status={conversation.status} data-conversation-id={conversation.id} title={`${contact.name} · ${conversationLabel(conversation, state.currentUserId)}`} onClick={() => navigate({ id: conversation.id })} className="conversation-list-item">
                <div className="flex gap-3"><Avatar name={contact.name} size="sm" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="conversation-contact-name">{contact.name}</span><time dateTime={lastMessage?.at} className="conversation-list-time">{lastMessage ? formatTime(lastMessage.at) : '—'}</time></div><p className="mt-1 truncate text-xs leading-5 text-[var(--muted)]">{lastMessage?.text || 'Nenhuma mensagem ainda'}</p><div className="conversation-list-status"><Badge tone={conversationTone(conversation)}>{conversationLabel(conversation, state.currentUserId)}</Badge></div></div></div>
              </button>;
            })}
          </div>
          <div className="conversation-list-footer"><ShieldCheck size={14} /> WhatsApp simulado · dados fictícios</div>
        </aside>

        {selected && patient ? <section aria-label={`Conversa com ${patient.name}`} data-conversation-id={selected.id} className="conversation-detail"><div className="conversation-context">
          <header className="conversation-detail-heading">
            <div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Voltar para lista de conversas" onClick={() => navigate({ id: null })} className="conversation-back rounded-lg p-2 hover:bg-[var(--surface-subtle)]"><ArrowLeft size={20} /></button><Avatar name={patient.name} /><div><h2 className="text-base font-semibold">{patient.name}</h2><p className="mt-1 text-xs text-[var(--muted)]">{patient.phone}</p></div></div>
            <button type="button" aria-label={patientVisible ? 'Recolher dados do paciente' : 'Mostrar dados do paciente'} aria-expanded={patientVisible} onClick={togglePatient} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--green-ink)] hover:bg-[var(--surface-subtle)]">{patientVisible ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}<span>Paciente</span></button>
          </header>
          <div className="conversation-ownership">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={conversationTone(selected)}>{conversationLabel(selected, state.currentUserId)}</Badge><span className="text-xs text-[var(--muted)]">{closed ? 'Atendimento encerrado' : selected.status === 'ia' ? 'Responsável: IA de atendimento' : owner ? `Responsável: ${owner.name}${owned ? ' (você)' : ''}` : 'Aguardando um atendente'}</span></div>
            <div className="flex flex-wrap gap-2">
              {claimable && <Button disabled={busy} onClick={() => execute({ type: 'conversation.claim', id: selected.id }, 'Conversa assumida. Você já pode responder.') }><UserRound size={15} />Assumir conversa</Button>}
              {owned && <><Button variant="secondary" disabled={busy} onClick={() => execute({ type: 'conversation.return', id: selected.id }, 'A IA retomará após a próxima mensagem simulada do paciente.')}><Bot size={15} />Devolver à IA</Button><Button variant="ghost" disabled={busy} onClick={() => setCloseDialog(true)}><Check size={16} />Encerrar</Button></>}
            </div>
          </div>
          {selected.reason && <div className="flex items-start gap-2 border-b border-[var(--warning-border)] bg-[var(--surface)] px-5 py-3 text-xs leading-5 text-[var(--warning-ink)]"><Info size={15} className="mt-0.5 shrink-0" /><span><strong>Motivo do encaminhamento:</strong> {selected.reason}</span></div>}
          {error && <div role="alert" className="flex items-start gap-2 bg-[var(--danger-bg)] px-5 py-3 text-sm text-[var(--danger-ink)]"><CircleAlert size={17} className="mt-0.5 shrink-0" />{error}<button aria-label="Fechar mensagem de erro" type="button" onClick={() => setError('')} className="ml-auto"><X size={16} /></button></div>}
          {notice && <div role="status" className="flex items-start gap-2 bg-[var(--mint)] px-5 py-3 text-xs leading-5 text-[var(--info-ink)]"><CheckCheck size={16} className="mt-0.5 shrink-0" />{notice}</div>}

          </div>
          <MessageHistory key={selected.id} state={state} conversation={selected} patientName={patient.name} messages={displayedMessages} pendingId={pending?.conversationId === selected.id ? pending.message.id : undefined} busy={busy} owned={owned} onRetry={message => { void sendMessage(message); }} />

          <div className="conversation-composer">
            {!owned && <p id="composer-reason" className="mb-3 flex items-start gap-2 text-xs leading-5 text-[var(--muted)]"><Info size={15} className="mt-0.5 shrink-0" />{disabledReason}</p>}
            {owned && failNextMessage && <p className="mb-2 text-xs text-[var(--warning-ink)]">O próximo envio terá uma falha simulada para testar a nova tentativa.</p>}
            <form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }} className="conversation-compose-form">
              <textarea aria-label="Mensagem para o paciente" aria-describedby={!owned ? 'composer-reason' : undefined} placeholder={owned ? 'Escreva uma mensagem…' : 'Assuma o atendimento para responder'} disabled={!owned || busy} rows={2} className="conversation-compose-input" value={selected ? drafts[selected.id] || '' : ''} onChange={(event) => setDrafts((current) => ({ ...current, [selected.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} />
              <Button type="submit" aria-label="Enviar mensagem" disabled={!owned || busy || !(drafts[selected.id] || '').trim()}><Send size={18} /><span className="hidden lg:inline">Enviar</span></Button>
            </form>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-[11px] text-[var(--muted)]"><button type="button" onClick={() => setSimulationDialog(true)} className="flex items-center gap-1.5 rounded-md p-1 text-[var(--muted)] hover:bg-[var(--surface-subtle)]"><Sparkles size={12} />Simular mensagem recebida</button></div>
          </div>
        </section> : <section className="conversation-idle hidden items-center justify-center p-8 md:flex"><div className="max-w-sm text-center"><div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[var(--radius)] bg-[var(--mint)] text-[var(--green-ink)]"><MessageCircle size={34} strokeWidth={1.4} /></div><h2 className="text-xl font-semibold">Cada conversa, um cuidado.</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Selecione uma conversa para acompanhar o atendimento, consultar a agenda e ajudar seu paciente.</p>{selectedId && <p role="alert" className="mt-4 text-sm text-[var(--danger-ink)]">Essa conversa não está disponível na demonstração atual.</p>}<div className="mt-7 flex items-center justify-center gap-2 text-xs text-[var(--muted)]"><Bot size={16} />IA de atendimento e equipe, no mesmo lugar</div></div></section>}

        {wide && patientVisible && patientPanel}
      </div>

      {!wide && patientVisible && patientPanel && <Modal title="Dados do paciente" onClose={closePatient}>{patientPanel}</Modal>}

      {closeDialog && selected && <Modal title="Encerrar atendimento?" onClose={() => !busy && setCloseDialog(false)}><p className="text-sm leading-6 text-[var(--muted)]">O atendimento de <strong>{patient?.name}</strong> será concluído. O histórico fica disponível e uma nova mensagem recebida iniciará outra sessão.</p><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={() => setCloseDialog(false)}>Continuar atendendo</Button><Button disabled={busy} onClick={async () => { if (await execute({ type: 'conversation.close', id: selected.id }, 'Atendimento encerrado. O histórico foi preservado.')) setCloseDialog(false); }}>Encerrar atendimento</Button></div>{error && <p role="alert" className="mt-3 text-sm text-[var(--danger-ink)]">{error}</p>}</Modal>}

      {simulationDialog && selected && <Modal title="Simular mensagem recebida" onClose={() => !busy && setSimulationDialog(false)}><p className="mb-5 text-sm leading-6 text-[var(--muted)]">Envie uma mensagem fictícia como {patient?.name}. {closed ? 'Uma nova sessão será aberta, preservando as anteriores.' : selected.status === 'ia' ? 'A IA de atendimento retomará a conversa.' : 'A mensagem será adicionada ao atendimento atual.'}</p><form onSubmit={async (event) => { event.preventDefault(); if (await execute({ type: 'conversation.receive', id: selected.id, text: simulatedText.trim() }, 'Mensagem fictícia recebida.')) setSimulationDialog(false); }}><Field label="Mensagem do paciente"><textarea required maxLength={2000} rows={3} value={simulatedText} onChange={(event) => setSimulatedText(event.target.value)} className="w-full resize-y rounded-xl border border-[var(--border)] p-3 text-sm" /></Field>{owned && <label className="mt-4 flex items-start gap-3 text-xs leading-5 text-[var(--muted)]"><input type="checkbox" checked={failNextMessage} onChange={(event) => setFailNextMessage(event.target.checked)} className="mt-1" /><span>Simular falha no próximo envio do atendente, para testar a nova tentativa.</span></label>}<div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={busy} type="button" onClick={() => setSimulationDialog(false)}>Fechar</Button><Button disabled={busy || !simulatedText.trim()} type="submit"><MessageCircle size={16} />Receber mensagem</Button></div></form>{error && <p role="alert" className="mt-3 text-sm text-[var(--danger-ink)]">{error}</p>}</Modal>}
    </div>
  );
}
