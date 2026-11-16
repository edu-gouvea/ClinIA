'use client';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Filter as Funnel, X } from 'lucide-react';
import { Button, Field, Popover, SearchInput } from '@/components/ui';
import { DateInput } from '@/components/date-time-fields';
import { addDays } from '@/lib/date';
import { formatDayTitle, formatMonthTitle, formatWeekTitle, legacyStatusLabels, type AgendaView } from '@/lib/agenda-presentation';
import type { DemoState, Professional } from '@/lib/types';
import { ProfessionalAvatar } from './professional-avatar';

const monthStart = (date: string) => `${date.slice(0, 8)}01`;
const addMonths = (date: string, amount: number) => {
  const value = new Date(`${monthStart(date)}T12:00:00Z`); value.setUTCMonth(value.getUTCMonth() + amount);
  const last = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  return `${value.toISOString().slice(0, 8)}${String(Math.min(Number(date.slice(8, 10)), last)).padStart(2, '0')}`;
};
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Month grid (Sunday first). Arrows move by day/week, Home/End to the week edges,
 * PageUp/PageDown by month; only the focused day is in the tab order.
 * Optional (booking form): `dayInfo` gives each day an availability state, label and
 * `aria-disabled` (still focusable, so arrow keys can cross unavailable days);
 * `minDate` stops navigation before its month; `size="lg"` is the large variant with
 * the year in a subtle tone and in-month days only. */
export type DayInfo = { disabled?: boolean; available?: boolean; label?: string };
export function MiniCalendar({ value, today, marked, onSelect, dayInfo, minDate, size, onMonthChange }: { value: string; today: string; marked: (date: string) => boolean; onSelect: (date: string) => void; dayInfo?: (date: string) => DayInfo; minDate?: string; size?: 'lg'; onMonthChange?: (month: string) => void }) {
  const [focused, setFocused] = useState(value);
  const moved = useRef(false);
  const grid = useRef<HTMLTableElement>(null);
  useEffect(() => { if (moved.current) { grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus(); moved.current = false; } }, [focused]);
  const first = monthStart(focused);
  useEffect(() => { onMonthChange?.(first.slice(0, 7)); }, [first, onMonthChange]);
  const start = addDays(first, -weekday(first));
  const weeks = Array.from({ length: 6 }, (_, row) => Array.from({ length: 7 }, (_, col) => addDays(start, row * 7 + col)));
  const visibleWeeks = weeks.filter(week => week.some(day => day.slice(0, 7) === first.slice(0, 7)));
  const clamp = (next: string) => minDate && next < minDate ? minDate : next;
  const go = (next: string) => { moved.current = true; setFocused(clamp(next)); };
  const atMin = !!minDate && first <= monthStart(minDate);
  function onKeyDown(event: KeyboardEvent) {
    const map: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1), ArrowRight: () => addDays(focused, 1), ArrowUp: () => addDays(focused, -7), ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -weekday(focused)), End: () => addDays(focused, 6 - weekday(focused)),
      PageUp: () => addMonths(focused, -1), PageDown: () => addMonths(focused, 1),
    };
    if (!map[event.key]) return;
    event.preventDefault(); go(map[event.key]());
  }
  const title = formatMonthTitle(first);
  const large = size === 'lg';
  return <div className={`mini-calendar${large ? ' mini-calendar-lg' : ''}`}>
    <div className="mini-calendar-heading">
      {large && <strong aria-live="polite" className="mini-calendar-title">{title.slice(0, -5)} <span>{title.slice(-4)}</span></strong>}
      <Button variant="ghost" size="icon" aria-label="Mês anterior" disabled={atMin} onClick={() => setFocused(clamp(addMonths(focused, -1)))}><ChevronLeft size={16} /></Button>
      {!large && <strong aria-live="polite">{title}</strong>}
      <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => setFocused(addMonths(focused, 1))}><ChevronRight size={16} /></Button>
    </div>
    <table ref={grid} role="grid" aria-label={title} onKeyDown={onKeyDown}>
      <thead><tr>{['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map(name => <th key={name} scope="col" abbr={name}>{large ? name.slice(0, 3).toLocaleUpperCase('pt-BR') : name[0]}</th>)}</tr></thead>
      <tbody>{visibleWeeks.map(week => <tr key={week[0]}>{week.map(day => {
        const outsideMonth = day.slice(0, 7) !== first.slice(0, 7); const has = marked(day);
        if (large && outsideMonth) return <td key={day} role="gridcell" />;
        const info = dayInfo?.(day);
        return <td key={day} role="gridcell" aria-selected={day === value}>
          <button type="button" data-date={day} tabIndex={day === focused ? 0 : -1} aria-disabled={info?.disabled || undefined} className={`mini-day${outsideMonth ? ' is-outside' : ''}${day === value ? ' is-selected' : ''}${day === today ? ' is-today' : ''}${info?.available ? ' is-available' : ''}${info?.disabled ? ' is-disabled' : ''}`} aria-current={day === today ? 'date' : undefined} aria-label={info?.label ?? `${formatDayTitle(day)} de ${day.slice(0, 4)}${has ? ', com consultas' : ''}`} onClick={() => { if (!info?.disabled) onSelect(day); }} onFocus={() => setFocused(day)}>
            {Number(day.slice(8, 10))}{(has || (large && day === today)) && <i className={day < today ? 'is-past' : ''} aria-hidden="true" />}
          </button>
        </td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}

export function DatePicker({ view, date, days, today, marked, onChange }: { view: AgendaView; date: string; days: string[]; today: string; marked: (date: string) => boolean; onChange: (date: string) => void }) {
  const week = view === 'semana' ? formatWeekTitle(days[0], days.at(-1)!) : null;
  const title = week ? week.title : formatDayTitle(date);
  const year = week ? week.year : date.slice(0, 4);
  return <Popover label="Escolher data" wrapperClassName="agenda-date" triggerClassName="btn btn-ghost agenda-date-trigger" triggerLabel={`${week ? `Semana de ${title}` : title} de ${year}. Escolher data`}
    triggerContent={<><span className="agenda-date-title">{title}</span><span className="agenda-date-year tabular">{year}</span><ChevronDown size={16} aria-hidden="true" /></>} className="date-popover">
    {close => <div className="popover-stack">
      {/* DateInput commits on blur too; only a different date navigates and closes. */}
      <Field label="Data"><DateInput label="Data" required value={date} onChange={value => { if (value && value !== date) { onChange(value); close(); } }} /></Field>
      <MiniCalendar value={date} today={today} marked={marked} onSelect={value => { onChange(value); close(); }} />
    </div>}
  </Popover>;
}

type ProfessionalOption = { id: string; title: string; sub: string; professional?: Professional };
export function ProfessionalPicker({ state, professionalId, open, onOpenChange, todayCount, dayCount, onSelect, onClear }: {
  state: DemoState; professionalId: string; open: boolean; onOpenChange: (open: boolean) => void;
  todayCount: (id: string) => number; dayCount: number; onSelect: (id: string) => void; onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const active = state.professionals.filter(p => p.active);
  const selected = state.professionals.find(p => p.id === professionalId);
  const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const options: ProfessionalOption[] = [
    { id: '', title: 'Todos os profissionais', sub: `Dia por profissional · ${dayCount} ${dayCount === 1 ? 'consulta' : 'consultas'}` },
    ...active.map(p => ({ id: p.id, title: p.name, sub: `${p.specialties.join(' · ')} · ${todayCount(p.id)} hoje`, professional: p })),
  ].filter(option => !query || normalize(`${option.title} ${option.sub}`).includes(normalize(query)));
  const items = () => Array.from(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
  function move(event: KeyboardEvent, from: number) {
    const all = items(); let next = -2;
    if (event.key === 'ArrowDown') next = Math.min(all.length - 1, from + 1);
    else if (event.key === 'ArrowUp') next = from - 1;
    else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = all.length - 1;
    if (next === -2) return;
    event.preventDefault();
    if (next < 0) list.current?.closest('.popover, .popover-sheet')?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    else all[next]?.focus();
  }
  const choose = (id: string, close: () => void) => { setQuery(''); close(); onSelect(id); };
  const trigger = selected
    ? <><ProfessionalAvatar professional={selected} size={22} /><span className="picker-name">{selected.name}</span><span className="picker-sub">· {selected.specialties.join(' · ')}</span><ChevronDown size={16} aria-hidden="true" /></>
    : <><span className="avatar-stack" aria-hidden="true">{active.slice(0, 4).map(p => <ProfessionalAvatar key={p.id} professional={p} size={22} />)}{active.length > 4 && <span className="avatar-more">+{active.length - 4}</span>}</span><span className="picker-name">Todos os profissionais</span><ChevronDown size={16} aria-hidden="true" /></>;
  return <div className={`professional-picker${selected ? ' has-selection' : ''}`}>
    <Popover label="Escolher profissional" open={open} onOpenChange={next => { onOpenChange(next); if (!next) setQuery(''); }} triggerClassName="btn btn-secondary professional-trigger" triggerLabel={`Profissional: ${selected?.name ?? 'Todos os profissionais'}`} triggerContent={trigger} className="professional-popover">
      {close => <div className="popover-stack">
        <SearchInput aria-label="Buscar profissional" placeholder="Buscar profissional" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); items()[0]?.focus(); } if (event.key === 'Enter') { event.preventDefault(); const first = options[0]; if (first) choose(first.id, close); } }} />
        <div ref={list} role="listbox" aria-label="Profissionais" className="professional-options">
          {options.map((option, index) => <div key={option.id || 'all'} role="option" tabIndex={-1} aria-selected={option.id === professionalId} className="professional-option" onClick={() => choose(option.id, close)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(option.id, close); } else move(event, index); }}>
            {option.professional ? <ProfessionalAvatar professional={option.professional} size={26} /> : <span className="option-all-icon" aria-hidden="true" />}
            <span className="option-text"><strong>{option.title}</strong><small>{option.sub}</small></span>
            {option.id === professionalId && <Check size={16} className="option-check" aria-hidden="true" />}
          </div>)}
          {!options.length && <p className="popover-empty">Nenhum profissional encontrado.</p>}
        </div>
        <p className="popover-hint">Escolher um profissional abre a semana dele.</p>
      </div>}
    </Popover>
    {selected && <Button variant="secondary" size="icon" className="professional-clear" aria-label="Voltar para todos os profissionais" title="Voltar para todos os profissionais" onClick={onClear}><X size={16} /></Button>}
  </div>;
}

export function FiltersPopover({ state, patientId, specialty, onChange }: { state: DemoState; patientId: string; specialty: string; onChange: (changes: Record<string, string | null>) => void }) {
  const count = [patientId, specialty].filter(Boolean).length;
  return <Popover label="Filtros" triggerClassName="btn btn-secondary filters-trigger" triggerLabel={count ? `Filtros, ${count} ${count === 1 ? 'aplicado' : 'aplicados'}` : 'Filtros'}
    triggerContent={<><Funnel size={16} aria-hidden="true" />Filtros{count > 0 && <span className="filter-count tabular" aria-hidden="true">{count}</span>}</>} className="filters-popover">
    <div className="popover-stack">
      <Field label="Paciente"><select aria-label="Filtrar paciente" value={patientId} onChange={e => onChange({ patient: e.target.value || null })}><option value="">Todos os pacientes</option>{state.patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Especialidade"><select aria-label="Filtrar especialidade da agenda" value={specialty} onChange={e => onChange({ specialty: e.target.value || null })}><option value="">Todas as especialidades</option>{state.clinic.specialties.map(item => <option key={item}>{item}</option>)}</select></Field>
      <div className="popover-footer"><span>Aplica na hora</span><Button variant="ghost" disabled={!count} onClick={() => onChange({ patient: null, specialty: null })}>Limpar filtros</Button></div>
    </div>
  </Popover>;
}

export function ActiveFilterChips({ state, patientId, specialty, status, onChange }: { state: DemoState; patientId: string; specialty: string; status: string; onChange: (changes: Record<string, string | null>) => void }) {
  const chips: { key: string; label: string; clear: Record<string, null> }[] = [];
  if (patientId) chips.push({ key: 'patient', label: `Paciente: ${state.patients.find(p => p.id === patientId)?.name ?? 'não encontrado'}`, clear: { patient: null } });
  if (specialty) chips.push({ key: 'specialty', label: `Especialidade: ${specialty}`, clear: { specialty: null } });
  if (legacyStatusLabels[status]) chips.push({ key: 'status', label: `Situação: ${legacyStatusLabels[status]}`, clear: { status: null, planned: null } });
  if (!chips.length) return null;
  return <div className="active-filters" role="group" aria-label="Filtros aplicados">
    {chips.map(chip => <span key={chip.key} className="filter-chip">{chip.label}<button type="button" aria-label={`Remover filtro ${chip.label}`} onClick={() => onChange(chip.clear)}><X size={14} aria-hidden="true" /></button></span>)}
    <Button variant="ghost" onClick={() => onChange({ patient: null, specialty: null, ...(legacyStatusLabels[status] ? { status: null, planned: null } : {}) })}>Limpar tudo</Button>
  </div>;
}

export const shiftDate = (date: string, view: AgendaView, direction: 1 | -1) => addDays(date, view === 'semana' ? 7 * direction : direction);
