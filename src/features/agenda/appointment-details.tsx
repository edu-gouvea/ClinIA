'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, FilePenLine, History, Save } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Badge, Button, Field, Modal } from '@/components/ui';
import { formatDate, formatTime } from '@/lib/date';
import { appointmentEnd, canRecordOutcome, cancellationReason, isOpenAppointment } from '@/lib/scheduling';
import type { Appointment, AppointmentStatus } from '@/lib/types';
import { appointmentStatusLabels } from '@/lib/appointment-presentation';

export function AppointmentDetails({ appointment, onClose, onReschedule }: { appointment: Appointment; onClose: () => void; onReschedule: () => void }) {
  const { state, act } = useDemo();
  const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false);
  const [cancel, setCancel] = useState(false); const [reason, setReason] = useState('');
  const [note, setNote] = useState(appointment.notes?.at(-1)?.text ?? '');
  const patient = state.patients.find(p => p.id === appointment.patientId);
  const professional = state.professionals.find(p => p.id === appointment.professionalId);
  async function changeStatus(status: AppointmentStatus) {
    setBusy(true); setError(''); setSuccess('');
    try { await act({ type: 'appointment.status', id: appointment.id, status, reason }); setCancel(false); setSuccess(`Consulta ${appointmentStatusLabels[status].toLowerCase()}.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a consulta.'); }
    finally { setBusy(false); }
  }
  async function saveNote(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try { await act({ type: 'appointment.note', id: appointment.id, text: note }); setSuccess('Anotações salvas no histórico da consulta.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a anotação.'); }
    finally { setBusy(false); }
  }
  return <Modal title="Detalhes da consulta" onClose={() => !busy && onClose()} wide><div className="page-stack">
    <div className="consultation-heading"><div><span className="eyebrow">{formatDate(appointment.date, { weekday: 'long', day: 'numeric', month: 'long' })} · {appointment.start}–{appointmentEnd(appointment)}</span><h3>{patient?.name}</h3><p>{professional?.name} · {appointment.specialty}</p></div><Badge tone={appointment.status === 'realizada' ? 'green' : 'gray'}>{appointmentStatusLabels[appointment.status]}</Badge></div>
    <Link className="text-link" onClick={onClose} href={`/gestao/pacientes?id=${appointment.patientId}`}>Abrir cadastro do paciente <ArrowUpRight size={14} /></Link>
    {error && <div role="alert" className="error-banner">{error}</div>}{success && <div role="status" className="success-banner">{success}</div>}
    {cancellationReason(appointment) && <div className="cancellation-detail"><strong>Motivo do cancelamento</strong><p>{appointment.cancelReason}</p></div>}
    {isOpenAppointment(appointment) && !cancel && <div className="consultation-actions">
      {appointment.status === 'agendada' && <Button variant="secondary" disabled={busy} onClick={() => changeStatus('confirmada')}><Check size={15} />Confirmar</Button>}
      <Button variant="secondary" disabled={busy} onClick={onReschedule}>Remarcar</Button>
      {canRecordOutcome(appointment, state.referenceDate) && <><Button disabled={busy} onClick={() => changeStatus('realizada')}>Marcar realizada</Button><Button variant="secondary" disabled={busy} onClick={() => changeStatus('falta')}>Registrar falta</Button></>}
      <Button variant="ghost" disabled={busy} onClick={() => { setError(''); setCancel(true); }}>Cancelar consulta</Button>
    </div>}
    {isOpenAppointment(appointment) && <p className="small muted">{appointment.date > state.referenceDate ? 'Realização e falta estarão disponíveis no dia da consulta.' : appointment.date === state.referenceDate ? 'Hoje é possível registrar realização ou falta em qualquer horário, inclusive antes do horário agendado.' : 'Esta consulta passada ainda pode ter seu resultado registrado.'}</p>}
    {cancel && <section className="cancellation-detail" aria-label="Confirmar cancelamento"><h3>Cancelar esta consulta?</h3><p>O horário será liberado e o histórico será preservado.</p><Field label="Motivo do cancelamento (opcional)"><textarea aria-label="Motivo do cancelamento" value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} /></Field><div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => setCancel(false)}>Manter consulta</Button><Button variant="danger" disabled={busy} onClick={() => changeStatus('cancelada')}>Confirmar cancelamento</Button></div></section>}
    {appointment.status === 'realizada' && <form className="consultation-notes" onSubmit={saveNote}><div className="card-header"><div><h3><FilePenLine size={17} />Anotações da consulta</h3><p>Vinculadas a {professional?.name}.</p></div></div><Field label="Anotações da consulta"><textarea aria-label="Anotações da consulta" value={note} onChange={e => setNote(e.target.value)} rows={6} maxLength={10000} required placeholder="Registre as anotações desta consulta…" /></Field><div className="notes-footer"><small>{appointment.notes?.length ? `Última versão salva em ${formatDate(appointment.notes.at(-1)!.at)} às ${formatTime(appointment.notes.at(-1)!.at)}.` : 'As anotações ficam salvas junto ao histórico desta consulta.'}</small><Button type="submit" disabled={busy || !note.trim() || note.trim() === appointment.notes?.at(-1)?.text}><Save size={15} />Salvar anotações</Button></div>{!!appointment.notes?.length && <details className="note-versions"><summary>Versões salvas ({appointment.notes.length})</summary>{[...appointment.notes].reverse().map((version, index) => <article key={version.id}><strong>{index === 0 ? 'Versão atual' : 'Versão anterior'} · {formatDate(version.at)} às {formatTime(version.at)}</strong><small>Profissional: {state.professionals.find(p => p.id === version.professionalId)?.name} · Registro por {state.users.find(u => u.id === version.recordedByUserId)?.name}</small><p>{version.text}</p></article>)}</details>}</form>}
    <section><h3 className="history-heading"><History size={16} />Histórico da consulta</h3><ol className="timeline">{appointment.events.map(event => <li key={event.id}><strong>{event.description}</strong><small>{formatDate(event.at)} às {formatTime(event.at)} · {state.users.find(user => user.id === event.authorId)?.name ?? 'Demonstração'}</small>{event.previousStart && <span>{event.previousStart} → {event.newStart}</span>}</li>)}</ol></section>
  </div></Modal>;
}
