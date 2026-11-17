'use client';

import { Plus, X } from 'lucide-react';
import { weekdaysFull, weekOrder } from '@/lib/date';
import type { WeekSlot } from '@/lib/types';
import { TimeInput } from './date-time-fields';

/** Weekly schedule editor shared by the clinic hours and each professional's
 * availability: one row per weekday (Monday first), any number of time ranges per day,
 * a day without ranges is closed. `label` prefixes the accessible name of every field. */
export function HoursEditor({ value, onChange, label }: { value: WeekSlot[]; onChange: (slots: WeekSlot[]) => void; label: string }) {
  function change(index: number, field: 'start' | 'end', time: string) {
    onChange(value.map((slot, slotIndex) => slotIndex === index ? { ...slot, [field]: time } : slot));
  }
  return <div className="hours-editor">
    {weekOrder.map(day => {
      const name = weekdaysFull[day];
      const slots = value.map((slot, index) => ({ ...slot, index })).filter(slot => slot.day === day);
      return <div key={day} className="hours-row">
        <div className="hours-day">{name}</div>
        <div className="hours-slots">
          {slots.length ? slots.map((slot, order) => <div key={slot.index} className="hours-slot">
            <TimeInput required label={`${label}: início de ${name}, faixa ${order + 1}`} value={slot.start} onChange={time => change(slot.index, 'start', time)} className="hours-input" />
            <span className="hours-separator">às</span>
            <TimeInput required label={`${label}: fim de ${name}, faixa ${order + 1}`} value={slot.end} onChange={time => change(slot.index, 'end', time)} className="hours-input" />
            <button type="button" className="btn btn-ghost btn-icon hours-remove" aria-label={`Remover faixa ${order + 1} de ${name}`}
              onClick={() => onChange(value.filter((_, index) => index !== slot.index))}><X size={16} /></button>
          </div>) : <span className="hours-closed">Sem atendimento</span>}
        </div>
        <button type="button" className="btn btn-ghost hours-add" aria-label={`Adicionar faixa de ${name}`}
          onClick={() => onChange([...value, { day, start: slots.length ? '14:00' : '08:00', end: slots.length ? '18:00' : '12:00' }])}>
          <Plus size={14} /><span>Faixa</span>
        </button>
      </div>;
    })}
  </div>;
}
