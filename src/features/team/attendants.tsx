'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { KpiStrip, type KpiItem } from '@/components/kpi-strip';
import { Avatar, Badge, EmptyState } from '@/components/ui';
import { attendantMetrics, formatMinutes } from '@/lib/attendance-metrics';
import { formatDate, formatPeriod, formatTime } from '@/lib/date';
import { plural } from '@/lib/format';
import type { DemoState, DemoUser, Period } from '@/lib/types';

/** One card per attendant with the period's service numbers. */
export function AttendantList({ state, period, days }: { state: DemoState; period: Period; days: number }) {
  return <>
    <p className="informative-note">Identidades fictícias de atendimento. O provisionamento real de usuários fará parte da integração futura.</p>
    <div className="person-grid">
      {state.users.map(user => {
        const metrics = attendantMetrics(state, user, period.start, period.end);
        return <article className="card person-card" key={user.id}>
          <div className="person-header"><Avatar name={user.name} size="sm" />{user.id === state.currentUserId && <Badge tone="success">Você</Badge>}</div>
          <h2>{user.name}</h2>
          <p className="muted">{user.role}</p>
          <div className="mini-stat-grid">
            <div className="mini-stat"><strong>{metrics.assumed}</strong><span>Assumidas</span></div>
            <div className="mini-stat"><strong>{metrics.closed}</strong><span>Encerradas</span></div>
            <div className="mini-stat"><strong>{metrics.pending}</strong><span>Em atendimento</span></div>
          </div>
          <div className="detail-list-row"><span>Tempo até assumir</span><strong>{formatMinutes(metrics.claimMinutes)}</strong></div>
          <div className="detail-list-row"><span>Primeira resposta</span><strong>{formatMinutes(metrics.replyMinutes)}</strong></div>
          <Link className="text-link" href={`/gestao/equipe?attendant=${user.id}&days=${days}`}>Ver atividade<ArrowUpRight size={16} /></Link>
        </article>;
      })}
    </div>
    <p className="muted small">{formatPeriod(period)}. Tempos médios corridos; a contagem preserva a autoria dos eventos.</p>
  </>;
}

/** Service activity of one attendant in the period. */
export function AttendantDetail({ state, user, period }: { state: DemoState; user: DemoUser; period: Period }) {
  const metrics = attendantMetrics(state, user, period.start, period.end);
  const kpis: KpiItem[] = [
    { title: 'Conversas assumidas', value: String(metrics.assumed), detail: 'Eventos atribuídos à pessoa' },
    { title: 'Encerradas', value: String(metrics.closed), detail: 'No período selecionado' },
    { title: 'Tempo até assumir', value: formatMinutes(metrics.claimMinutes), detail: `${plural(metrics.claimBase, 'solicitação', 'solicitações')} · média corrida` },
    { title: 'Primeira resposta', value: formatMinutes(metrics.replyMinutes), detail: `${plural(metrics.replyBase, 'resposta', 'respostas')} · média corrida` },
  ];
  return <>
    <KpiStrip className="team-kpis" items={kpis} />
    <section className="card">
      <div className="card-header"><div><h2>Ações administrativas</h2><p>Tempos corridos desde a solicitação de atendimento humano. Ações permanecem atribuídas ao autor original.</p></div></div>
      <div className="mini-stat-grid">
        <div className="mini-stat"><strong>{metrics.created}</strong><span>Agendamentos criados</span></div>
        <div className="mini-stat"><strong>{metrics.rescheduled}</strong><span>Remarcações registradas</span></div>
        <div className="mini-stat"><strong>{metrics.pending}</strong><span>Conversas atuais em atendimento</span></div>
      </div>
      <Link className="text-link" href={`/conversas?assignee=${user.id}`}>Ver conversas atuais<ArrowRight size={14} /></Link>
    </section>
    <section className="card">
      <div className="card-header"><h2>Histórico de atividade</h2></div>
      {metrics.events.length ? <ol className="timeline">
        {metrics.events.slice(0, 30).map(event => <li key={event.id}>
          <strong>{event.description}</strong>
          <small>{formatDate(event.at)} · {formatTime(event.at)}</small>
        </li>)}
      </ol> : <EmptyState title="Sem ações neste período" description="As atividades administrativas deste atendente aparecerão aqui." />}
    </section>
  </>;
}
