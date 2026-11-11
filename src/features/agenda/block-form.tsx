'use client';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarOff, Check, ChevronRight } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Button, Field, Modal } from '@/components/ui';
import { DateInput, TimeInput } from '@/components/date-time-fields';
import { addDays, dateTime, formatDate } from '@/lib/date';
import { appointmentEnd, getBlockConflicts, isOpenAppointment } from '@/lib/scheduling';
import { appointmentStatusLabels } from '@/lib/appointment-presentation';
import type { Appointment, Block } from '@/lib/types';
import { AppointmentForm } from './appointment-form';

export function BlockForm({ block, professionalId, onClose }: { block?: Block; professionalId: string; onClose: (saved?: boolean) => void }) {
  const { state, act } = useDemo();
  const [input, setInput] = useState<Omit<Block, 'id'>>(() => block ? { professionalId: block.professionalId, date: block.date, start: block.start, end: block.end, reason: block.reason } : { professionalId, date: addDays(state.referenceDate, 1), start: '12:00', end: '13:00', reason: '' });
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [editing, setEditing] = useState<Appointment>(); const [cancelling, setCancelling] = useState<Appointment>();
  const [cancelReason, setCancelReason] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const conflicts = getBlockConflicts(state, input);
  const resolved = reviewIds.filter(id => !conflicts.some(a => a.id === id));
  async function save() {
    setBusy(true); setError('');
    try { await act({ type: 'block.save', id: block?.id, input }); onClose(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o bloqueio. Tente novamente.'); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (input.start >= input.end) { setError('O início do bloqueio deve ser anterior ao fim.'); return; }
    if (new Date(dateTime(input.date, input.start)).getTime() <= new Date(state.now).getTime()) { setError('Escolha um intervalo futuro para o bloqueio.'); return; }
    if (conflicts.length) { setReviewIds(conflicts.map(a => a.id)); setStep('review'); }
    else void save();
  }
  async function cancelAppointment() {
    if (!cancelling) return; setBusy(true); setError('');
    try { await act({ type: 'appointment.status', id: cancelling.id, status: 'cancelada', reason: cancelReason }); setCancelling(undefined); setCancelReason(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível cancelar a consulta.'); }
    finally { setBusy(false); }
  }
  // Only one dialog is mounted: each nested action returns to this intact draft.
  if (editing) return <AppointmentForm appointment={editing} reservedBlock={input} onClose={() => { setEditing(undefined); setError(''); }} />;
  if (cancelling) return <Modal title="Cancelar consulta para liberar o bloqueio?" onClose={() => !busy && setCancelling(undefined)}><div className="page-stack"><p><strong>{state.patients.find(p => p.id === cancelling.patientId)?.name}</strong> · {cancelling.start}–{appointmentEnd(cancelling)}</p><p className="muted">O cancelamento será salvo no histórico. Você voltará à revisão das consultas antes de concluir o bloqueio.</p>{error && <div role="alert" className="error-banner">{error}</div>}<Field label="Motivo do cancelamento (opcional)"><textarea aria-label="Motivo do cancelamento" value={cancelReason} maxLength={2000} onChange={e => setCancelReason(e.target.value)} /></Field><div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => setCancelling(undefined)}>Manter consulta</Button><Button variant="danger" disabled={busy} onClick={cancelAppointment}>Confirmar cancelamento</Button></div></div></Modal>;
  return <Modal title={step === 'review' ? 'Revisar consultas afetadas' : block ? 'Editar bloqueio' : 'Novo bloqueio'} onClose={() => !busy && onClose()} wide={step === 'review'}>
    {step === 'form' ? <form onSubmit={submit} className="page-stack"><p className="muted">Defina o intervalo. Se houver consultas, você poderá decidir sobre cada uma antes de concluir o bloqueio.</p>{error && <div className="error-banner" role="alert">{error}</div>}<Field label="Profissional"><select required aria-label="Profissional do bloqueio" value={input.professionalId} onChange={e => setInput({ ...input, professionalId: e.target.value })}>{state.professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Data do bloqueio"><DateInput required label="Data do bloqueio" min={state.referenceDate} value={input.date} onChange={date => setInput({ ...input, date })} /></Field><div className="form-grid"><Field label="Início do bloqueio"><TimeInput required label="Início do bloqueio" value={input.start} onChange={start => setInput({ ...input, start })} /></Field><Field label="Fim do bloqueio"><TimeInput required label="Fim do bloqueio" value={input.end} onChange={end => setInput({ ...input, end })} /></Field></div><Field label="Motivo administrativo"><input required aria-label="Motivo administrativo" value={input.reason} onChange={e => setInput({ ...input, reason: e.target.value })} maxLength={200} placeholder="Ex.: reunião da equipe" /></Field><div className="form-actions"><Button type="button" variant="secondary" disabled={busy} onClick={() => onClose()}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Continuar'}<ChevronRight size={15} /></Button></div></form> : <div className="page-stack">
      <div className="block-review-summary"><CalendarOff size={23} /><div><strong>{state.professionals.find(p => p.id === input.professionalId)?.name}</strong><span>{formatDate(input.date, { year: 'numeric' })} · {input.start}–{input.end}</span><small>{input.reason}</small></div></div>
      <p className="muted">Remarque ou cancele as consultas que ocupam o intervalo. Cada alteração é salva no histórico; o bloqueio será criado somente ao concluir esta etapa.</p>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="block-conflicts">{conflicts.map(a => <article key={a.id} data-conflict-id={a.id}><div><span>{a.start}–{appointmentEnd(a)}</span><strong>{state.patients.find(p => p.id === a.patientId)?.name}</strong><small>{a.specialty} · {appointmentStatusLabels[a.status]}</small></div>{isOpenAppointment(a) ? <div className="inline-actions"><Button variant="secondary" onClick={() => setEditing(a)}>Remarcar</Button><Button variant="ghost" onClick={() => { setError(''); setCancelling(a); }}>Cancelar consulta</Button></div> : <p>Resultado já registrado. Ajuste o intervalo do bloqueio para preservar esta consulta.</p>}</article>)}</div>
      {resolved.length > 0 && <p className="resolved-count"><Check size={16} />{resolved.length} consulta(s) liberada(s) do intervalo.</p>}
      {!conflicts.length && <div className="block-ready" role="status"><Check size={22} /><div><strong>O intervalo está livre para o bloqueio.</strong><p>Conclua para reservar este horário.</p></div></div>}
      <div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => { setError(''); setStep('form'); }}><ArrowLeft size={15} />Ajustar intervalo</Button><Button disabled={busy || conflicts.length > 0} onClick={save}>{busy ? 'Salvando…' : block ? 'Concluir e salvar bloqueio' : 'Concluir e criar bloqueio'}</Button></div>
    </div>}
  </Modal>;
}
