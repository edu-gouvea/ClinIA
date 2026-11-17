'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, MessageSquare, Pencil, Plus, UserRound } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Feedback } from '@/components/feedback';
import { Button, Modal, PageHeading } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { dateTime, formatPeriod } from '@/lib/date';
import { plural } from '@/lib/format';
import { getPeriod } from '@/lib/metrics';
import { isOpenAppointment } from '@/lib/scheduling';
import type { Professional } from '@/lib/types';
import { AttendantDetail, AttendantList } from './attendants';
import { ProfessionalDetail } from './professional-detail';
import { ProfessionalForm } from './professional-form';
import { TeamRoster } from './team-roster';

/** Equipe: the roster of health professionals and the attendants, each with a detail
 * view selected by `?id=` / `?attendant=`. The period (`days` = 7 or 30) is shared. */
export function Team() {
  const { state, act } = useDemo();
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') === 'atendentes' ? 'atendentes' : 'profissionais';
  const days = params.get('days') === '30' ? 30 : 7;
  const period = getPeriod(state.referenceDate, days);
  const professional = state.professionals.find(item => item.id === params.get('id'));
  const attendant = state.users.find(user => user.id === params.get('attendant'));
  const [form, setForm] = useState<Professional | 'new' | null>(null);
  const [toggle, setToggle] = useState<Professional | null>(null);
  const action = useAction();
  const now = new Date(state.now).getTime();
  const futureCount = (id: string) => state.appointments.filter(appointment => appointment.professionalId === id && isOpenAppointment(appointment)
    && new Date(dateTime(appointment.date, appointment.start)).getTime() >= now).length;

  function update(changes: Record<string, string | null>) {
    const search = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => value ? search.set(key, value) : search.delete(key));
    router.replace(`/gestao/equipe?${search}`);
  }
  function listHref(nextTab?: string) {
    const next = new URLSearchParams(params.toString());
    next.delete('id');
    next.delete('attendant');
    if (nextTab) next.set('tab', nextTab);
    return `/gestao/equipe${next.size ? `?${next}` : ''}`;
  }
  async function toggleProfessional() {
    if (!toggle) return;
    const input = { name: toggle.name, specialties: toggle.specialties, active: !toggle.active, color: toggle.color, availability: toggle.availability };
    if (await action.run(() => act({ type: 'professional.save', id: toggle.id, input }))) setToggle(null);
  }
  const periodSelect = <select aria-label="Período da equipe" value={days} onChange={event => update({ days: event.target.value })}>
    <option value={7}>Últimos 7 dias</option>
    <option value={30}>Últimos 30 dias</option>
  </select>;

  return <div className={`page-stack team-page ${professional || attendant ? 'team-detail' : 'team-list'}`}>
    {professional ? <>
      <Link className="text-link" href={listHref()}><ArrowLeft size={16} />Todos os profissionais</Link>
      <PageHeading trail={['Gestão', 'Equipe', 'Atividade e agenda']} title={professional.name} description={professional.specialties.join(' · ')}
        actions={<div className="inline-actions">{periodSelect}<Button variant="secondary" onClick={() => setForm(professional)}><Pencil size={16} />Editar</Button></div>} />
      <ProfessionalDetail state={state} professional={professional} period={period} days={days} futureCount={futureCount(professional.id)}
        onToggle={() => { action.clear(); setToggle(professional); }} />
    </> : attendant ? <>
      <Link className="text-link" href={listHref('atendentes')}><ArrowLeft size={16} />Todos os atendentes</Link>
      <PageHeading trail={['Gestão', 'Equipe', 'Atividade do atendimento']} title={attendant.name} description={`${attendant.role} · ${formatPeriod(period)}`} actions={periodSelect} />
      <AttendantDetail state={state} user={attendant} period={period} />
    </> : <>
      <PageHeading trail={['Gestão', 'Equipe']} title="Equipe" actions={<Button onClick={() => setForm('new')}><Plus size={16} />Cadastrar profissional</Button>} />
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Tipo de equipe">
          <button type="button" aria-pressed={tab === 'profissionais'} onClick={() => update({ tab: null })}><UserRound size={16} />Profissionais de saúde</button>
          <button type="button" aria-pressed={tab === 'atendentes'} onClick={() => update({ tab: 'atendentes' })}><MessageSquare size={16} />Atendentes</button>
        </div>
        {periodSelect}
      </div>
      {tab === 'profissionais' ? <TeamRoster state={state} period={period} /> : <AttendantList state={state} period={period} days={days} />}
    </>}

    {form && <ProfessionalForm professional={form === 'new' ? undefined : form} onClose={() => setForm(null)} />}
    {toggle && <Modal title={`${toggle.active ? 'Inativar' : 'Reativar'} ${toggle.name}?`} onClose={() => !action.busy && setToggle(null)}>
      <Feedback error={action.error} />
      <p className="muted small">{toggle.active ? 'O histórico será preservado e novos agendamentos serão bloqueados.' : 'Novos agendamentos serão permitidos conforme a disponibilidade cadastrada.'}</p>
      {toggle.active && <p className="warning-banner">{plural(futureCount(toggle.id), 'consulta futura permanecerá', 'consultas futuras permanecerão')} na agenda e precisarão de revisão.</p>}
      <div className="form-actions">
        <Button variant="secondary" disabled={action.busy} onClick={() => setToggle(null)}>Voltar</Button>
        <Button variant={toggle.active ? 'danger' : 'primary'} disabled={action.busy} onClick={() => void toggleProfessional()}>
          {action.busy ? 'Salvando…' : toggle.active ? 'Confirmar inativação' : 'Reativar profissional'}
        </Button>
      </div>
    </Modal>}
  </div>;
}
