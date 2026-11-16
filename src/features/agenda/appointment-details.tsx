'use client';
import { useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight, Ban, CalendarPlus, Check, CheckCheck, CircleCheck, Clock, Clock3, FileText, MoreHorizontal, Repeat, XCircle, type LucideIcon } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Badge, Button, Field, Menu, Modal, type MenuItem } from '@/components/ui';
import { formatDate, formatTime } from '@/lib/date';
import { appointmentDayLine, appointmentEventLine } from '@/lib/booking';
import { rescheduleRequestIds } from '@/lib/agenda-presentation';
import { canRecordOutcome, cancellationReason, isOpenAppointment } from '@/lib/scheduling';
import type { Appointment, AppointmentStatus } from '@/lib/types';
import { appointmentStatusLabels, appointmentStatusPresentation } from '@/lib/status-presentation';
import { ProfessionalAvatar } from './professional-avatar';

const statusIcons: Record<AppointmentStatus, LucideIcon> = { agendada: Clock3, confirmada: CircleCheck, realizada: CheckCheck, falta: XCircle, cancelada: Ban };
const HISTORY_PREVIEW = 5;
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** "Detalhes da consulta": header, metadata, cancellation, notes, history and the
 * status actions in the footer. Same rules and Commands as before: outcomes only today
 * or earlier (`canRecordOutcome`), final states never reopen, notes only after
 * "realizada" and every save is a new version. */
export function AppointmentDetails({ appointment, onClose, onReschedule }: { appointment: Appointment; onClose: () => void; onReschedule: () => void }) {
  const { state, act } = useDemo();
  const context = useSearchParams().get('context');
  const contextQuery = context ? `&context=${encodeURIComponent(context)}` : '';
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancel, setCancel] = useState(false); const [reason, setReason] = useState('');
  const [allHistory, setAllHistory] = useState(false);
  const patient = state.patients.find(p => p.id === appointment.patientId);
  const professional = state.professionals.find(p => p.id === appointment.professionalId);
  const status = appointmentStatusPresentation[appointment.status];
  const StatusIcon = statusIcons[appointment.status];
  const open = isOpenAppointment(appointment);
  const outcome = canRecordOutcome(appointment, state.referenceDate);
  const userName = (id?: string) => id === 'ia' ? 'IA' : state.users.find(u => u.id === id)?.name ?? 'Demonstração';
  const created = appointment.events[0];
  const events = [...appointment.events].reverse();
  const shownEvents = allHistory ? events : events.slice(0, HISTORY_PREVIEW);

  async function changeStatus(next: AppointmentStatus) {
    setBusy(true); setError(''); setSuccess('');
    try { await act({ type: 'appointment.status', id: appointment.id, status: next, reason }); setCancel(false); setSuccess(`Consulta ${appointmentStatusLabels[next].toLowerCase()}.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a consulta.'); }
    finally { setBusy(false); }
  }

  const menuItems: MenuItem[] = [];
  if (appointment.status === 'agendada' && outcome) menuItems.push({ label: 'Marcar como realizada', icon: <CheckCheck size={16} aria-hidden="true" />, onSelect: () => changeStatus('realizada') });
  if (outcome) menuItems.push({ label: 'Registrar falta', icon: <XCircle size={16} aria-hidden="true" />, onSelect: () => changeStatus('falta') });
  if (menuItems.length) menuItems.push({ separator: true });
  menuItems.push({ label: 'Cancelar consulta', icon: <Ban size={16} aria-hidden="true" />, danger: true, onSelect: () => { setError(''); setCancel(true); } });

  const header = <div className="details-header">
    <div className="details-line"><span className="tabular">{appointmentDayLine(appointment)}</span><Badge tone={status.tone}><StatusIcon size={12} aria-hidden="true" />{status.label}</Badge></div>
    <h2 className="details-title">Consulta de {appointment.specialty}</h2>
    <p className="details-people">
      <Link className="details-patient" onClick={onClose} href={`/gestao/pacientes?id=${appointment.patientId}${contextQuery}`} aria-label={`Abrir cadastro do paciente ${patient?.name ?? ''}`}>{patient?.name ?? 'Paciente'}<ArrowUpRight size={14} aria-hidden="true" /></Link>
      <span aria-hidden="true">·</span><span>com {professional?.name ?? 'profissional removido'}</span>
      {rescheduleRequestIds(state).has(appointment.id) && <Badge tone="warning"><Repeat size={12} aria-hidden="true" />Pediu remarcação</Badge>}
    </p>
  </div>;

  return <Modal title="Detalhes da consulta" header={header} onClose={() => !busy && onClose()} className="details-modal">
    <div className="details-body">
      {error && <div role="alert" className="error-banner">{error}</div>}
      {success && <div role="status" className="success-banner">{success}</div>}
      <dl className="details-meta">
        <div><dt>Convênio</dt><dd>{patient?.insurance && !/^particular$/i.test(patient.insurance) ? patient.insurance : 'Particular'}</dd></div>
        <div><dt>Duração</dt><dd className="tabular">{appointment.duration} min</dd></div>
        <div><dt>Marcada por</dt><dd>{created ? <>{userName(created.authorId)}<small className="tabular">{formatDate(created.at)} · {formatTime(created.at)}</small></> : '—'}</dd></div>
      </dl>
      {appointment.status === 'cancelada' && <div className="details-cancelled">{cancellationReason(appointment) ? <>Motivo: “{appointment.cancelReason}”</> : 'Cancelada sem motivo registrado'}</div>}
      {appointment.status === 'realizada' ? <Notes appointment={appointment} onMessage={(message) => { setError(message.error ?? ''); setSuccess(message.success ?? ''); }} />
        : open && <p className="details-note-hint">As anotações ficam disponíveis depois que a consulta for realizada.</p>}
      <section className="details-history" aria-labelledby={`history-${appointment.id}`}>
        <h3 id={`history-${appointment.id}`}><Clock size={16} aria-hidden="true" />Histórico</h3>
        <ol>{shownEvents.map(event => { const line = appointmentEventLine(event); return <li key={event.id} data-tone={line.tone}>
          <i aria-hidden="true" /><span className="details-event"><strong>{userName(event.authorId)}</strong> {line.action}</span><time className="tabular" dateTime={event.at}>{formatDate(event.at)} · {formatTime(event.at)}</time>
        </li>; })}</ol>
        {events.length > HISTORY_PREVIEW && !allHistory && <Button variant="ghost" className="details-more" onClick={() => setAllHistory(true)}>Ver todos ({events.length})</Button>}
      </section>
      {cancel && <section className="cancellation-detail" aria-label="Confirmar cancelamento"><h3>Cancelar esta consulta?</h3><p>O horário será liberado e o histórico será preservado.</p><Field label="Motivo do cancelamento (opcional)"><textarea aria-label="Motivo do cancelamento" value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} /></Field><div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => setCancel(false)}>Manter consulta</Button><Button variant="danger" disabled={busy} onClick={() => changeStatus('cancelada')}>Confirmar cancelamento</Button></div></section>}
    </div>
    <footer className="details-footer">
      {open ? <>
        {appointment.date > state.referenceDate && <small className="details-footer-note">Realização e falta estarão disponíveis no dia da consulta.</small>}
        {!cancel && <div className="details-actions">
          {appointment.status === 'agendada' && <Button disabled={busy} onClick={() => changeStatus('confirmada')}><Check size={16} aria-hidden="true" />Confirmar</Button>}
          {appointment.status === 'confirmada' && outcome && <Button disabled={busy} onClick={() => changeStatus('realizada')}><CheckCheck size={16} aria-hidden="true" />Marcar como realizada</Button>}
          <Button variant="secondary" disabled={busy} onClick={onReschedule}>Remarcar</Button>
          <Menu label="Mais ações" icon={<MoreHorizontal size={18} aria-hidden="true" />} items={menuItems} triggerClassName="btn btn-secondary btn-icon" />
        </div>}
      </> : <>
        <small className="details-footer-note">Consulta encerrada: a situação não pode mais mudar.</small>
        <Link className="btn btn-secondary" href={`/gestao/agenda?new=1&patient=${appointment.patientId}&professional=${appointment.professionalId}${contextQuery}`}><CalendarPlus size={16} aria-hidden="true" />Agendar retorno</Link>
      </>}
    </footer>
  </Modal>;
}

function Notes({ appointment, onMessage }: { appointment: Appointment; onMessage: (message: { error?: string; success?: string }) => void }) {
  const { state, act } = useDemo();
  const notes = appointment.notes ?? [];
  const latest = notes.at(-1);
  const [editing, setEditing] = useState(!latest);
  const [text, setText] = useState(latest?.text ?? '');
  const [busy, setBusy] = useState(false);
  const composing = editing || !latest;
  const unchanged = !text.trim() || text.trim() === latest?.text;
  const professionalOf = (id: string) => state.professionals.find(p => p.id === id);

  async function save() {
    if (busy || unchanged) return;
    setBusy(true); onMessage({});
    try { await act({ type: 'appointment.note', id: appointment.id, text }); onMessage({ success: 'Anotações salvas no histórico da consulta.' }); setEditing(false); }
    catch (cause) { onMessage({ error: cause instanceof Error ? cause.message : 'Não foi possível salvar a anotação.' }); }
    finally { setBusy(false); }
  }
  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save(); }
  }
  const author = latest && professionalOf(latest.professionalId);
  const previous = notes.slice(0, -1).reverse();

  return <section className="details-notes" aria-labelledby={`notes-${appointment.id}`}>
    <div className="details-section-head"><h3 id={`notes-${appointment.id}`}><FileText size={16} aria-hidden="true" />Anotações</h3><span>Ficam no histórico desta consulta</span></div>
    {composing ? <div className="note-composer">
      <label className="sr-only" htmlFor={`note-${appointment.id}`}>Nova anotação</label>
      <textarea id={`note-${appointment.id}`} value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} maxLength={10000} placeholder="Adicionar uma anotação…" autoFocus={editing && !!latest} />
      <div className="note-composer-footer">
        <small>{isMac() ? '⌘' : 'Ctrl'} + Enter salva</small>
        {latest && <Button variant="ghost" disabled={busy} onClick={() => { setEditing(false); setText(latest.text); }}>Cancelar</Button>}
        <Button disabled={busy || unchanged} onClick={save}>{busy ? 'Salvando…' : 'Salvar anotação'}</Button>
      </div>
    </div> : latest && <article className="note-card-current">
      <div className="note-card-head">
        {author ? <ProfessionalAvatar professional={author} size={24} /> : null}
        <strong>{author?.name ?? 'Profissional'}</strong>
        <span className="tabular">{formatDate(latest.at)} · {formatTime(latest.at)}</span>
        <Button variant="ghost" className="note-edit" onClick={() => { setText(latest.text); setEditing(true); }}>Editar</Button>
      </div>
      <p className="note-body">{latest.text}</p>
      {previous.length > 0 && <details className="note-versions">
        <summary>Versão {notes.length} · ver {previous.length} {previous.length === 1 ? 'versão anterior' : 'versões anteriores'}</summary>
        <ol>{previous.map(version => <li key={version.id}><span className="note-version-meta">{professionalOf(version.professionalId)?.name ?? 'Profissional'} · registro por {state.users.find(u => u.id === version.recordedByUserId)?.name ?? 'equipe'} · <span className="tabular">{formatDate(version.at)} · {formatTime(version.at)}</span></span><p>{version.text}</p></li>)}</ol>
      </details>}
    </article>}
  </section>;
}
