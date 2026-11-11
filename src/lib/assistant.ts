import type { AssistantEntry, DemoState, Period } from './types';
import { addDays, dateTime, formatDate, formatPeriod, weekStart } from './date';
import { getFreeSlots, getMetrics, getPeriod } from './metrics';

export const assistantSuggestions = [
  'O que ficou pendente hoje?',
  'Quais pacientes têm consulta amanhã?',
  'Quais profissionais têm horários livres nesta semana?',
  'Resuma esta conversa.',
  'Como foram os cancelamentos neste período?',
];

function validDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function selectedPeriod(state: DemoState, path: string, params: URLSearchParams): Period {
  const days = Number(params.get('period') || params.get('days') || 7);
  const fallback = getPeriod(state.referenceDate, [1, 7, 30].includes(days) ? days : 7);
  const from = params.get('from'); const to = params.get('to');
  if (validDate(from) && validDate(to) && from <= to && Date.parse(to) - Date.parse(from) <= 731 * 86400000) return { start: from, end: to };
  if (path === '/gestao/agenda') {
    const requestedDate = params.get('date');
    const date = validDate(requestedDate) ? requestedDate : state.referenceDate;
    return params.get('view') === 'week' ? { start: weekStart(date), end: addDays(weekStart(date), 6) } : { start: date, end: date };
  }
  return fallback;
}

export function describeAssistantContext(state: DemoState, path: string, params: URLSearchParams): string {
  const pages: Record<string, string> = {
    '/inicio': 'Início', '/conversas': 'Conversas', '/gestao/agenda': 'Agenda',
    '/gestao/equipe': 'Equipe', '/gestao/pacientes': 'Pacientes',
    '/gestao/visao-gerencial': 'Visão gerencial', '/gestao/configuracoes': 'Configurações',
  };
  const parts = [pages[path] || 'Clínica'];
  const conversation = path === '/conversas' ? state.conversations.find(c => c.id === params.get('id')) : undefined;
  const patient = state.patients.find(p => p.id === (conversation?.patientId || params.get('patient') || (path === '/gestao/pacientes' ? params.get('id') : null)));
  const professional = state.professionals.find(p => p.id === (params.get('professional') || (path === '/gestao/equipe' ? params.get('id') : null)));
  if (patient) parts.push(patient.name);
  if (professional) parts.push(professional.name);
  if (params.get('specialty')) parts.push(params.get('specialty')!);
  if (['/inicio', '/gestao/agenda', '/gestao/visao-gerencial', '/gestao/equipe'].includes(path)) parts.push(formatPeriod(selectedPeriod(state, path, params)));
  return parts.join(' · ');
}

/** Five explicit local intents. This service performs no mutations and does not contact an LLM. */
export function answerQuestion(state: DemoState, question: string, context: string, url: string): AssistantEntry {
  const normalized = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const parsed = new URL(context ? url : '/inicio', 'https://clinia.local');
  const params = parsed.searchParams;
  const period = selectedPeriod(state, parsed.pathname, params);
  const entry: AssistantEntry = {
    id: crypto.randomUUID(), question, answer: '', context: context || 'Sem contexto da página',
    period: formatPeriod(period), at: state.now, links: [],
  };
  if (/penden/.test(normalized)) {
    const today = state.appointments.filter(a => a.date === state.referenceDate);
    const confirmations = today.filter(a => a.status === 'agendada');
    const outcomes = today.filter(a => ['agendada', 'confirmada'].includes(a.status)
      && new Date(dateTime(a.date, a.start)).getTime() + a.duration * 60000 <= new Date(state.now).getTime());
    const waiting = state.conversations.filter(c => c.status === 'aguardando');
    entry.period = formatDate(state.referenceDate);
    entry.answer = `Hoje há ${waiting.length} conversa(s) aguardando atendimento, ${confirmations.length} consulta(s) com confirmação pendente e ${outcomes.length} consulta(s) cujo horário já terminou sem resultado registrado. As contagens podem se sobrepor: uma consulta passada também pode estar sem confirmação. Nenhuma falta é registrada automaticamente.`;
    entry.links = [{ label: 'Ver fila de atendimento', href: '/conversas?status=aguardando' }, { label: 'Revisar agenda de hoje', href: `/gestao/agenda?date=${state.referenceDate}` }];
  } else if (/amanha/.test(normalized)) {
    const date = addDays(state.referenceDate, 1);
    const appointments = state.appointments.filter(a => a.date === date && ['agendada', 'confirmada'].includes(a.status));
    entry.period = formatDate(date);
    entry.answer = appointments.length ? `${appointments.length} consulta(s) prevista(s) amanhã:\n${appointments.sort((a, b) => a.start.localeCompare(b.start)).map(a => `${a.start} · ${state.patients.find(p => p.id === a.patientId)?.name} · ${state.professionals.find(p => p.id === a.professionalId)?.name}`).join('\n')}` : 'Não há consultas previstas para amanhã na base local.';
    entry.links = [{ label: 'Abrir agenda de amanhã', href: `/gestao/agenda?date=${date}` }];
  } else if (/livre|disponib/.test(normalized)) {
    const end = addDays(weekStart(state.referenceDate), 6);
    const rows = state.professionals.filter(p => p.active).map(p => {
      let first = ''; let count = 0;
      for (let date = state.referenceDate; date <= end; date = addDays(date, 1)) {
        const slots = getFreeSlots(state, p.id, date, 30);
        count += slots.length;
        if (!first && slots.length) first = `${formatDate(date)} às ${slots[0]}`;
      }
      return { p, first, count };
    }).filter(x => x.count > 0);
    entry.period = `${formatDate(state.referenceDate)} a ${formatDate(end)}`;
    entry.answer = rows.length ? `Opções de início para consultas de 30 minutos nesta semana, respeitando funcionamento, disponibilidade, bloqueios e consultas existentes:\n${rows.map(x => `${x.p.name}: primeira opção ${x.first}.`).join('\n')}\nAs opções são alternativas de início e não representam vagas cumulativas.` : 'Não encontrei horários livres de 30 minutos no restante desta semana.';
    entry.links = rows.map(x => ({ label: x.p.name, href: `/gestao/agenda?professional=${x.p.id}&date=${state.referenceDate}&view=week` }));
  } else if (/resum.*conversa|conversa.*resum/.test(normalized)) {
    const conversation = context && parsed.pathname === '/conversas' ? state.conversations.find(c => c.id === params.get('id')) : undefined;
    if (!conversation) {
      entry.answer = 'Selecione uma conversa e mantenha o contexto da página ativo para gerar o resumo demonstrativo.';
      entry.links = [{ label: 'Abrir conversas', href: '/conversas' }];
    } else {
      const patient = state.patients.find(p => p.id === conversation.patientId);
      const messages = conversation.messages.filter(m => m.author !== 'evento' && m.delivery === 'enviada');
      const labels = { ia: 'com a IA de atendimento', aguardando: 'aguardando atendente', humano: 'em atendimento humano', encerrada: 'encerrada' };
      entry.period = 'Histórico local desta conversa';
      entry.answer = `Conversa com ${patient?.name}. Situação: ${labels[conversation.status]}. ${conversation.reason ? `Motivo do encaminhamento: ${conversation.reason}. ` : ''}${messages.length} mensagem(ns) enviada(s) no histórico.\nÚltima mensagem: “${messages.at(-1)?.text || 'Sem mensagens'}”\nEste resumo usa os registros e rótulos locais; não interpreta conteúdo clínico.`;
      entry.links = [{ label: 'Ver paciente', href: `/gestao/pacientes?id=${conversation.patientId}&context=${conversation.id}` }, { label: 'Abrir conversa', href: `/conversas?id=${conversation.id}` }];
    }
  } else if (/cancel/.test(normalized)) {
    const professionalId = params.get('professional') || (parsed.pathname === '/gestao/equipe' ? params.get('id') : '') || '';
    const specialty = params.get('specialty') || '';
    const m = getMetrics(state, period, professionalId, specialty);
    const professional = state.professionals.find(p => p.id === professionalId);
    const scope = [professional?.name, specialty].filter(Boolean).join(' · ');
    entry.answer = `Das ${m.total} consultas previstas originalmente para ${formatPeriod(period)}${scope ? ` (${scope})` : ''}, ${m.cancelled} foram canceladas${m.total ? ` (${(m.cancelled / m.total * 100).toFixed(1).replace('.', ',')}%)` : ''}. A data considerada é a da consulta, independentemente de quando o cancelamento foi registrado. Os dados não permitem atribuir causas ou responsabilidade clínica.`;
    const filters = new URLSearchParams({ from: period.start, to: period.end, status: 'cancelada' });
    if (professionalId) filters.set('professional', professionalId);
    if (specialty) filters.set('specialty', specialty);
    entry.links = [{ label: 'Consultar cancelamentos', href: `/gestao/agenda?${filters}` }];
  } else {
    entry.answer = 'Esta demonstração reconhece apenas cinco intenções: pendências de hoje, consultas de amanhã, horários livres na semana, resumo da conversa selecionada e cancelamentos no período. Escolha uma das sugestões abaixo. Não há conexão com um modelo de IA.';
  }
  return entry;
}
