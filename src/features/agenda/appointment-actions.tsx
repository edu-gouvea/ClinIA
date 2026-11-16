'use client';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Button, Field } from '@/components/ui';
import { canRecordOutcome, isOpenAppointment } from '@/lib/scheduling';
import { appointmentStatusLabels } from '@/lib/status-presentation';
import type { Appointment, AppointmentStatus } from '@/lib/types';

/** Status actions shared by the details modal and the Agenda side panel: the same
 * buttons, rules (`canRecordOutcome`, open-only) and cancel confirmation, dispatching
 * the existing `appointment.status` Command. `onBusyChange` lets a host block closing
 * while a command is running; `onMessage` lets it show feedback in its own single
 * status area (the modal shares it with notes), otherwise messages render here. */
export function AppointmentActions({ appointment, onReschedule, onBusyChange, onMessage, compact = false }: {
  appointment: Appointment; onReschedule: () => void; onBusyChange?: (busy: boolean) => void; onMessage?: (message: { error?: string; success?: string }) => void; compact?: boolean;
}) {
  const { state, act } = useDemo();
  const [localError, setLocalError] = useState(''); const [localSuccess, setLocalSuccess] = useState(''); const [busy, setBusy] = useState(false);
  const setError = (error: string) => onMessage ? onMessage({ error }) : setLocalError(error);
  const setSuccess = (success: string) => onMessage ? onMessage({ success }) : setLocalSuccess(success);
  const [cancel, setCancel] = useState(false); const [reason, setReason] = useState('');
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  async function changeStatus(status: AppointmentStatus) {
    setBusy(true); setError(''); setSuccess('');
    try { await act({ type: 'appointment.status', id: appointment.id, status, reason }); setCancel(false); setSuccess(`Consulta ${appointmentStatusLabels[status].toLowerCase()}.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a consulta.'); }
    finally { setBusy(false); }
  }
  const open = isOpenAppointment(appointment);
  return <>
    {!onMessage && localError && <div role="alert" className="error-banner">{localError}</div>}{!onMessage && localSuccess && <div role="status" className="success-banner">{localSuccess}</div>}
    {open && !cancel && <div className={`consultation-actions${compact ? ' is-compact' : ''}`}>
      {appointment.status === 'agendada' && <Button variant="secondary" disabled={busy} onClick={() => changeStatus('confirmada')}><Check size={15} />Confirmar</Button>}
      <Button variant="secondary" disabled={busy} onClick={onReschedule}>Remarcar</Button>
      {canRecordOutcome(appointment, state.referenceDate) && <><Button disabled={busy} onClick={() => changeStatus('realizada')}>Marcar realizada</Button><Button variant="secondary" disabled={busy} onClick={() => changeStatus('falta')}>Registrar falta</Button></>}
      <Button variant="ghost" disabled={busy} onClick={() => { setError(''); setCancel(true); }}>Cancelar consulta</Button>
    </div>}
    {open && <p className="small muted">{appointment.date > state.referenceDate ? 'Realização e falta estarão disponíveis no dia da consulta.' : appointment.date === state.referenceDate ? 'Hoje é possível registrar realização ou falta em qualquer horário, inclusive antes do horário agendado.' : 'Esta consulta passada ainda pode ter seu resultado registrado.'}</p>}
    {cancel && <section className="cancellation-detail" aria-label="Confirmar cancelamento"><h3>Cancelar esta consulta?</h3><p>O horário será liberado e o histórico será preservado.</p><Field label="Motivo do cancelamento (opcional)"><textarea aria-label="Motivo do cancelamento" value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} /></Field><div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => setCancel(false)}>Manter consulta</Button><Button variant="danger" disabled={busy} onClick={() => changeStatus('cancelada')}>Confirmar cancelamento</Button></div></section>}
  </>;
}
