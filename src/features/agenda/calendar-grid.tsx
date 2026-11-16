'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { Clock3, Lock, MessageSquare, MoreHorizontal, Repeat } from 'lucide-react';
import { EmptyState, Menu, type MenuItem } from '@/components/ui';
import { formatDate, formatTime, minutes, timeFromMinutes } from '@/lib/date';
import { getAvailability } from '@/lib/metrics';
import { appointmentEnd, calendarBounds, calendarColumns, cancellationReason, CALENDAR_AXIS_WIDTH } from '@/lib/scheduling';
import { closedDaysNote, formatDayTitle, isClinicClosed, matchesAgendaStatus, offHoursBands, type AgendaView } from '@/lib/agenda-presentation';
import { appointmentStatusLabels, appointmentStatusTones } from '@/lib/status-presentation';
import type { Appointment, Block, DemoState, Professional } from '@/lib/types';
import { ProfessionalAvatar } from './professional-avatar';

export const PIXELS_PER_MINUTE = 2;
export const slotKey = (professionalId: string, date: string) => `${professionalId}|${date}`;

/** Open windows used for the hatched bands: the professional's effective hours on
 * that date, with that day's blocks added back (blocks are drawn on their own). */
export function workingWindows(state: DemoState, professionalId: string, date: string) {
  return getAvailability({ ...state, blocks: state.blocks.filter(b => !(b.professionalId === professionalId && b.date === date)) }, professionalId, date);
}

type Props = {
  state: DemoState; view: AgendaView; days: string[]; professionals: Professional[]; appointments: Appointment[];
  status: string; selectedId?: string; highlightId?: string | null; rescheduleIds: Set<string>;
  freeSlots: Map<string, string[]>; blocks: Block[]; focusFirstFree: boolean;
  strip: ReactNode;
  /** "Dia de um profissional": no column header, plain off-hours, richer cards and a docked side panel. */
  focus?: boolean; aside?: ReactNode;
  weekHref: (professionalId: string) => string; dayHref: (date: string) => string; professionalMenu: (professional: Professional) => MenuItem[];
  onSelectAppointment: (appointment: Appointment) => void; onSlot: (professionalId: string, date: string, start: string) => void; onBlock: (block: Block) => void;
};

export function CalendarCard(props: Props) {
  const { state, days, professionals, appointments, strip } = props;
  const [outsideOpen, setOutsideOpen] = useState(false);
  const outsideRef = useRef<HTMLDetailsElement>(null);
  const bounds = calendarBounds(state, days);
  const inside = bounds ? appointments.filter(a => minutes(a.start) >= bounds.start && minutes(a.start) + a.duration <= bounds.end) : [];
  const insideIds = new Set(inside.map(a => a.id));
  const outside = appointments.filter(a => !insideIds.has(a.id));
  const card = (appointment: Appointment, extra: { outside?: boolean; style?: CSSProperties } = {}) => <EventCard key={appointment.id} {...props} appointment={appointment} outside={extra.outside} style={extra.style} />;
  const clinicHours = state.clinic.hours.filter(slot => days.some(day => new Date(`${day}T12:00:00Z`).getUTCDay() === slot.day));
  const opening = clinicHours.length ? timeFromMinutes(Math.min(...clinicHours.map(s => minutes(s.start)))) : '';
  const closing = clinicHours.length ? timeFromMinutes(Math.max(...clinicHours.map(s => minutes(s.end)))) : '';
  const closedNote = days.length > 1 ? closedDaysNote(state, days) : '';
  // A single closed day (e.g. a Sunday) is a simple note, not a configuration problem.
  const closedDay = days.length === 1 && isClinicClosed(state, days[0]) && state.clinic.hours.length > 0;
  function review() {
    setOutsideOpen(true);
    requestAnimationFrame(() => { outsideRef.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); outsideRef.current?.querySelector('summary')?.focus({ preventScroll: true }); });
  }
  return <section className="card schedule-calendar" aria-label="Calendário">
    {strip}
    {bounds && outside.length > 0 && <div className="calendar-outside-notice"><Clock3 size={14} aria-hidden="true" /><span>{outside.length} {outside.length === 1 ? 'consulta fora do horário' : 'consultas fora do horário'}</span><span aria-hidden="true">·</span><button type="button" onClick={review}>Revisar</button></div>}
    {!bounds
      ? <div className="calendar-empty">{closedDay ? <EmptyState title="Clínica fechada neste dia" description={`${formatDayTitle(days[0])}: sem horário de funcionamento.`} /> : <EmptyState title="Sem expediente neste período" description="Cadastre o funcionamento da clínica em Configurações para exibir a grade de horários." />}{appointments.length > 0 && <section className="outside-hours" aria-label="Consultas preservadas"><p>{closedDay ? 'As consultas registradas para esta data continuam disponíveis abaixo.' : 'As consultas cadastradas continuam disponíveis abaixo, mesmo sem expediente configurado.'}</p><div className="outside-hours-list">{appointments.map(a => card(a, { outside: true }))}</div></section>}</div>
      : !professionals.length ? <div className="calendar-empty"><EmptyState title="Nenhum profissional neste filtro" description="Altere a especialidade ou selecione outro profissional para consultar a agenda." /></div>
      : props.aside ? <div className="calendar-split"><Grid {...props} bounds={bounds} inside={inside} card={card} />{props.aside}</div>
      : <Grid {...props} bounds={bounds} inside={inside} card={card} />}
    {bounds && outside.length > 0 && <details ref={outsideRef} className="outside-hours" open={outsideOpen} onToggle={event => setOutsideOpen(event.currentTarget.open)}><summary>Consultas fora do intervalo de funcionamento atual ({outside.length})</summary><p>Registros preservados após alterações no expediente. Abra uma consulta para ver seu histórico.</p><div className="outside-hours-list">{outside.map(a => card(a, { outside: true }))}</div></details>}
    <footer className="calendar-footer">
      <ul className="calendar-legend" aria-label="Legenda">
        <li><i className="legend-swatch legend-free" aria-hidden="true" />Horário livre</li>
        <li><i className="legend-swatch legend-block" aria-hidden="true" />Bloqueio</li>
        <li><i className="legend-swatch legend-off" aria-hidden="true" />Fora do expediente</li>
      </ul>
      <span className="calendar-footer-note">{opening ? `Clínica aberta ${opening}–${closing}${closedNote ? ` · ${closedNote}` : ''}` : 'Clínica fechada'}</span>
    </footer>
  </section>;
}

function Grid(props: Props & { bounds: { start: number; end: number }; inside: Appointment[]; card: (appointment: Appointment, extra?: { outside?: boolean; style?: CSSProperties }) => ReactNode }) {
  const { state, view, days, professionals, inside, bounds, card, freeSlots, blocks, status, focusFirstFree, appointments, focus = false } = props;
  const byProfessional = view === 'dia';
  const scroller = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<'none' | 'start' | 'middle' | 'end'>('none');
  const ppm = PIXELS_PER_MINUTE;
  const height = (bounds.end - bounds.start) * ppm;
  const columns = calendarColumns(state, days, inside, professionals, byProfessional);
  const gridColumns = `${CALENDAR_AXIS_WIDTH}px ${columns.map(column => column.closed ? `${column.width}px` : `minmax(${column.width}px, 1fr)`).join(' ')}`;
  const minWidth = CALENDAR_AXIS_WIDTH + columns.reduce((sum, column) => sum + column.width, 0);
  const hours: number[] = [];
  for (let time = Math.ceil(bounds.start / 60) * 60; time <= bounds.end; time += 60) hours.push(time);
  const nowMinute = minutes(formatTime(state.now));
  const showNow = days.includes(state.referenceDate) && nowMinute >= bounds.start && nowMinute <= bounds.end;
  const owner = (professional?: Professional) => professional ?? professionals[0];
  const columnWindows = columns.map(column => { const p = owner(column.professional); return p ? workingWindows(state, p.id, column.day) : []; });
  const firstWindow = Math.min(...columnWindows.flat().map(w => minutes(w.start)).filter(m => m >= bounds.start), Infinity);
  const scrollKey = `${view}|${days.join(',')}|${professionals.map(p => p.id).join(',')}`;
  const scrolledKey = useRef('');
  const gridLabel = `Grade de horários de ${timeFromMinutes(bounds.start)} a ${timeFromMinutes(bounds.end)}`;
  const offset = -((bounds.start % 60) * ppm);
  const initialTarget = showNow ? nowMinute - 30 : Number.isFinite(firstWindow) ? firstWindow : bounds.start;
  const initial = useRef({ scrollKey, initialTarget, start: bounds.start, focusFirstFree });
  useLayoutEffect(() => { initial.current = { scrollKey, initialTarget, start: bounds.start, focusFirstFree }; });

  // Initial position: today → 30 min before now; another day → first open window;
  // availability links → first free slot, focused. Runs once the grid has a layout
  // (the app content is hidden until the browser-local data is ready).
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    const apply = () => {
      const { scrollKey: key, initialTarget: target, start: first, focusFirstFree: focus } = initial.current;
      if (scrolledKey.current === key || !el.clientHeight) return;
      scrolledKey.current = key;
      el.scrollTop = Math.max(0, (target - first) * ppm);
      if (!focus) return;
      const slot = el.querySelector<HTMLElement>('.calendar-free-slot');
      if (slot) { el.scrollTop = Math.max(0, slot.offsetTop - 24); el.scrollLeft = Math.max(0, (slot.parentElement?.offsetLeft ?? 0) - CALENDAR_AXIS_WIDTH); slot.focus({ preventScroll: true }); }
    };
    apply();
    const observer = new ResizeObserver(apply); observer.observe(el);
    return () => observer.disconnect();
  }, [scrollKey, ppm]);

  // Height = viewport minus the grid's top (min 560); edge shadow while more columns are hidden.
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const measure = () => {
      el.style.setProperty('--grid-top', `${Math.max(0, el.getBoundingClientRect().top + window.scrollY)}px`);
      const max = el.scrollWidth - el.clientWidth;
      setEdge(max <= 1 ? 'none' : el.scrollLeft <= 1 ? 'start' : el.scrollLeft >= max - 1 ? 'end' : 'middle');
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => { observer.disconnect(); el.removeEventListener('scroll', measure); };
  }, []);

  return <div className="calendar-frame" data-edge={edge}>
    <div ref={scroller} className="calendar-scroll" role="region" aria-label={gridLabel} tabIndex={0}>
      <div className="calendar-canvas" style={{ minWidth }} data-mode={byProfessional ? 'professionals' : 'dates'} data-start-minute={bounds.start} data-end-minute={bounds.end} data-pixels-per-minute={ppm}>
        {!focus && <div className="calendar-day-headers" style={{ gridTemplateColumns: gridColumns }}>
          <div className="calendar-corner">UTC−3</div>
          {columns.map(({ key, day, professional, closed }) => {
            const count = appointments.filter(a => a.date === day && (!professional || a.professionalId === professional.id) && a.status !== 'cancelada').length;
            if (professional) return <div key={key} className="calendar-professional-header" data-professional-id={professional.id}>
              <ProfessionalAvatar professional={professional} size={34} />
              <div className="calendar-pro-text">
                <Link className="calendar-pro-name" href={props.weekHref(professional.id)} title={professional.name}>{professional.name}</Link>
                <span className="calendar-pro-meta" title={`${professional.specialties.join(' · ')} · ${count} consultas`}>{professional.specialties.join(' · ')} · {count} {count === 1 ? 'consulta' : 'consultas'}{!professional.active && ' · Inativo'}</span>
                <Link className="calendar-pro-week" href={props.weekHref(professional.id)} aria-label={`Ver semana de ${professional.name}`}>Ver semana</Link>
              </div>
              <Menu className="calendar-pro-menu" label={`Opções de ${professional.name}`} icon={<MoreHorizontal size={16} />} items={props.professionalMenu(professional)} />
            </div>;
            const today = day === state.referenceDate; const past = day < state.referenceDate;
            const weekday = formatDayTitle(day).split(',')[0];
            if (closed) return <Link key={key} href={props.dayHref(day)} className={`calendar-day-header is-closed${today ? ' is-today' : ''}`} aria-label={`${formatDayTitle(day)}, clínica fechada: ver o dia`} aria-current={today ? 'date' : undefined} title={`${weekday}: clínica fechada`}>
              <strong className="tabular">{Number(day.slice(8, 10))}</strong>
              <span className="calendar-day-name">{formatDate(day, { weekday: 'short', day: undefined, month: undefined }).replace(/^./, c => c.toUpperCase())}</span>
              <small>Fechada</small>
            </Link>;
            return <Link key={key} href={props.dayHref(day)} className={`calendar-day-header${today ? ' is-today' : ''}${past ? ' is-past' : ''}`} aria-label={`${formatDayTitle(day)}, ${count} ${count === 1 ? 'consulta' : 'consultas'}: ver o dia com todos os profissionais`} aria-current={today ? 'date' : undefined}>
              <strong className="tabular">{Number(day.slice(8, 10))}</strong>
              <span className="calendar-day-name">{weekday}{today && <span className="today-pill">Hoje</span>}</span>
              <small>{count} {count === 1 ? 'consulta' : 'consultas'}</small>
            </Link>;
          })}
        </div>}
        <div className="calendar-body" style={{ gridTemplateColumns: gridColumns }}>
          <div className="calendar-time-axis" style={{ height }}>
            {hours.map(hour => <span key={hour} className={hour === bounds.start ? 'first-tick' : ''} style={{ top: (hour - bounds.start) * ppm }}>{timeFromMinutes(hour)}</span>)}
            {showNow && <span className="calendar-now" style={{ top: (nowMinute - bounds.start) * ppm }}><span className="sr-only">Agora: </span>{timeFromMinutes(nowMinute)}</span>}
          </div>
          {columns.map(({ key, day, events, professional, closed }, index) => {
            const person = owner(professional);
            const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
            const clinicOpen = state.clinic.hours.some(slot => slot.day === weekday);
            const bands = offHoursBands(bounds, columnWindows[index], clinicOpen);
            const slots = person ? freeSlots.get(slotKey(person.id, day)) ?? [] : [];
            const columnBlocks = person ? blocks.filter(b => b.professionalId === person.id && b.date === day) : [];
            const past = day < state.referenceDate;
            return <div className={`calendar-day-column${day === state.referenceDate ? ' is-today' : ''}${past && !byProfessional ? ' is-past' : ''}${closed ? ' is-closed' : ''}`} key={key} data-date={day} data-professional-id={professional?.id} style={{ height, backgroundPositionY: `${offset}px, ${offset + 60 * ppm}px` }}>
              {bands.map(band => <div className={`calendar-off-hours${focus ? ' is-plain' : ''}`} data-kind={band.label} key={band.start} style={{ top: (band.start - bounds.start) * ppm, height: (band.end - band.start) * ppm }}>{(focus ? band.label === 'Intervalo' : band.end - band.start >= 60) && <span>{closed ? 'Fechada' : band.label}</span>}</div>)}
              {person && slots.map(start => {
                const startMinute = minutes(start);
                const label = byProfessional ? `Agendar às ${start} com ${person.name}` : `${formatDayTitle(day)}: agendar às ${start}`;
                return <button type="button" key={start} className={`calendar-free-slot${status ? ' is-dimmed' : ''}${focus ? ' is-start' : ''}`} data-professional-id={person.id} data-date={day} data-start-minute={startMinute} data-end-minute={startMinute + 30} aria-label={label} style={{ top: (startMinute - bounds.start) * ppm + 1, height: 30 * ppm - 2 }} onClick={() => props.onSlot(person.id, day, start)}>
                  <span className="slot-idle" aria-hidden="true">{focus ? `Livre · ${start}` : 'Livre'}</span><span className="slot-hover" aria-hidden="true">+ Agendar às {start}</span>
                </button>;
              })}
              {columnBlocks.map(block => {
                const start = Math.max(bounds.start, minutes(block.start)); const end = Math.min(bounds.end, minutes(block.end));
                if (end <= start) return null;
                return <button type="button" key={block.id} className="calendar-block" data-block-id={block.id} data-professional-id={block.professionalId} data-start-minute={minutes(block.start)} data-end-minute={minutes(block.end)} aria-label={`Bloqueio, ${block.reason}, ${block.start} a ${block.end}${byProfessional ? '' : `, ${formatDayTitle(day)}`}: abrir gestão do bloqueio`} style={{ top: (start - bounds.start) * ppm + 1, height: (end - start) * ppm - 2 }} onClick={() => props.onBlock(block)}>
                  <span className="block-title"><Lock size={14} aria-hidden="true" /><span>{byProfessional ? `Bloqueio · ${block.reason}` : block.reason}</span></span>
                  <span className="block-time tabular">{block.start}–{block.end}</span>
                </button>;
              })}
              {events.map(item => card(item.appointment, { style: { top: (item.start - bounds.start) * ppm + 1, height: (item.end - item.start) * ppm - 2, left: `calc(${item.lane / item.lanes * 100}% + 6px)`, width: `calc(${100 / item.lanes}% - 12px)` } }))}
            </div>;
          })}
        </div>
      </div>
    </div>
  </div>;
}

function EventCard({ state, view, status, selectedId, highlightId, rescheduleIds, appointment, outside, style, onSelectAppointment, focus = false }: Props & { appointment: Appointment; outside?: boolean; style?: CSSProperties }) {
  const patient = state.patients.find(p => p.id === appointment.patientId);
  const professional = state.professionals.find(p => p.id === appointment.professionalId)?.name ?? 'Profissional';
  const name = patient?.name ?? 'Paciente';
  const end = appointmentEnd(appointment);
  const reason = cancellationReason(appointment);
  const reschedule = rescheduleIds.has(appointment.id);
  const week = view === 'semana';
  const label = `${name}, ${appointment.start} a ${end}, ${appointmentStatusLabels[appointment.status]}${reschedule ? ', pediu remarcação' : ''}${week || outside ? `, com ${professional}` : ''}${outside ? `, ${formatDate(appointment.date, { day: 'numeric', month: 'long' })}` : ''}${reason ? ', com motivo de cancelamento registrado' : ''}`;
  const compact = appointment.duration < 30 && !outside;
  const classes = ['calendar-event', outside && 'outside-event', compact && 'is-compact', appointment.duration >= 60 && !outside && 'is-long',
    (appointment.status === 'realizada' || appointment.status === 'falta') && 'is-past', appointment.status === 'cancelada' && 'is-cancelled',
    selectedId === appointment.id && 'is-selected', highlightId === appointment.id && 'is-highlighted', !matchesAgendaStatus(appointment, status, state.now) && 'is-dimmed'].filter(Boolean).join(' ');
  return <button type="button" className={classes} style={style} data-appointment-id={appointment.id} data-status={appointment.status} data-tone={appointmentStatusTones[appointment.status]} data-start-minute={minutes(appointment.start)} data-end-minute={minutes(appointment.start) + appointment.duration} data-duration={appointment.duration} aria-label={label} title={label} onClick={() => onSelectAppointment(appointment)}>
    <span className="event-line" aria-hidden="true" />
    {outside && <span className="outside-event-date">{formatDate(appointment.date)} · {professional}</span>}
    <span className="event-row">
      <strong className="event-patient">{name}</strong>
      {reason && <span className="event-cancel-note" title="Motivo do cancelamento registrado"><MessageSquare size={13} aria-hidden="true" /><span className="sr-only">Com motivo</span></span>}
      {reschedule && !compact && <span className={`event-flag${week ? ' is-icon' : ''}`}><Repeat size={11} aria-hidden="true" />{week ? <span className="sr-only">Pediu remarcação</span> : 'Remarcar'}</span>}
      {compact && <span className="event-time tabular">· {appointment.start}</span>}
    </span>
    {!compact && <span className="event-meta"><span className="event-time tabular">{appointment.start}–{end}</span><span className="event-dot" aria-hidden="true">·</span><span className="event-status">{appointmentStatusLabels[appointment.status]}</span>{focus && !outside && <><span className="event-dot" aria-hidden="true">·</span><span className="event-insurance">{patient?.insurance || 'Particular'}</span></>}</span>}
    {!compact && !outside && appointment.duration >= 60 && <span className="event-extra">{focus ? appointment.specialty : `${appointment.specialty} · ${patient?.insurance || 'Particular'}`}</span>}
  </button>;
}
