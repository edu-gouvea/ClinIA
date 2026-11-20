'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Feedback } from '@/components/feedback';
import { Button, Modal } from '@/components/ui';
import { formatDate } from '@/lib/date';
import type { Appointment, DemoState } from '@/lib/types';

/** Entries of a one-per-line (or comma separated) text area, trimmed and de-duplicated. */
export const lines = (value: string) => [...new Set(value.split(/[\n,]/).map(line => line.trim()).filter(Boolean))];

const LISTED = 8;

/** Future appointments left outside the availability by a schedule change. */
export function ConflictNotice({ appointments, state }: { appointments: Appointment[]; state: DemoState }) {
  if (!appointments.length) return null;
  return <div className="warning-banner conflict-notice">
    <strong>{appointments.length} {appointments.length === 1 ? 'consulta futura precisa' : 'consultas futuras precisam'} de revisão.</strong>
    <p>Os horários abaixo ficaram fora da disponibilidade. As consultas permanecem agendadas; revise ou remarque com o paciente.</p>
    <ul>
      {appointments.slice(0, LISTED).map(appointment => <li key={appointment.id}>
        <Link className="text-link" href={`/gestao/agenda?date=${appointment.date}&professional=${appointment.professionalId}&patient=${appointment.patientId}`}>
          {state.patients.find(patient => patient.id === appointment.patientId)?.name} · {formatDate(appointment.date)} às {appointment.start}<ArrowUpRight size={13} />
        </Link>
      </li>)}
    </ul>
    {appointments.length > LISTED && <p>Mais {appointments.length - LISTED} consultas precisam de revisão na agenda.</p>}
  </div>;
}

/** Asked before saving hours that leave future appointments uncovered. */
export function AvailabilityConfirmation({ count, busy, error, onClose, onConfirm }: { count: number; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) {
  return <Modal title="Revisar mudança de disponibilidade" onClose={() => !busy && onClose()}>
    <p className="muted small">Esta alteração deixa <strong>{count} {count === 1 ? 'consulta futura fora' : 'consultas futuras fora'} da disponibilidade</strong>. Os agendamentos serão preservados e identificados para revisão nesta página.</p>
    <p className="muted small">Você poderá remarcar cada consulta pela agenda após salvar.</p>
    <Feedback error={error} />
    <div className="form-actions">
      <Button variant="secondary" disabled={busy} onClick={onClose}>Voltar e ajustar</Button>
      <Button disabled={busy} onClick={onConfirm}>Salvar alteração</Button>
    </div>
  </Modal>;
}
