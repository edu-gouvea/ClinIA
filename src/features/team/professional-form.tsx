'use client';

import { useState, type FormEvent } from 'react';
import { useDemo } from '@/components/demo-provider';
import { Feedback } from '@/components/feedback';
import { HoursEditor } from '@/components/hours-editor';
import { Button, Field, Modal } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { plural } from '@/lib/format';
import { appointmentsOutsideAvailability } from '@/lib/scheduling';
import type { Professional } from '@/lib/types';

const weekdayMornings = [1, 2, 3, 4, 5].map(day => ({ day, start: '08:00', end: '12:00' }));

/** Create or edit a health professional: name, specialties and weekly availability. */
export function ProfessionalForm({ professional, onClose }: { professional?: Professional; onClose: () => void }) {
  const { state, act } = useDemo();
  const [form, setForm] = useState<Omit<Professional, 'id'>>(() => professional
    ? { name: professional.name, specialties: [...professional.specialties], active: professional.active, color: professional.color, availability: professional.availability.map(slot => ({ ...slot })) }
    : { name: '', specialties: [], active: true, color: '#397e67', availability: weekdayMornings });
  const action = useAction();
  const affected = professional
    ? appointmentsOutsideAvailability({ ...state, professionals: state.professionals.map(person => person.id === professional.id ? { ...form, id: person.id } : person) }, professional.id)
    : [];
  const specialties = Array.from(new Set([...state.clinic.specialties, ...form.specialties]));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await action.run(() => act({ type: 'professional.save', id: professional?.id, input: form }))) onClose();
  }
  function toggleSpecialty(specialty: string, checked: boolean) {
    setForm({ ...form, specialties: checked ? [...form.specialties, specialty] : form.specialties.filter(item => item !== specialty) });
  }

  return <Modal title={professional ? 'Editar profissional' : 'Cadastrar profissional'} onClose={() => !action.busy && onClose()} wide>
    <form onSubmit={submit} className="page-stack">
      <p className="muted small">Este cadastro disponibiliza uma agenda. Ele não cria uma conta de acesso.</p>
      <Feedback error={action.error} />
      <Field label="Nome do profissional">
        <input required aria-label="Nome do profissional" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Nome completo" />
      </Field>
      <fieldset className="specialty-fieldset">
        <legend>Especialidades</legend>
        <div className="specialty-options">
          {specialties.map(specialty => <label className="checkbox-label" key={specialty}>
            <input type="checkbox" checked={form.specialties.includes(specialty)} onChange={event => toggleSpecialty(specialty, event.target.checked)} />{specialty}
          </label>)}
        </div>
      </fieldset>
      <div className="form-section">
        <h3>Disponibilidade semanal</h3>
        <p className="muted small">Inclua uma faixa por turno. O funcionamento da clínica e os bloqueios também se aplicam.</p>
      </div>
      <HoursEditor label="Disponibilidade" value={form.availability} onChange={availability => setForm({ ...form, availability })} />
      {affected.length > 0 && <p className="warning-banner">Esta disponibilidade deixa {plural(affected.length, 'consulta futura', 'consultas futuras')} fora do expediente. Os agendamentos serão preservados e precisam de revisão em Configurações ou na agenda.</p>}
      {form.availability.length === 0 && <p className="warning-banner">Sem disponibilidade: o profissional não terá horários para novos agendamentos.</p>}
      <div className="form-actions">
        <Button type="button" variant="secondary" disabled={action.busy} onClick={onClose}>Voltar</Button>
        <Button type="submit" disabled={action.busy}>{action.busy ? 'Salvando…' : 'Salvar profissional'}</Button>
      </div>
    </form>
  </Modal>;
}
