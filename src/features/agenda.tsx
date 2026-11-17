'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarRange, ChevronLeft, ChevronRight, Clock3, ListChecks, Lock, Plus } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { can, currentUser } from '@/lib/permissions';
import { Button, Drawer, EmptyState, PageHeading, useIsNarrow, useMediaQuery, type MenuItem } from '@/components/ui';
import { parseDateInput } from '@/components/date-time-fields';
import { addDays, weekStart } from '@/lib/date';
import { getFreeSlots } from '@/lib/metrics';
import { agendaProfessionals, isOpenAppointment } from '@/lib/scheduling';
import { countByStatus, isClinicClosed, matchesAgendaStatus, rangeTitle, rescheduleRequestIds, resolveAgendaView, statusChipLabels, statusChipOrder } from '@/lib/agenda-presentation';
import { appointmentStatusTones } from '@/lib/status-presentation';
import type { Appointment, Block, Professional } from '@/lib/types';
import { AppointmentForm } from './agenda/appointment-form';
import { AppointmentDetails } from './agenda/appointment-details';
import { BlockForm } from './agenda/block-form';
import { CalendarCard, slotKey } from './agenda/calendar-grid';
import { AgendaDayTable } from './agenda/agenda-list';
import { ActiveFilterChips, DatePicker, FiltersPopover, ProfessionalPicker, shiftDate } from './agenda/agenda-toolbar';
import { ProfessionalAvatar } from '@/components/professional-avatar';
import { DayPanel } from './agenda/day-panel';
import { breakpointQuery } from '@/lib/breakpoints';

const byTime = (a: Appointment, b: Appointment) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`);

export function Agenda() {
  const { state } = useDemo(); const params = useSearchParams(); const router = useRouter();
  const narrow = useIsNarrow();
  const docked = useMediaQuery(breakpointQuery('lg'), true);
  const date = parseDateInput(params.get('date') || '') || state.referenceDate;
  const professionalId = params.get('professional') ?? ''; const patientId = params.get('patient') ?? '';
  const specialty = params.get('specialty') ?? ''; const status = params.get('status') ?? (params.get('planned') === '1' ? 'previstas' : '');
  const view = resolveAgendaView(params);
  const from = parseDateInput(params.get('from') || ''); const to = parseDateInput(params.get('to') || '');
  const hasRange = !!from || !!to;
  const context = params.get('context');
  const editRequested = state.appointments.find(a => a.id === params.get('edit'));
  const editing = editRequested && isOpenAppointment(editRequested) ? editRequested : undefined;
  const detail = state.appointments.find(a => a.id === params.get('appointment'));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [blockDraft, setBlockDraft] = useState<{ professionalId: string; date: string; block?: Block } | null>(null);
  // Availability lives in Configurações (administration); the reception edits blocks here.
  const manageAvailability = can(currentUser(state), 'clinic.manage');
  const openBlock = (block: Block) => manageAvailability
    ? router.push(`/gestao/configuracoes?tab=availability&professional=${block.professionalId}&block=${block.id}`)
    : setBlockDraft({ professionalId: block.professionalId, date: block.date, block });
  const [saved, setSaved] = useState<{ id?: string; before: Set<string> } | null>(null);
  const [mobileIndex, setMobileIndex] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => {
    if (!selected || !docked) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('.modal-overlay, .drawer-overlay, .popover, .menu-list')) return;
      closeSelection();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  useEffect(() => { if (!saved) return; const timer = setTimeout(() => setSaved(null), 1400); return () => clearTimeout(timer); }, [saved]);

  const scoped = (a: Appointment) => (!patientId || a.patientId === patientId) && (!specialty || a.specialty === specialty);
  const filtered = state.appointments.filter(a => scoped(a) && (!professionalId || a.professionalId === professionalId));
  const start = weekStart(date);
  // The week always shows all seven days; closed days become compact columns.
  const days = view === 'semana' ? Array.from({ length: 7 }, (_, i) => addDays(start, i)) : [date];
  const periodStart = hasRange ? from ?? date : days[0];
  const periodEnd = hasRange ? to ?? date : days.at(-1)!;
  const periodAppointments = filtered.filter(a => a.date >= periodStart && a.date <= periodEnd).sort(byTime);
  const counts = countByStatus(periodAppointments);
  const matching = periodAppointments.filter(a => matchesAgendaStatus(a, status, state.now));
  const rescheduleIds = rescheduleRequestIds(state);
  const professionals = agendaProfessionals(state, periodAppointments, professionalId, specialty);
  const mobileSwitch = narrow && view === 'dia' && professionals.length > 1;
  const mobileCurrent = Math.min(mobileIndex, Math.max(0, professionals.length - 1));
  const gridProfessionals = mobileSwitch ? professionals.slice(mobileCurrent, mobileCurrent + 1) : professionals;
  const freeSlots = new Map<string, string[]>();
  for (const professional of professionals) for (const day of days) freeSlots.set(slotKey(professional.id, day), getFreeSlots(state, professional.id, day));
  const freeCount = [...freeSlots.values()].reduce((sum, slots) => sum + slots.length, 0);
  const ids = new Set(professionals.map(p => p.id));
  const blocks = state.blocks.filter(b => ids.has(b.professionalId) && days.includes(b.date));
  // `availability=1` (Início, conversation assistant) and the legacy `view=week&professional=`
  // links of the free-slots assistant used to open the side panel: now they focus the first free slot.
  const highlightId = saved ? saved.id ?? state.appointments.find(a => !saved.before.has(a.id))?.id ?? null : null;

  // "Dia de um profissional" (≥768): a click selects in the side panel (`selected=ID`,
  // so "back" works) instead of opening the modal; `appointment=ID` still opens it.
  const focusMode = view === 'dia' && !!professionalId && !hasRange && !narrow && professionals.length === 1;
  const focusProfessional = focusMode ? professionals[0] : undefined;
  const selected = focusMode ? state.appointments.find(a => a.id === params.get('selected')) : undefined;

  function href(changes: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => value ? query.set(key, value) : query.delete(key));
    return `/gestao/agenda?${query}`;
  }
  function update(changes: Record<string, string | null>) { router.push(href(changes), { scroll: false }); }
  const changeDate = (value: string) => update({ date: value, selected: null });
  function closeSelection() {
    const id = selected?.id; update({ selected: null });
    if (id) requestAnimationFrame(() => document.querySelector<HTMLElement>(`.calendar-scroll [data-appointment-id="${id}"]`)?.focus());
  }
  const selectAppointment = (a: Appointment) => update(focusMode ? { selected: a.id } : { appointment: a.id });
  function closeForm() { update({ new: null, edit: null, start: null, slotProfessional: null }); }
  const weekHref = (id: string) => href({ professional: id, view: 'semana', from: null, to: null });
  const dayHref = (day: string) => href({ date: day, professional: null, view: 'dia', from: null, to: null });
  const backToAgenda = () => update({ from: null, to: null, date: periodStart, view: 'dia' });
  const openSlot = (id: string, day: string, time: string) => update({ new: '1', start: time, date: day, slotProfessional: id === professionalId ? null : id, appointment: null, edit: null });
  const professionalMenu = (professional: Professional): MenuItem[] => [
    { label: 'Ver semana', icon: <CalendarRange size={16} />, onSelect: () => router.push(weekHref(professional.id), { scroll: false }) },
    ...(manageAvailability ? [{ label: 'Gerenciar disponibilidade', icon: <Clock3 size={16} />, onSelect: () => router.push(`/gestao/configuracoes?tab=availability&professional=${professional.id}`) }] : []),
    { label: 'Bloquear horário', icon: <Lock size={16} />, onSelect: () => setBlockDraft({ professionalId: professional.id, date }) },
  ];
  function chooseView(next: 'dia' | 'semana') {
    if (next === 'semana' && !professionalId) { setPickerOpen(true); return; }
    update({ view: next });
  }

  const nonCancelled = (a: Appointment) => a.status !== 'cancelada';
  const marked = new Set(state.appointments.filter(a => scoped(a) && (!professionalId || a.professionalId === professionalId) && matchesAgendaStatus(a, status, state.now)).map(a => a.date));
  const blocksCount = blocks.length;
  const stripNote = hasRange ? `${matching.length} ${matching.length === 1 ? 'consulta' : 'consultas'} no recorte`
    : view === 'semana' ? `${freeCount} ${freeCount === 1 ? 'horário livre' : 'horários livres'} na semana · ${blocksCount} ${blocksCount === 1 ? 'bloqueio' : 'bloqueios'}`
    : `${freeCount} ${freeCount === 1 ? 'horário livre' : 'horários livres'} · Recife (UTC−3)`;
  const strip = <div className="status-strip">
    <div className="status-chips" role="group" aria-label="Filtrar por situação">
      <button type="button" className="status-chip" aria-pressed={!status} onClick={() => update({ status: null, planned: null })}>Todas <span className="chip-count tabular">{counts.todas}</span></button>
      {statusChipOrder.map(value => <button type="button" key={value} className="status-chip" data-tone={appointmentStatusTones[value]} aria-pressed={status === value} onClick={() => update({ status: status === value ? null : value, planned: null })}>
        <i className="status-dot" aria-hidden="true" />{statusChipLabels[value]} <span className="chip-count tabular">{counts[value]}</span>
      </button>)}
    </div>
    <span className="status-strip-note">{stripNote}</span>
    {focusMode && !docked && <Button variant="secondary" className="day-summary-trigger" aria-haspopup="dialog" onClick={() => setSummaryOpen(true)}><ListChecks size={16} />Resumo do dia</Button>}
  </div>;
  const switcher = mobileSwitch && <div className="mobile-pro-switch">
    <Button variant="ghost" size="icon" aria-label="Profissional anterior" disabled={mobileCurrent === 0} onClick={() => setMobileIndex(mobileCurrent - 1)}><ChevronLeft size={18} /></Button>
    <div className="mobile-pro-current" aria-live="polite"><ProfessionalAvatar professional={professionals[mobileCurrent]} size={26} /><span><strong>{professionals[mobileCurrent].name}</strong><small>{mobileCurrent + 1} de {professionals.length} profissionais</small></span></div>
    <Button variant="ghost" size="icon" aria-label="Próximo profissional" disabled={mobileCurrent === professionals.length - 1} onClick={() => setMobileIndex(mobileCurrent + 1)}><ChevronRight size={18} /></Button>
  </div>;
  const panelProps = focusProfessional && {
    state, professional: focusProfessional, date, appointments: periodAppointments.filter(a => a.professionalId === focusProfessional.id),
    freeSlots: freeSlots.get(slotKey(focusProfessional.id, date)) ?? [], blocks: blocks.filter(b => b.professionalId === focusProfessional.id),
    selected, rescheduleIds, context, weekHref: weekHref(focusProfessional.id),
    marked: (day: string) => state.appointments.some(a => a.professionalId === focusProfessional.id && a.date === day),
    onSelectDate: changeDate, onSelect: (a: Appointment) => { setSummaryOpen(false); update({ selected: a.id }); }, onCloseSelection: closeSelection,
    onOpenDetails: (a: Appointment) => update({ appointment: a.id }), onReschedule: (a: Appointment) => update({ edit: a.id, selected: null }),
    onSlot: (time: string) => { setSummaryOpen(false); openSlot(focusProfessional.id, date, time); },
    onBlock: openBlock, manageAvailability,
    onBlockTime: () => { setSummaryOpen(false); setBlockDraft({ professionalId: focusProfessional.id, date }); },
  };
  const aside = panelProps && docked ? <aside className="day-panel" aria-label="Painel do dia"><DayPanel {...panelProps} mode="both" /></aside> : undefined;
  let content: ReactNode;
  if (hasRange || (narrow && view === 'semana')) {
    const groups = hasRange ? [...new Set(matching.map(a => a.date))] : days;
    content = <section className="card schedule-calendar agenda-list-card" aria-label="Consultas">
      {strip}
      {groups.length ? <div className="agenda-day-groups">{groups.map(day => <AgendaDayTable key={day} state={state} date={day} rescheduleIds={rescheduleIds} appointments={matching.filter(a => a.date === day)} onOpen={a => update({ appointment: a.id })}
        closed={!hasRange && isClinicClosed(state, day)} freeSlots={!hasRange && professionals[0] ? freeSlots.get(slotKey(professionals[0].id, day)) : undefined} onSlot={time => professionals[0] && openSlot(professionals[0].id, day, time)} />)}</div>
        : <EmptyState title="Nenhuma consulta neste período"><Button variant="secondary" onClick={backToAgenda}>Voltar à agenda</Button></EmptyState>}
    </section>;
  } else {
    content = <CalendarCard state={state} view={view} days={days} professionals={gridProfessionals} appointments={periodAppointments.filter(a => !mobileSwitch || a.professionalId === gridProfessionals[0]?.id)} status={status}
      highlightId={highlightId} rescheduleIds={rescheduleIds} freeSlots={freeSlots} blocks={blocks} focusFirstFree={params.has('availability') || (params.get('view') === 'week' && !!professionalId)}
      strip={<>{strip}{switcher}</>} weekHref={weekHref} dayHref={dayHref} professionalMenu={professionalMenu}
      focus={focusMode} aside={aside} selectedId={selected?.id ?? detail?.id}
      onSelectAppointment={selectAppointment} onSlot={openSlot} onBlock={openBlock} />;
  }

  return <div data-density="compact" className="page-stack agenda-page">
    <PageHeading title="Agenda" actions={<>
      {!hasRange && <div className="segmented agenda-view-switch" role="group" aria-label="Visualização">
        <button type="button" aria-pressed={view === 'dia'} onClick={() => chooseView('dia')}>Dia</button>
        <button type="button" aria-pressed={view === 'semana'} onClick={() => chooseView('semana')}>Semana</button>
      </div>}
      <Button data-density="standard" onClick={() => update({ new: '1', edit: null, appointment: null, start: null, slotProfessional: null })}><Plus size={16} />Novo agendamento</Button>
    </>} />
    {context && <Link className="text-link" href={`/conversas?id=${encodeURIComponent(context)}`}><ArrowLeft size={16} />Voltar à conversa</Link>}
    {params.has('edit') && !editing && <div className="notice">{editRequested ? 'Consultas finalizadas ou canceladas mantêm seu histórico e não podem ser remarcadas.' : 'Consulta não encontrada.'}<Button variant="ghost" onClick={() => update({ edit: null, appointment: editRequested?.id ?? null })}>Ver agenda</Button></div>}
    {hasRange && <div className="agenda-range-context"><h2>{rangeTitle(periodStart, periodEnd, status)}</h2><Button variant="secondary" onClick={backToAgenda}><ArrowLeft size={16} />Voltar à agenda</Button></div>}
    <div className="agenda-controls" data-density="standard">
      <div className="agenda-toolbar">
        {!hasRange && <div className="agenda-nav">
          <Button variant="secondary" onClick={() => changeDate(state.referenceDate)}>Hoje</Button>
          <Button variant="ghost" size="icon" aria-label={view === 'semana' ? 'Semana anterior' : 'Dia anterior'} onClick={() => changeDate(shiftDate(date, view, -1))}><ChevronLeft size={18} /></Button>
          <Button variant="ghost" size="icon" aria-label={view === 'semana' ? 'Próxima semana' : 'Próximo dia'} onClick={() => changeDate(shiftDate(date, view, 1))}><ChevronRight size={18} /></Button>
          <DatePicker key={`${date}-${view}`} view={view} date={date} days={days} today={state.referenceDate} marked={day => marked.has(day)} onChange={changeDate} />
        </div>}
        <div className="agenda-scope">
          <ProfessionalPicker state={state} professionalId={professionalId} open={pickerOpen} onOpenChange={setPickerOpen}
            todayCount={id => state.appointments.filter(a => a.professionalId === id && a.date === state.referenceDate && nonCancelled(a)).length}
            dayCount={state.appointments.filter(a => a.date === date && scoped(a) && nonCancelled(a)).length}
            onSelect={id => update(hasRange ? { professional: id || null } : { professional: id || null, view: id ? 'semana' : 'dia' })}
            onClear={() => update(hasRange ? { professional: null } : { professional: null, view: 'dia' })} />
          <FiltersPopover state={state} patientId={patientId} specialty={specialty} onChange={update} />
        </div>
      </div>
      <ActiveFilterChips state={state} patientId={patientId} specialty={specialty} status={status} onChange={update} />
    </div>
    {content}
    {(params.get('new') === '1' || editing) && <AppointmentForm key={editing?.id ?? `${date}-${professionalId}-${params.get('slotProfessional')}-${params.get('start')}`} appointment={editing} patientId={patientId} professionalId={params.get('slotProfessional') || professionalId} initialDate={date} initialStart={params.get('start') ?? undefined} onClose={closeForm} onSaved={() => setSaved({ id: editing?.id, before: new Set(state.appointments.map(a => a.id)) })} />}
    {detail && !editing && params.get('new') !== '1' && <AppointmentDetails key={detail.id} appointment={detail} onClose={() => update({ appointment: null })} onReschedule={() => update({ appointment: null, edit: detail.id })} />}
    {panelProps && !docked && selected && !detail && !editing && <Drawer label={`Consulta de ${state.patients.find(p => p.id === selected.patientId)?.name ?? 'paciente'}`} side="right" className="day-panel-drawer" onClose={closeSelection}><DayPanel {...panelProps} mode="selection" /></Drawer>}
    {panelProps && !docked && summaryOpen && !selected && <Drawer label="Resumo do dia" side="right" className="day-panel-drawer" onClose={() => setSummaryOpen(false)}>
      <div className="drawer-close"><Button variant="ghost" size="icon" aria-label="Fechar resumo" onClick={() => setSummaryOpen(false)}><ChevronRight size={18} /></Button></div>
      <DayPanel {...panelProps} mode="summary" />
    </Drawer>}
    {blockDraft && <BlockForm block={blockDraft.block} professionalId={blockDraft.professionalId} initialDate={blockDraft.date} onClose={() => setBlockDraft(null)} />}
  </div>;
}
