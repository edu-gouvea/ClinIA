'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { KpiStrip, type KpiItem } from '@/components/kpi-strip';
import { StackedBarChart } from '@/components/stacked-bar-chart';
import { Badge, Button, EmptyState } from '@/components/ui';
import { chartSeries, dailyChartData } from '@/lib/appointment-chart';
import { addDays, formatDate, formatPeriod, weekdaysFull, weekOrder } from '@/lib/date';
import { formatDecimal, formatRate, plural } from '@/lib/format';
import { metricComparison } from '@/lib/metric-comparison';
import { getMetrics } from '@/lib/metrics';
import { appointmentStatusLabels, appointmentStatusTones } from '@/lib/status-presentation';
import type { DemoState, Period, Professional } from '@/lib/types';

const PAGE_SIZE = 10;

/** "Consultas correspondentes": most recent first, 10 at a time. The page is local
 * state; the parent keys this component by professional and period, so a change of
 * either starts again at page 1 (no query param). */
function ProfessionalAppointments({ state, professionalId, period }: { state: DemoState; professionalId: string; period: Period }) {
  const [page, setPage] = useState(1);
  const rows = state.appointments
    .filter(appointment => appointment.professionalId === professionalId && appointment.date >= period.start && appointment.date <= period.end)
    .sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const first = (current - 1) * PAGE_SIZE;
  const shown = rows.slice(first, first + PAGE_SIZE);
  return <section className="card">
    <div className="card-header"><div><h2>Consultas correspondentes</h2><p>{formatPeriod(period)}</p></div></div>
    {rows.length ? <>
      <div className="table-wrap">
        <table data-density="compact" className="data-table">
          <thead><tr><th scope="col">Paciente</th><th scope="col">Data</th><th scope="col">Especialidade</th><th scope="col">Situação</th></tr></thead>
          <tbody>{shown.map(appointment => <tr key={appointment.id}>
            <td><Link className="text-link" href={`/gestao/pacientes?id=${appointment.patientId}`}>{state.patients.find(patient => patient.id === appointment.patientId)?.name}</Link></td>
            <td><Link className="text-link" href={`/gestao/agenda?professional=${professionalId}&date=${appointment.date}`}>{formatDate(appointment.date)} · {appointment.start}</Link></td>
            <td>{appointment.specialty}</td>
            <td><Badge tone={appointmentStatusTones[appointment.status]}>{appointmentStatusLabels[appointment.status]}</Badge></td>
          </tr>)}</tbody>
        </table>
      </div>
      {rows.length > PAGE_SIZE && <nav className="team-pagination team-appointments-footer" aria-label="Paginação das consultas">
        <span className="tabular">Mostrando {first + 1}–{first + shown.length} de {rows.length}</span>
        <div>
          <Button variant="ghost" disabled={current === 1} aria-label="Página anterior de consultas" onClick={() => setPage(current - 1)}><ChevronLeft size={14} />Anterior</Button>
          <Button variant="ghost" disabled={current === pages} aria-label="Próxima página de consultas" onClick={() => setPage(current + 1)}>Próxima<ChevronRight size={14} /></Button>
          <Link className="text-link" href={`/gestao/agenda?professional=${professionalId}&from=${period.start}&to=${period.end}`}>Ver todas na agenda<ArrowRight size={14} /></Link>
        </div>
      </nav>}
    </> : <EmptyState title="Sem consultas no período" description="A disponibilidade cadastrada continua visível acima." />}
  </section>;
}

/** Activity of one professional: the same four indicators and the same daily chart as
 * Início and Visão gerencial, scoped to the person, plus the weekly availability. */
export function ProfessionalDetail({ state, professional, period, days, futureCount, onToggle }: {
  state: DemoState; professional: Professional; period: Period; days: number; futureCount: number; onToggle: () => void;
}) {
  const previous = { start: addDays(period.start, -days), end: addDays(period.end, -days) };
  const metrics = getMetrics(state, period, professional.id);
  const before = getMetrics(state, previous, professional.id);
  const agendaHref = (status?: string) => `/gestao/agenda?professional=${professional.id}&from=${period.start}&to=${period.end}${status ? `&status=${status}` : ''}`;
  const results = metrics.completed + metrics.missed;
  const kpis: KpiItem[] = [
    { title: 'Consultas realizadas', value: String(metrics.completed), detail: 'Resultados registrados no período', href: agendaHref('realizada'), change: metricComparison(metrics.completed, before.completed, false, 'higher'), reference: String(before.completed) },
    { title: 'Ocupação da agenda', value: formatRate(metrics.occupancy), detail: `${formatDecimal(metrics.bookedMinutes / 60)} h ocupadas de ${formatDecimal(metrics.availableMinutes / 60)} h disponíveis`, href: agendaHref(), change: metricComparison(metrics.occupancy, before.occupancy, true, 'neutral'), reference: formatRate(before.occupancy) },
    { title: 'Taxa de faltas', value: formatRate(metrics.absenceRate), detail: `${plural(metrics.missed, 'falta', 'faltas')} em ${plural(results, 'resultado', 'resultados')}`, href: agendaHref('falta'), change: metricComparison(metrics.absenceRate, before.absenceRate, true, 'lower'), reference: formatRate(before.absenceRate) },
    { title: 'Em aberto', value: String(metrics.planned), detail: `${plural(metrics.cancelled, 'cancelada', 'canceladas')} no período`, href: agendaHref('previstas'), change: metricComparison(metrics.planned, before.planned), reference: String(before.planned) },
  ];

  return <>
    {!professional.active && <div className="warning-banner">
      <strong>Profissional inativo.</strong> Novos agendamentos estão bloqueados. {plural(futureCount, 'consulta futura precisa', 'consultas futuras precisam')} de revisão.{' '}
      <Link className="text-link" href={`/gestao/agenda?professional=${professional.id}&from=${state.referenceDate}&to=${addDays(state.referenceDate, 365)}&status=previstas`}>Revisar agenda<ArrowRight size={14} /></Link>
    </div>}
    <KpiStrip className="team-kpis" items={kpis} />
    <div className="detail-grid">
      <section className="card team-chart" aria-labelledby="team-chart-title">
        <div className="card-header">
          <div><h2 id="team-chart-title">Consultas por dia</h2><p>Pela data prevista · composição por resultado</p></div>
          <Badge tone={professional.active ? 'success' : 'neutral'}>{professional.active ? 'Ativo' : 'Inativo'}</Badge>
        </div>
        <StackedBarChart series={chartSeries} data={dailyChartData(state, period, days, professional.id, '')}
          label={`Consultas de ${professional.name} por dia e resultado, ${formatPeriod(period)}. Dados completos na tabela abaixo.`}
          tableCaption={`Consultas de ${professional.name} por dia e resultado, ${formatPeriod(period)}`} />
        <p className="team-chart-note">Faltas e cancelamentos descrevem a agenda. Não são uma avaliação de qualidade clínica.</p>
      </section>
      <section className="card">
        <div className="card-header"><div><h2>Disponibilidade semanal</h2><p>Faixas cadastradas, antes dos bloqueios</p></div></div>
        <div className="availability-list">
          {weekOrder.map(day => <div className="detail-list-row" key={day}>
            <strong>{weekdaysFull[day]}</strong>
            <span className="muted">{professional.availability.filter(slot => slot.day === day).map(slot => `${slot.start}–${slot.end}`).join(' · ') || 'Sem expediente'}</span>
          </div>)}
        </div>
        <Link className="text-link" href={`/gestao/agenda?professional=${professional.id}`}>Abrir agenda<ArrowUpRight size={14} /></Link>
      </section>
    </div>
    <ProfessionalAppointments key={`${professional.id}-${days}`} state={state} professionalId={professional.id} period={period} />
    <div className="form-actions">
      <Button variant={professional.active ? 'danger' : 'secondary'} onClick={onToggle}>{professional.active ? 'Inativar profissional' : 'Reativar profissional'}</Button>
    </div>
  </>;
}
