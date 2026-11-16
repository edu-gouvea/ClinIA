'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarPlus, Check, CreditCard, FileText, MessageCircle, Pencil, Phone } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Avatar, Button, useIsNarrow } from '@/components/ui';
import { dayMonth } from '@/lib/date';
import { relativeDay } from '@/lib/conversation-assistant';
import { latestConversation, patientNotes, patientPendencies, patientSessions, patientSummary, type Pendency } from '@/lib/patient-presentation';
import { appointmentStatusLabels } from '@/lib/status-presentation';
import type { Patient } from '@/lib/types';
import { AppointmentDetails } from '../agenda/appointment-details';
import { ProfessionalAvatar } from '../agenda/professional-avatar';
import { PatientActivity, type PatientLinks } from './patient-activity';
import { PatientAppointmentsTab, PatientConversationsTab, PatientNotesTab } from './patient-tabs';
import { listHref, pendencyIcons, plural } from './shared';

type Tab = 'atividade' | 'consultas' | 'conversas' | 'anotacoes';
const tabs: Tab[] = ['atividade', 'consultas', 'conversas', 'anotacoes'];
const tabLabels: Record<Tab, string> = { atividade: 'Atividade', consultas: 'Consultas', conversas: 'Conversas', anotacoes: 'Anotações' };
const isParticular = (insurance: string) => !insurance.trim() || /^particular$/i.test(insurance.trim());

export function PatientDetail({ patient, onEdit }: { patient: Patient; onEdit: () => void }) {
  const { state, act } = useDemo(); const params = useSearchParams(); const router = useRouter();
  const narrow = useIsNarrow();
  const context = params.get('context');
  const contextQuery = context ? `&context=${encodeURIComponent(context)}` : '';
  const tab = tabs.find(t => t === params.get('tab')) ?? 'atividade';
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});
  const [busy, setBusy] = useState(false);

  const pendencies = patientPendencies(state, patient.id);
  const summary = patientSummary(state, patient.id);
  const conversation = latestConversation(state, patient.id);
  const counts: Record<Tab, number | null> = {
    atividade: null,
    consultas: state.appointments.filter(a => a.patientId === patient.id).length,
    conversas: patientSessions(state, patient.id).length,
    anotacoes: patientNotes(state, patient.id).length,
  };
  const detail = state.appointments.find(a => a.id === params.get('appointment') && a.patientId === patient.id);

  function href(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    return `/gestao/pacientes?${next}`;
  }
  const reschedule = (id: string) => {
    const appointment = state.appointments.find(a => a.id === id);
    return `/gestao/agenda?patient=${patient.id}&date=${appointment?.date ?? state.referenceDate}&edit=${id}${contextQuery}`;
  };
  const links: PatientLinks = { details: id => href({ appointment: id }), reschedule, schedule: `/gestao/agenda?new=1&patient=${patient.id}${contextQuery}` };

  function selectTab(next: Tab, focus = false) {
    router.replace(href({ tab: next === 'atividade' ? null : next, page: null, when: null, professional: null }), { scroll: false });
    if (focus) requestAnimationFrame(() => document.getElementById(`patient-tab-${next}`)?.focus());
  }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = tabs.indexOf(tab);
    const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (target < 0) return;
    event.preventDefault(); selectTab(tabs[target], true);
  }
  async function confirm(id: string) {
    setBusy(true); setFeedback({});
    try { await act({ type: 'appointment.status', id, status: 'confirmada' }); setFeedback({ success: `Consulta ${appointmentStatusLabels.confirmada.toLowerCase()}.` }); }
    catch (cause) { setFeedback({ error: cause instanceof Error ? cause.message : 'Não foi possível atualizar a consulta.' }); }
    finally { setBusy(false); }
  }

  const cadastro = <dl className="attribute-list">
    <dt><Phone size={14} aria-hidden="true" />Telefone</dt><dd className="tabular">{patient.phone}</dd>
    <dt><CreditCard size={14} aria-hidden="true" />Convênio</dt><dd>{isParticular(patient.insurance) ? 'Particular' : patient.insurance}</dd>
    <dt><FileText size={14} aria-hidden="true" />Observações</dt><dd className={patient.notes ? 'is-notes' : 'is-empty'}>{patient.notes || 'Sem observações'}</dd>
  </dl>;
  const hasAppointments = counts.consultas! > 0;
  const resumo = hasAppointments ? <>
    <div className="summary-stats">
      {([['Realizadas', summary.realizadas], ['Próximas', summary.proximas], ['Faltas', summary.faltas], ['Cancelamentos', summary.canceladas]] as const).map(([label, value]) => <div key={label} className="summary-stat"><span>{label}</span><strong className="tabular">{value}</strong></div>)}
    </div>
    {summary.profissionais.length > 0 && <div className="attended-by"><span className="attended-label">Atendida por</span><ul>{summary.profissionais.map(p => <li key={p.professionalId}><ProfessionalAvatar professional={p} size={22} /><span className="attended-name">{p.name}</span><span className="attended-count tabular">{p.realizadas}</span></li>)}</ul></div>}
  </> : <p className="attribute-empty">Nenhuma consulta ainda</p>;
  const section = (id: string, title: string, content: ReactNode, action?: ReactNode) => narrow
    ? <details className="attribute-section"><summary><span className="attribute-title">{title}</span></summary>{action && <div className="attribute-section-action">{action}</div>}{content}</details>
    : <section className="attribute-section" aria-labelledby={id}><div className="attribute-head"><h2 id={id} className="attribute-title">{title}</h2>{action}</div>{content}</section>;

  return <div className="page-stack patients-page patient-detail" data-density="standard">
    <div className="patient-detail-top">
      <nav aria-label="Trilha de navegação" className="page-trail"><ol><li><Link href={listHref(params)}>Pacientes</Link></li><li aria-current="page">{patient.name}</li></ol></nav>
      {context && <Link className="btn btn-secondary" href={`/conversas?id=${encodeURIComponent(context)}`}><ArrowLeft size={16} aria-hidden="true" />Voltar à conversa</Link>}
    </div>
    <div className="patient-layout">
      <aside className="patient-card patient-attributes" aria-label="Dados do paciente">
        <div className="patient-identity-block">
          <Avatar name={patient.name} size="lg" className="avatar-52" />
          <div><h1>{patient.name}</h1><p>{isParticular(patient.insurance) ? 'Particular' : patient.insurance}{summary.desde ? ` · desde ${summary.desde}` : ''}</p></div>
        </div>
        <div className="patient-actions">
          <Link className="btn btn-primary" href={links.schedule}><CalendarPlus size={16} aria-hidden="true" />Agendar consulta</Link>
          {conversation
            ? <Link className="btn btn-secondary" href={`/conversas?id=${conversation.id}`}><MessageCircle size={16} aria-hidden="true" />Conversa</Link>
            : <span title="Sem conversas com este paciente"><Button variant="secondary" disabled><MessageCircle size={16} aria-hidden="true" />Conversa</Button></span>}
          <Button variant="secondary" size="icon" aria-label="Editar cadastro" title="Editar cadastro" onClick={onEdit}><Pencil size={16} /></Button>
        </div>
        {feedback.error && <div role="alert" className="error-banner patient-feedback">{feedback.error}</div>}
        {feedback.success && <div role="status" className="success-banner patient-feedback">{feedback.success}</div>}
        {pendencies.length > 0 && <PendencyAlert pendency={pendencies[0]} more={pendencies.length - 1} links={links} busy={busy} onConfirm={confirm} />}
        {section('patient-cadastro', 'Cadastro', cadastro, <Button variant="ghost" className="btn-28" onClick={onEdit}>Editar</Button>)}
        {section('patient-resumo', 'Resumo', resumo)}
      </aside>
      <section className="patient-card patient-content" aria-label="Histórico do paciente">
        <div className="patient-tabs" role="tablist" aria-label="Histórico do paciente">
          {tabs.map(key => <button key={key} id={`patient-tab-${key}`} type="button" role="tab" aria-selected={tab === key} aria-controls={`patient-panel-${key}`} tabIndex={tab === key ? 0 : -1} onClick={() => selectTab(key)} onKeyDown={onTabKey}>
            {tabLabels[key]}{counts[key] !== null && <span className="tab-count tabular">{counts[key]}</span>}
          </button>)}
        </div>
        <div id={`patient-panel-${tab}`} role="tabpanel" aria-labelledby={`patient-tab-${tab}`} className={`patient-panel panel-${tab}`}>
          {tab === 'atividade' && <PatientActivity patientId={patient.id} links={links} />}
          {tab === 'consultas' && <PatientAppointmentsTab patientId={patient.id} links={links} context={contextQuery} />}
          {tab === 'conversas' && <PatientConversationsTab patientId={patient.id} />}
          {tab === 'anotacoes' && <PatientNotesTab patientId={patient.id} links={links} />}
        </div>
      </section>
    </div>
    {detail && <AppointmentDetails key={detail.id} appointment={detail} onClose={() => router.push(href({ appointment: null }), { scroll: false })} onReschedule={() => router.push(reschedule(detail.id))} />}
  </div>;
}

function PendencyAlert({ pendency, more, links, busy, onConfirm }: { pendency: Pendency; more: number; links: PatientLinks; busy: boolean; onConfirm: (id: string) => void }) {
  const { state } = useDemo();
  const appointment = state.appointments.find(a => a.id === pendency.appointmentId);
  const professional = appointment && state.professionals.find(p => p.id === appointment.professionalId)?.name;
  const day = appointment ? relativeDay(appointment.date, state.referenceDate) : '';
  const when = /^(Hoje|Amanhã)$/.test(day) ? day.toLocaleLowerCase('pt-BR') : day;
  const Icon = pendencyIcons[pendency.icon];
  let text: ReactNode; let actions: ReactNode;
  switch (pendency.kind) {
    case 'remarcacao':
      text = appointment ? <><strong>Pediu remarcação</strong> da consulta de {when}, {appointment.start}{professional ? `, com ${professional}` : ''}.</> : <><strong>Pediu remarcação</strong> pela conversa.</>;
      actions = <>{appointment && <Link className="btn btn-secondary btn-28" href={links.reschedule(appointment.id)}>Remarcar</Link>}{pendency.conversationId && <Link className="btn btn-ghost btn-28" href={`/conversas?id=${pendency.conversationId}`}>Ver conversa</Link>}</>;
      break;
    case 'conversa':
      text = <><strong>Conversa aguardando</strong> atendimento.</>;
      actions = <Link className="btn btn-secondary btn-28" href={`/conversas?id=${pendency.conversationId}`}>Abrir conversa</Link>;
      break;
    case 'confirmar':
      text = <><strong>Consulta a confirmar</strong> {when}, {appointment?.start}.</>;
      actions = appointment && <><Button variant="secondary" className="btn-28" disabled={busy} onClick={() => onConfirm(appointment.id)}><Check size={14} aria-hidden="true" />Confirmar</Button><Link className="btn btn-ghost btn-28" href={links.details(appointment.id)} scroll={false}>Detalhes</Link></>;
      break;
    case 'falta':
      text = <><strong>Faltou</strong> em {appointment ? dayMonth(appointment.date) : 'consulta anterior'}{professional ? ` com ${professional}` : ''}.</>;
      actions = <Link className="btn btn-secondary btn-28" href={links.schedule}><CalendarPlus size={14} aria-hidden="true" />Agendar consulta</Link>;
      break;
  }
  return <div className="pendency-alert" data-tone={pendency.tone} data-pendency={pendency.kind} role="group" aria-label="Pendência">
    <div className="pendency-alert-text"><Icon size={16} aria-hidden="true" /><p>{text}</p></div>
    <div className="pendency-alert-actions">{actions}</div>
    {more > 0 && <p className="pendency-more-note">+{plural(more, 'pendência', 'pendências')}</p>}
  </div>;
}
