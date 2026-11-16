'use client';
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useDemo } from '@/components/demo-provider';
import { Button, Modal } from '@/components/ui';
import { TimeInput } from '@/components/date-time-fields';
import { minutes } from '@/lib/date';
import { formatDayTitle } from '@/lib/agenda-presentation';
import { shortDay } from '@/lib/conversation-assistant';
import { appointmentSummaryLine, availableDaysInMonth, availableSlots, durationOptions, firstAvailableDay, startTimeIssue } from '@/lib/booking';
import type { Appointment, AppointmentInput, AppointmentStatus, Block } from '@/lib/types';
import { appointmentStatusLabels } from '@/lib/status-presentation';
import { MiniCalendar } from './agenda-toolbar';

type Props = { onClose: () => void; appointment?: Appointment; patientId?: string; professionalId?: string; initialDate?: string; initialStart?: string; reservedBlock?: Omit<Block, 'id'>; onSaved?: () => void };
const QUICK = [15, 30, 45, 60];
const STALE = 'O horário escolhido não está mais livre.';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Novo agendamento" / "Remarcar consulta": summary · month · free times. Days and
 * times come from `availableDaysInMonth`/`availableSlots` (the existing free-slot rule
 * plus the patient overlap); a typed time goes through the save command's validation. */
export function AppointmentForm({ onClose, appointment, patientId, professionalId, initialDate, initialStart, reservedBlock, onSaved }: Props) {
  const { state, act } = useDemo();
  const today = state.referenceDate;
  // A block being prepared (Configurações) already counts as unavailable here.
  const scope = reservedBlock ? { ...state, blocks: [...state.blocks, { ...reservedBlock, id: 'pending-block-preview' }] } : state;
  const firstProfessional = state.professionals.find(p => p.id === professionalId && p.active) ?? state.professionals.find(p => p.active);
  const slotsFor = (input: Pick<AppointmentInput, 'professionalId' | 'duration' | 'patientId' | 'date'>) =>
    availableSlots(scope, { professionalId: input.professionalId, duration: input.duration, patientId: input.patientId || undefined, date: input.date, excludeAppointmentId: appointment?.id });
  const issueFor = (input: AppointmentInput, start: string) =>
    startTimeIssue(scope, { professionalId: input.professionalId, specialty: input.specialty, duration: input.duration, patientId: input.patientId || undefined, date: input.date, excludeAppointmentId: appointment?.id }, start);

  const [initial] = useState(() => {
    const base: AppointmentInput = appointment ? {
      patientId: appointment.patientId, professionalId: appointment.professionalId, specialty: appointment.specialty,
      date: appointment.date, start: appointment.start, duration: appointment.duration, status: appointment.status,
    } : { patientId: patientId ?? '', professionalId: firstProfessional?.id ?? '', specialty: firstProfessional?.specialties[0] ?? '', date: initialDate ?? today, start: initialStart ?? '', duration: 30, status: 'agendada' };
    const query = { professionalId: base.professionalId, duration: base.duration, patientId: base.patientId || undefined, excludeAppointmentId: appointment?.id };
    const linked = !!base.start && base.date >= today;
    if (!linked && !slotsFor(base).length) base.date = firstAvailableDay(scope, query, base.date > today ? base.date : today) ?? (base.date > today ? base.date : today);
    if (!linked) base.start = '';
    // A linked start outside the 30-min grid (e.g. 09:45) opens "Outro horário…" filled;
    // a start that is no longer valid (or the current time of a rescheduled visit that
    // stopped being free) is simply cleared.
    const offGrid = !!base.start && !slotsFor(base).includes(base.start);
    const custom = offGrid && !appointment && !!initialStart && !issueFor(base, base.start);
    if (offGrid && !custom) base.start = '';
    return { form: base, custom, draft: custom ? base.start : '' };
  });
  const [form, setForm] = useState<AppointmentInput>(initial.form);
  const [custom, setCustom] = useState(initial.custom);
  const [draft, setDraft] = useState(initial.draft);
  const [otherDuration, setOtherDuration] = useState(!QUICK.includes(initial.form.duration));
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const ids = { duration: useId(), status: useId(), day: useId(), customError: useId(), times: useId() };
  const list = useRef<HTMLDivElement>(null);

  const professional = state.professionals.find(p => p.id === form.professionalId);
  const eligible = state.professionals.filter(p => (p.active && (!appointment || p.specialties.includes(appointment.specialty))) || p.id === appointment?.professionalId);
  const specialties = professional?.specialties ?? [];
  const slots = slotsFor(form);
  const customIssue = custom && draft ? issueFor(form, draft) : '';
  // Counts for the month the calendar shows (reported back by `onMonthChange`).
  const [month, setMonth] = useState(initial.form.date.slice(0, 7));
  const counts = availableDaysInMonth(scope, { professionalId: form.professionalId, duration: form.duration, patientId: form.patientId || undefined, month, excludeAppointmentId: appointment?.id });
  const countFor = (day: string) => counts[day] ?? 0;

  /** Apply a change to professional, duration or patient; drop a start that stopped being valid. */
  function change(next: Partial<AppointmentInput>) {
    const merged = { ...form, ...next };
    if (merged.start) {
      const valid = custom ? !issueFor(merged, merged.start) : slotsFor(merged).includes(merged.start);
      if (!valid) { merged.start = ''; setNotice(STALE); if (custom) setDraft(''); }
    }
    setForm(merged);
  }
  function selectDay(day: string) { setForm({ ...form, date: day, start: '' }); setNotice(''); setDraft(''); }
  function chooseSlot(slot: string) { setForm({ ...form, start: slot }); setNotice(''); }
  function typed(value: string) {
    setDraft(value); setNotice('');
    setForm({ ...form, start: value && !issueFor(form, value) ? value : '' });
  }
  function toggleCustom(next: boolean) {
    setCustom(next); setDraft(''); setNotice('');
    setForm({ ...form, start: '' });
  }
  function onListKey(event: KeyboardEvent<HTMLDivElement>) {
    const options = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const target = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: options.length - 1 }[event.key];
    if (target === undefined || !options.length) return;
    event.preventDefault(); options[Math.min(options.length - 1, Math.max(0, target))].focus();
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      if (reservedBlock && form.date === reservedBlock.date && form.professionalId === reservedBlock.professionalId && minutes(form.start) < minutes(reservedBlock.end) && minutes(form.start) + form.duration > minutes(reservedBlock.start)) throw new Error('Escolha um horário fora do bloqueio que está sendo preparado.');
      await act({ type: 'appointment.save', input: form, id: appointment?.id }); onSaved?.(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar. Tente novamente.'); }
    finally { setBusy(false); }
  }

  const focusIndex = Math.max(0, slots.indexOf(form.start));
  const dayTitle = `${shortDay(form.date)}${form.date === today ? ' · hoje' : ''}`;
  const current = appointment && `${shortDay(appointment.date)} · ${appointment.start} · ${state.professionals.find(p => p.id === appointment.professionalId)?.name ?? ''}`;

  return <Modal title={appointment ? 'Remarcar consulta' : 'Novo agendamento'} onClose={() => !busy && onClose()} wide className="booking-modal">
    <form onSubmit={submit} className="booking-form">
      {error && <div className="error-banner booking-error" role="alert">{error}</div>}
      <div className="booking-grid">
        <section className="booking-summary" aria-label="Dados da consulta">
          <label className="booking-field"><span className="booking-label">Paciente</span>
            {appointment ? <input aria-label="Paciente" readOnly value={state.patients.find(p => p.id === appointment.patientId)?.name ?? ''} className="readonly-field" />
              : <select required aria-label="Paciente" value={form.patientId} onChange={e => change({ patientId: e.target.value })}><option value="">Selecione um paciente</option>{state.patients.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select>}
          </label>
          <label className="booking-field"><span className="booking-label">Profissional</span>
            <select required aria-label="Profissional" value={form.professionalId} onChange={e => { const next = state.professionals.find(p => p.id === e.target.value); change({ professionalId: e.target.value, specialty: appointment?.specialty ?? next?.specialties[0] ?? '' }); }}>
              <option value="">Selecione</option>
              {eligible.map(p => <option value={p.id} key={p.id} disabled={!p.active || (!!appointment && !p.specialties.includes(appointment.specialty))}>{p.name}{!p.active ? ' (inativo)' : ''}</option>)}
            </select>
            {appointment && <small className="booking-hint">Profissionais de {appointment.specialty}.</small>}
          </label>
          <label className="booking-field"><span className="booking-label">Especialidade</span>
            {!appointment && specialties.length > 1
              ? <select required aria-label="Especialidade" value={form.specialty} onChange={e => change({ specialty: e.target.value })}>{specialties.map(s => <option key={s}>{s}</option>)}</select>
              : <input aria-label="Especialidade" readOnly value={form.specialty || '—'} className="booking-static" />}
            <small className="booking-hint">{appointment ? 'Mantida na remarcação.' : 'Vem do profissional. Vira lista quando ele atende mais de uma.'}</small>
          </label>
          <div className="booking-field">
            <span className="booking-label" id={ids.duration}>Duração</span>
            <div className="segmented booking-segmented" role="group" aria-labelledby={ids.duration}>
              {QUICK.map(value => <button key={value} type="button" aria-pressed={!otherDuration && form.duration === value} onClick={() => { setOtherDuration(false); change({ duration: value }); }}>{value}</button>)}
              <button type="button" aria-pressed={otherDuration} onClick={() => setOtherDuration(true)}>Outra</button>
            </div>
            {otherDuration && <select aria-label="Duração" value={form.duration} onChange={e => change({ duration: Number(e.target.value) })}>{durationOptions(form.duration).map(value => <option value={value} key={value}>{value} minutos</option>)}</select>}
          </div>
          {!appointment && <div className="booking-field">
            <span className="booking-label" id={ids.status}>Situação</span>
            <div className="segmented booking-segmented" role="group" aria-labelledby={ids.status}>
              {(['agendada', 'confirmada'] as AppointmentStatus[]).map(value => <button key={value} type="button" aria-pressed={form.status === value} onClick={() => setForm({ ...form, status: value })}>{appointmentStatusLabels[value]}</button>)}
            </div>
          </div>}
          {current && <div className="booking-current"><span>Consulta atual</span><strong className="tabular">{current}</strong></div>}
        </section>

        <section className="booking-month" aria-label="Escolha do dia">
          <MiniCalendar key={`${form.professionalId}-${form.duration}`} size="lg" value={form.date} today={today} minDate={today} marked={() => false} onSelect={selectDay} onMonthChange={setMonth}
            dayInfo={day => { const n = day < today ? 0 : countFor(day); return { available: n > 0, disabled: n === 0, label: `${formatDayTitle(day)}, ${n ? plural(n, 'horário livre', 'horários livres') : 'sem horários'}` }; }} />
          <div className="booking-legend" aria-hidden="true"><span><i className="legend-available" />Com horários livres</span><span><i className="legend-today" />Hoje</span></div>
        </section>

        <section className="booking-times" aria-labelledby={ids.day}>
          <h3 id={ids.day} className="tabular">{dayTitle}</h3>
          {!custom && <p className="booking-hint">{plural(slots.length, `horário de ${form.duration} min livre`, `horários de ${form.duration} min livres`)}</p>}
          <div role="status" className="booking-notice">{notice}</div>
          {custom ? <div className="booking-custom">
            <label className="booking-field"><span className="booking-label">Horário de início</span>
              <TimeInput key={form.date} label="Horário de início" value={draft} onChange={typed} externalError={customIssue} externalErrorId={ids.customError} />
            </label>
            {customIssue && <small id={ids.customError} className="field-error">{customIssue}</small>}
            <button type="button" className="booking-link" onClick={() => toggleCustom(false)}>Ver horários livres</button>
          </div> : <>
            {slots.length ? <div ref={list} role="listbox" aria-label={`Horários livres, ${dayTitle}`} id={ids.times} className="booking-slots" onKeyDown={onListKey}>
              {slots.map((slot, index) => <button key={slot} type="button" role="option" aria-selected={form.start === slot} tabIndex={index === focusIndex ? 0 : -1} className="booking-slot tabular" onClick={() => chooseSlot(slot)}>{slot}</button>)}
            </div> : <p className="booking-empty">Nenhum horário livre neste dia.</p>}
            <button type="button" className="booking-link" onClick={() => toggleCustom(true)}>Outro horário…</button>
          </>}
        </section>
      </div>
      <footer className="booking-footer">
        <p className={`booking-line tabular${form.start ? '' : ' is-empty'}`}>{form.start ? appointmentSummaryLine({ date: form.date, start: form.start, duration: form.duration, professional: professional?.name, specialty: form.specialty }) : 'Escolha um horário para continuar.'}</p>
        <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={busy || !form.start}>{busy ? 'Salvando…' : appointment ? 'Salvar remarcação' : 'Agendar consulta'}</Button>
      </footer>
    </form>
  </Modal>;
}
