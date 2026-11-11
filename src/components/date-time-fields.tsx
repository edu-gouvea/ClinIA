'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';

export function parseDateInput(text: string): string | null {
  const raw = text.trim();
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw) || /^(\d{2})(\d{2})(\d{4})$/.exec(raw);
  const iso = parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(Date.parse(`${iso}T12:00:00Z`))) return null;
  return new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}
export function parseTimeInput(text: string): string | null {
  const raw = text.trim();
  const parts = /^(\d{1,2}):(\d{2})$/.exec(raw) || /^(\d{1,2})(\d{2})$/.exec(raw);
  if (!parts || Number(parts[1]) > 23 || Number(parts[2]) > 59) return null;
  return `${parts[1].padStart(2, '0')}:${parts[2]}`;
}
const readableDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso;
type Props = { value: string; onChange: (value: string) => void; label: string; required?: boolean; min?: string; disabled?: boolean; className?: string };

function temporalIssue(kind: 'date' | 'time', text: string, required: boolean, min?: string) {
  if (!text.trim()) return required ? 'Preencha este campo.' : '';
  const parsed = (kind === 'date' ? parseDateInput : parseTimeInput)(text);
  if (!parsed) return kind === 'date' ? 'Digite uma data válida: DD/MM/AAAA.' : 'Digite um horário válido: HH:MM.';
  return min && parsed < min ? `Escolha ${kind === 'date' ? 'uma data a partir de ' + readableDate(min) : 'um horário a partir de ' + min}.` : '';
}

/** Keep a text draft while typing. Commit on blur/Enter, not each numeric segment,
 * so URL updates and controlled state never reset an unfinished date or hour. */
function TemporalInput({ value, onChange, label, required = false, min, disabled, className = '', kind }: Props & { kind: 'date' | 'time' }) {
  const display = kind === 'date' ? readableDate : (v: string) => v;
  const [lastValue, setLastValue] = useState(value);
  const [draft, setDraft] = useState(display(value));
  const [showError, setShowError] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const errorId = useId();
  if (lastValue !== value) { setLastValue(value); setDraft(display(value)); setShowError(false); }
  useEffect(() => { field.current?.setCustomValidity(temporalIssue(kind, draft, required, min)); }, [kind, draft, required, min]);
  const parse = kind === 'date' ? parseDateInput : parseTimeInput;
  function issue(text: string) {
    return temporalIssue(kind, text, required, min);
  }
  function commit() {
    const error = issue(draft);
    field.current?.setCustomValidity(error);
    setShowError(!!error);
    if (error) return;
    const parsed = draft.trim() ? parse(draft)! : '';
    setDraft(display(parsed));
    onChange(parsed);
  }
  return <span className={`temporal-field ${className}`}>
    <span className="temporal-control">
      <input ref={field} type="text" inputMode="numeric" autoComplete="off" aria-label={label} placeholder={kind === 'date' ? 'DD/MM/AAAA' : 'HH:MM'} maxLength={kind === 'date' ? 10 : 5} required={required} disabled={disabled} value={draft}
        aria-invalid={showError || undefined} aria-describedby={showError ? errorId : undefined}
        onChange={event => { setDraft(event.target.value); setShowError(false); event.target.setCustomValidity(issue(event.target.value)); }}
        onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
      {kind === 'date' ? <><button type="button" className="temporal-picker-button" disabled={disabled} aria-label={`Selecionar ${label.toLowerCase()} no calendário`} onClick={() => { try { picker.current?.showPicker(); } catch { field.current?.focus(); } }}><CalendarDays size={16} /></button><input ref={picker} className="temporal-native-picker" tabIndex={-1} aria-hidden="true" type="date" min={min} value={value} disabled={disabled} onChange={event => { const next = event.target.value; if (!next) return; setDraft(display(next)); field.current?.setCustomValidity(''); setShowError(false); onChange(next); }} /></> : <Clock3 className="temporal-clock" size={16} aria-hidden="true" />}
    </span>
    {showError && <small id={errorId} className="field-error" role="alert">{issue(draft)}</small>}
  </span>;
}
export const DateInput = (props: Props) => <TemporalInput {...props} kind="date" />;
export const TimeInput = (props: Props) => <TemporalInput {...props} kind="time" />;
