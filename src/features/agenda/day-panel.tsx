'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CalendarRange, Clock3, FileText, Lock, Maximize2, Phone, Repeat, ShieldCheck, Stethoscope, X } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { dateTime } from '@/lib/date';
import { getAvailability } from '@/lib/metrics';
import { appointmentEnd, isOpenAppointment } from '@/lib/scheduling';
import { formatDayTitle } from '@/lib/agenda-presentation';
import { appointmentStatusLabels, appointmentStatusTones } from '@/lib/status-presentation';
import type { Appointment, Block, DemoState, Professional } from '@/lib/types';
import { AppointmentActions } from './appointment-actions';
import { MiniCalendar } from './agenda-toolbar';

const SLOT_PREVIEW = 8;

type Props = {
  state: DemoState; professional: Professional; date: string; appointments: Appointment[]; freeSlots: string[]; blocks: Block[];
  selected?: Appointment; rescheduleIds: Set<string>; context: string | null; marked: (date: string) => boolean;
  /** `both` = docked panel (calendar + summary/selection); the drawer shows one part. */
  mode: 'both' | 'summary' | 'selection';
  weekHref: string; manageAvailability: boolean; onSelectDate: (date: string) => void; onSelect: (appointment: Appointment) => void; onCloseSelection: () => void;
  onOpenDetails: (appointment: Appointment) => void; onReschedule: (appointment: Appointment) => void; onSlot: (start: string) => void;
  onBlock: (block: Block) => void; onBlockTime: () => void;
};

/** Side panel of "Dia de um profissional": month calendar on top, then either the day
 * summary or the selected appointment (with the same actions as the details modal). */
export function DayPanel(props: Props) {
  const { state, date, selected, mode } = props;
  return <div className="day-panel-body" data-mode={mode}>
    {mode === 'both' && <><div className="day-panel-calendar">
      <MiniCalendar key={date} value={date} today={state.referenceDate} marked={props.marked} onSelect={props.onSelectDate} />
    </div><hr className="day-panel-separator" /></>}
    {selected && mode !== 'summary' ? <Selection {...props} appointment={selected} /> : <Summary {...props} />}
  </div>;
}

function Summary({ state, professional, date, appointments, freeSlots, blocks, weekHref, manageAvailability, onSelect, onSlot, onBlock, onBlockTime }: Props) {
  const [expanded, setExpanded] = useState(false);
  const windows = getAvailability(state, professional.id, date);
  const now = new Date(state.now).getTime();
  const next = appointments.filter(a => isOpenAppointment(a) && new Date(dateTime(a.date, appointmentEnd(a))).getTime() > now).slice(0, 3);
  const shown = expanded ? freeSlots : freeSlots.slice(0, SLOT_PREVIEW);
  return <section className="day-panel-summary" aria-labelledby="day-summary-title">
    <h3 id="day-summary-title" className="day-panel-title">Resumo do dia</h3>
    <p className="day-panel-hours"><Clock3 size={16} aria-hidden="true" />{windows.length ? `Atendimento: ${windows.map(w => `${w.start}–${w.end}`).join(' · ')}` : 'Sem atendimento neste dia'}</p>
    <h4 className="day-panel-subtitle">Próximos pacientes</h4>
    {next.length ? <ul className="day-panel-next">{next.map(a => {
      const name = state.patients.find(p => p.id === a.patientId)?.name ?? 'Paciente';
      return <li key={a.id}><button type="button" className="day-panel-row" data-appointment-id={a.id} aria-label={`${a.start}, ${name}, ${appointmentStatusLabels[a.status]}: ver no painel`} onClick={() => onSelect(a)}>
        <span className="tabular day-panel-time">{a.start}</span><span className="day-panel-name">{name}</span><Badge tone={appointmentStatusTones[a.status]}>{appointmentStatusLabels[a.status]}</Badge>
      </button></li>;
    })}</ul> : <p className="day-panel-empty">Nenhuma consulta a seguir.</p>}
    <h4 className="day-panel-subtitle">Horários livres</h4>
    {freeSlots.length ? <div className="day-panel-slots" role="group" aria-label="Horários livres">
      {shown.map(start => <button key={start} type="button" className="calendar-free-chip tabular" aria-label={`Agendar às ${start} com ${professional.name}`} onClick={() => onSlot(start)}>{start}</button>)}
      {freeSlots.length > SLOT_PREVIEW && <button type="button" className="footer-link day-panel-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Ver menos' : `Ver mais ${freeSlots.length - SLOT_PREVIEW}`}</button>}
    </div> : <p className="day-panel-empty">Sem horários livres.</p>}
    <h4 className="day-panel-subtitle">Bloqueios</h4>
    {blocks.length ? <ul className="day-panel-blocks">{blocks.map(block => <li key={block.id}><button type="button" className="day-panel-row" data-block-id={block.id} aria-label={`Bloqueio, ${block.start} a ${block.end}, ${block.reason}: abrir gestão do bloqueio`} onClick={() => onBlock(block)}>
      <Lock size={14} aria-hidden="true" /><span className="tabular day-panel-time">{block.start}–{block.end}</span><span className="day-panel-name">{block.reason}</span>
    </button></li>)}</ul> : <p className="day-panel-empty">Nenhum bloqueio</p>}
    <footer className="day-panel-links">
      <Link className="text-link" href={weekHref}><CalendarRange size={16} aria-hidden="true" />Ver semana</Link>
      {manageAvailability && <Link className="text-link" href={`/gestao/configuracoes?tab=availability&professional=${professional.id}`}><Clock3 size={16} aria-hidden="true" />Gerenciar disponibilidade</Link>}
      <button type="button" className="text-link" onClick={onBlockTime}><Lock size={16} aria-hidden="true" />Bloquear horário</button>
    </footer>
  </section>;
}

function Selection({ state, appointment, rescheduleIds, context, onCloseSelection, onOpenDetails, onReschedule }: Props & { appointment: Appointment }) {
  const patient = state.patients.find(p => p.id === appointment.patientId);
  const professional = state.professionals.find(p => p.id === appointment.professionalId);
  const name = patient?.name ?? 'Paciente';
  return <section className="day-panel-selection" aria-labelledby="day-selection-title">
    <header className="day-panel-selection-head">
      <div><h3 id="day-selection-title">{name}</h3><Badge tone={appointmentStatusTones[appointment.status]}>{appointmentStatusLabels[appointment.status]}</Badge></div>
      <div className="day-panel-selection-tools">
        <Button variant="ghost" size="icon" aria-label="Abrir detalhes completos" title="Abrir detalhes completos" onClick={() => onOpenDetails(appointment)}><Maximize2 size={16} /></Button>
        <Button variant="ghost" size="icon" aria-label="Fechar" title="Fechar" onClick={onCloseSelection}><X size={16} /></Button>
      </div>
    </header>
    <ul className="day-panel-facts">
      <li><CalendarDays size={16} aria-hidden="true" />{formatDayTitle(appointment.date)}</li>
      <li><Clock3 size={16} aria-hidden="true" /><span className="tabular">{appointment.start}–{appointmentEnd(appointment)}</span> · {appointment.duration} min</li>
      <li><Stethoscope size={16} aria-hidden="true" />{professional?.name} · {appointment.specialty}</li>
      <li><ShieldCheck size={16} aria-hidden="true" />{patient?.insurance || 'Particular'}</li>
      {patient?.phone && <li><Phone size={16} aria-hidden="true" /><a className="day-panel-phone" href={`tel:${patient.phone.replace(/[^\d+]/g, '')}`}>{patient.phone}</a></li>}
      {patient?.notes && <li><FileText size={16} aria-hidden="true" />{patient.notes}</li>}
      {rescheduleIds.has(appointment.id) && <li><Repeat size={16} aria-hidden="true" /><span className="event-flag">Pediu remarcação</span></li>}
    </ul>
    <div className="day-panel-actions"><AppointmentActions key={appointment.id} appointment={appointment} onReschedule={() => onReschedule(appointment)} compact /></div>
    <Link className="text-link" href={`/gestao/pacientes?id=${appointment.patientId}${context ? `&context=${encodeURIComponent(context)}` : ''}`}>Ver cadastro do paciente</Link>
  </section>;
}
