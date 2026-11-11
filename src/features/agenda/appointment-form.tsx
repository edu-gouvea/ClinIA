'use client';
import { useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Button, Field, Modal } from '@/components/ui';
import { DateInput, TimeInput } from '@/components/date-time-fields';
import { getFreeSlots } from '@/lib/metrics';
import { minutes } from '@/lib/date';
import type { Appointment, AppointmentInput, AppointmentStatus, Block } from '@/lib/types';

type Props = { onClose: () => void; appointment?: Appointment; patientId?: string; professionalId?: string; initialDate?: string; initialStart?: string; reservedBlock?: Omit<Block, 'id'> };
export function AppointmentForm({ onClose, appointment, patientId, professionalId, initialDate, initialStart, reservedBlock }: Props) {
  const { state, act } = useDemo();
  const firstProfessional = state.professionals.find(p => p.id === professionalId && p.active) ?? state.professionals.find(p => p.active);
  const [form, setForm] = useState<AppointmentInput>(() => appointment ? {
    patientId: appointment.patientId, professionalId: appointment.professionalId, specialty: appointment.specialty,
    date: appointment.date, start: appointment.start, duration: appointment.duration, status: appointment.status,
  } : { patientId: patientId ?? '', professionalId: firstProfessional?.id ?? '', specialty: firstProfessional?.specialties[0] ?? '', date: initialDate ?? state.referenceDate, start: initialStart ?? '', duration: 30, status: 'agendada' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [timeSelection, setTimeSelection] = useState(0);
  const professional = state.professionals.find(p => p.id === form.professionalId);
  const eligible = state.professionals.filter(p => (p.active && (!appointment || p.specialties.includes(appointment.specialty))) || p.id === appointment?.professionalId);
  const availabilityState = { ...state, appointments: state.appointments.filter(a => a.id !== appointment?.id), blocks: reservedBlock ? [...state.blocks, { ...reservedBlock, id: 'pending-block-preview' }] : state.blocks };
  const slots = professional && form.date ? getFreeSlots(availabilityState, professional.id, form.date, form.duration) : [];
  const field = <K extends keyof AppointmentInput>(key: K, value: AppointmentInput[K]) => setForm(previous => ({ ...previous, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (reservedBlock && form.date === reservedBlock.date && form.professionalId === reservedBlock.professionalId && minutes(form.start) < minutes(reservedBlock.end) && minutes(form.start) + form.duration > minutes(reservedBlock.start)) throw new Error('Escolha um horário fora do bloqueio que está sendo preparado.');
      await act({ type: 'appointment.save', input: form, id: appointment?.id }); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <Modal title={appointment ? 'Remarcar consulta' : 'Novo agendamento'} onClose={() => !busy && onClose()} wide>
    <form onSubmit={submit} className="page-stack">
      <p className="muted">{appointment ? 'Paciente e especialidade são preservados. Escolha outro horário ou um profissional da mesma especialidade.' : 'Escolha um paciente, um profissional e um horário disponível.'}</p>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="form-grid">
        <Field label="Paciente">{appointment ? <input aria-label="Paciente" readOnly value={state.patients.find(p => p.id === appointment.patientId)?.name ?? ''} className="readonly-field" /> : <select required aria-label="Paciente" value={form.patientId} onChange={e => field('patientId', e.target.value)}><option value="">Selecione um paciente</option>{state.patients.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select>}</Field>
        <Field label="Profissional" hint={appointment ? `Profissionais de ${appointment.specialty}.` : undefined}><select required aria-label="Profissional" value={form.professionalId} onChange={e => { const next = state.professionals.find(p => p.id === e.target.value); setForm(previous => ({ ...previous, professionalId: e.target.value, specialty: appointment?.specialty ?? next?.specialties[0] ?? '', start: '' })); }}><option value="">Selecione</option>{eligible.map(p => <option value={p.id} key={p.id} disabled={!p.active || (!!appointment && !p.specialties.includes(appointment.specialty))}>{p.name}{!p.active ? ' (inativo)' : ''}</option>)}</select></Field>
        <Field label="Especialidade">{appointment ? <input aria-label="Especialidade" readOnly value={appointment.specialty} className="readonly-field" /> : <select required aria-label="Especialidade" value={form.specialty} onChange={e => field('specialty', e.target.value)}><option value="">Selecione</option>{professional?.specialties.map(s => <option key={s}>{s}</option>)}</select>}</Field>
        <Field label="Data"><DateInput required label="Data" min={state.referenceDate} value={form.date} onChange={value => field('date', value)} /></Field>
        <Field label="Horário de início"><TimeInput key={timeSelection} required label="Horário de início" value={form.start} onChange={value => field('start', value)} /></Field>
        <Field label="Duração"><select aria-label="Duração" value={form.duration} onChange={e => field('duration', Number(e.target.value))}>{[...new Set([15, 30, 45, 60, 90, 120, form.duration])].sort((a, b) => a - b).map(duration => <option value={duration} key={duration}>{duration} minutos</option>)}</select></Field>
        <Field label="Situação"><select aria-label="Situação" value={form.status} onChange={e => field('status', e.target.value as AppointmentStatus)}><option value="agendada">Agendada</option><option value="confirmada">Confirmada</option></select></Field>
      </div>
      {appointment && <p className="small muted inline-actions"><LockKeyhole size={13} />O cadastro original e todo o histórico da consulta serão mantidos.</p>}
      <div className="availability-preview"><strong>Horários disponíveis</strong><p className="muted">Para a duração escolhida, respeitando expediente, bloqueios e consultas.</p><div className="availability-grid">{slots.map(slot => <button className={`availability-chip ${form.start === slot ? 'selected' : ''}`} type="button" aria-pressed={form.start === slot} key={slot} onClick={() => { field('start', slot); setTimeSelection(previous => previous + 1); }}>{slot}</button>)}{!slots.length && <span className="muted">Sem horários livres nesta data. Escolha outra data ou profissional.</span>}</div></div>
      <div className="form-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Voltar</Button><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : appointment ? 'Salvar remarcação' : 'Criar agendamento'}</Button></div>
    </form>
  </Modal>;
}
