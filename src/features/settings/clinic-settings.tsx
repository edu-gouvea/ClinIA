'use client';

import { useState, type FormEvent } from 'react';
import { Building2, Clock3, Save } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Feedback } from '@/components/feedback';
import { HoursEditor } from '@/components/hours-editor';
import { Button, Field } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { appointmentsOutsideAvailability } from '@/lib/scheduling';
import type { Clinic } from '@/lib/types';
import { AvailabilityConfirmation, lines } from './shared';

/** Clinic record, accepted insurance plans, specialties and opening hours. */
export function ClinicSettings() {
  const { state, act } = useDemo();
  const [clinic, setClinic] = useState<Clinic>(() => structuredClone(state.clinic));
  const [insurance, setInsurance] = useState(state.clinic.insurance.join('\n'));
  const [specialties, setSpecialties] = useState(state.clinic.specialties.join('\n'));
  const [confirm, setConfirm] = useState(false);
  const action = useAction();
  const input = { ...clinic, insurance: lines(insurance), specialties: lines(specialties) };
  const conflicts = appointmentsOutsideAvailability({ ...state, clinic: input });

  async function save() {
    if (await action.run(() => act({ type: 'clinic.save', input }), 'Informações da clínica atualizadas.')) setConfirm(false);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    action.clear();
    if (conflicts.length) setConfirm(true);
    else void save();
  }

  return <form onSubmit={submit} className="page-stack">
    <Feedback error={action.error} success={action.success} />
    <section className="card settings-card">
      <div className="card-header">
        <div><h2><Building2 size={18} aria-hidden="true" />Informações da clínica</h2><p>Os dados administrativos que sua equipe usa no dia a dia.</p></div>
      </div>
      <div className="form-grid">
        <Field label="Nome da clínica"><input required value={clinic.name} onChange={event => setClinic({ ...clinic, name: event.target.value })} /></Field>
        <Field label="Telefone de contato"><input required type="tel" value={clinic.phone} onChange={event => setClinic({ ...clinic, phone: event.target.value })} /></Field>
        <div className="full-width"><Field label="Endereço"><input required value={clinic.address} onChange={event => setClinic({ ...clinic, address: event.target.value })} /></Field></div>
        <Field label="Convênios aceitos" hint="Um convênio por linha. Deixe vazio para atendimento particular.">
          <textarea rows={4} value={insurance} onChange={event => setInsurance(event.target.value)} />
        </Field>
        <Field label="Especialidades" hint="Uma especialidade por linha. Especialidades de profissionais ativos precisam ser mantidas.">
          <textarea required rows={4} value={specialties} onChange={event => setSpecialties(event.target.value)} />
        </Field>
      </div>
      <p className="settings-note"><Clock3 size={14} aria-hidden="true" />Fuso da clínica: {state.clinic.timezone}</p>
    </section>

    <section className="card settings-card">
      <div className="card-header">
        <div><h2>Horário de funcionamento</h2><p>Adicione faixas para intervalos de almoço. Dias sem faixa ficam fechados.</p></div>
      </div>
      <HoursEditor label="Clínica" value={clinic.hours} onChange={hours => setClinic({ ...clinic, hours })} />
      <p className="settings-note">A agenda usa a interseção entre o funcionamento da clínica, os horários de cada profissional e os bloqueios. Períodos históricos mantêm a disponibilidade registrada.</p>
    </section>

    <div className="settings-submit">
      <Button disabled={action.busy} type="submit"><Save size={16} />{action.busy ? 'Salvando…' : 'Salvar informações da clínica'}</Button>
    </div>
    {confirm && <AvailabilityConfirmation count={conflicts.length} busy={action.busy} error={action.error} onClose={() => setConfirm(false)} onConfirm={save} />}
  </form>;
}
