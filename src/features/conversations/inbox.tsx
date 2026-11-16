'use client';

import { Check, Clock3, Repeat, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { Avatar, Badge, SearchInput } from '@/components/ui';
import { formatTime } from '@/lib/date';
import {
  formatElapsed, inboxViewLabels, inboxViews, isReschedule, lastVisibleMessage, previewPrefix, shortName, waitingSince,
  type InboxFilters, type InboxView,
} from '@/lib/conversation-inbox';
import type { Conversation, DemoState } from '@/lib/types';

type Counts = Record<InboxView, number> & { mine: number; ai: number };
type Props = {
  state: DemoState; filters: InboxFilters; counts: Counts; conversations: Conversation[]; selectedId: string | null;
  search: string; onSearch: (value: string) => void; filtersOpen: boolean; onToggleFilters: () => void;
  onView: (view: InboxView) => void; onFilter: (changes: Record<string, string | null>) => void; onSelect: (id: string) => void;
};

const emptyCopy: Record<InboxView, [string, string]> = {
  pendentes: ['Nenhuma conversa pendente', 'Quando a IA encaminhar um paciente à recepção, ele aparece aqui.'],
  atendimento: ['Nenhuma conversa em atendimento', 'As conversas assumidas pela equipe ou conduzidas pela IA aparecem aqui.'],
  finalizadas: ['Nenhuma conversa finalizada', 'Atendimentos encerrados ficam disponíveis aqui, com o histórico.'],
};

export function Inbox({ state, filters, counts, conversations, selectedId, search, onSearch, filtersOpen, onToggleFilters, onView, onFilter, onSelect }: Props) {
  const tabs = useRef<HTMLDivElement>(null);
  const others = state.users.filter(user => user.id !== state.currentUserId);
  const assigneeName = filters.assignee === 'me' ? 'Comigo' : filters.assignee === 'other' ? 'Outro atendente' : state.users.find(user => user.id === filters.assignee)?.name;
  // Filters set from the panel stay visible as removable chips even with the panel closed.
  const panelFilters: { key: string; label: string; clear: Record<string, null> }[] = [];
  if (filters.reason === 'remarcacao') panelFilters.push({ key: 'reason', label: 'Remarcação', clear: { reason: null } });
  if (filters.assignee && !(filters.view === 'atendimento' && filters.assignee === 'me')) panelFilters.push({ key: 'assignee', label: `Responsável: ${assigneeName ?? filters.assignee}`, clear: { assignee: null } });

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = inboxViews.indexOf(filters.view);
    const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? inboxViews.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const view = inboxViews[(next + inboxViews.length) % inboxViews.length];
    onView(view);
    requestAnimationFrame(() => tabs.current?.querySelector<HTMLButtonElement>(`[data-view="${view}"]`)?.focus());
  }

  return <aside aria-label="Lista de conversas" className="inbox">
    <div className="inbox-top">
      <div className="inbox-title">
        <h1>Conversas</h1>
        <button type="button" className="btn btn-ghost btn-icon inbox-filter-toggle" aria-label="Filtros: motivo e responsável" title="Filtros: motivo e responsável" aria-expanded={filtersOpen} aria-controls="inbox-filters" data-active={panelFilters.length > 0 || undefined} onClick={onToggleFilters}><SlidersHorizontal size={16} /></button>
      </div>
      <SearchInput aria-label="Buscar conversas por nome ou telefone" placeholder="Nome ou telefone" value={search} onChange={event => onSearch(event.target.value)} />
      <div ref={tabs} className="inbox-tabs" role="tablist" aria-label="Situação das conversas">
        {inboxViews.map(view => {
          const selected = filters.view === view;
          return <button key={view} type="button" role="tab" id={`inbox-tab-${view}`} data-view={view} aria-selected={selected} aria-controls="inbox-list" tabIndex={selected ? 0 : -1}
            aria-label={`${inboxViewLabels[view]}, ${counts[view]}`} onClick={() => onView(view)} onKeyDown={onTabKey}>
            <span>{inboxViewLabels[view]}</span>{view === 'pendentes' && counts.pendentes > 0 && <span className="inbox-count tabular" aria-hidden="true">{counts.pendentes}</span>}
          </button>;
        })}
      </div>
      {filters.view === 'atendimento' && <div className="inbox-chips" role="group" aria-label="Filtrar em atendimento">
        <button type="button" className="chip" aria-pressed={!filters.status && filters.assignee !== 'me'} onClick={() => onFilter({ status: null, assignee: filters.assignee === 'me' ? null : filters.assignee || null })}>Todas <span className="tabular">{counts.atendimento}</span></button>
        <button type="button" className="chip" aria-pressed={filters.assignee === 'me' && !filters.status} onClick={() => onFilter({ assignee: 'me', status: null })}>Comigo <span className="tabular">{counts.mine}</span></button>
        <button type="button" className="chip" aria-pressed={filters.status === 'ia'} onClick={() => onFilter({ status: 'ia', assignee: null })}>Com IA <span className="tabular">{counts.ai}</span></button>
      </div>}
      {filtersOpen && <div id="inbox-filters" className="inbox-filter-panel">
        <div className="inbox-filter-row"><span>Motivo</span><button type="button" className="chip" aria-pressed={filters.reason === 'remarcacao'} onClick={() => onFilter({ reason: filters.reason === 'remarcacao' ? null : 'remarcacao' })}><Repeat size={12} aria-hidden="true" />Remarcação</button></div>
        <label className="inbox-filter-row"><span>Responsável</span><select aria-label="Responsável pela conversa" value={filters.assignee} onChange={event => onFilter({ assignee: event.target.value || null, status: null })}>
          <option value="">Todos os responsáveis</option><option value="me">Comigo</option><option value="other">Outro atendente</option>
          {others.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select></label>
      </div>}
      {panelFilters.length > 0 && <div className="inbox-applied">{panelFilters.map(filter => <span key={filter.key} className="chip chip-applied">{filter.label}<button type="button" aria-label={`Remover filtro ${filter.label}`} onClick={() => onFilter(filter.clear)}><X size={12} /></button></span>)}</div>}
    </div>

    <div id="inbox-list" className="inbox-list" role="region" aria-label="Conversas disponíveis" tabIndex={0}>
      {conversations.length === 0 ? <div className="inbox-empty">
        <span className="inbox-empty-icon" aria-hidden="true"><Check size={16} /></span>
        {search.trim() ? <><strong>Nenhum resultado</strong><p>Experimente outro nome ou telefone.</p></> : <><strong>{emptyCopy[filters.view][0]}</strong><p>{emptyCopy[filters.view][1]}</p></>}
      </div> : conversations.map(conversation => <InboxItem key={conversation.id} state={state} conversation={conversation} selected={conversation.id === selectedId} onSelect={onSelect} />)}
    </div>
  </aside>;
}

function InboxItem({ state, conversation, selected, onSelect }: { state: DemoState; conversation: Conversation; selected: boolean; onSelect: (id: string) => void }) {
  const contact = state.patients.find(item => item.id === conversation.patientId)!;
  const last = lastVisibleMessage(conversation);
  const owner = state.users.find(user => user.id === conversation.assigneeId);
  const since = conversation.status === 'aguardando' ? waitingSince(conversation) : undefined;
  const badges = [
    since && <Badge key="wait" tone="warning"><Clock3 aria-hidden="true" />Aguarda {formatElapsed(since, state.now)}</Badge>,
    conversation.status === 'humano' && (conversation.assigneeId === state.currentUserId ? <Badge key="me" tone="info">Você</Badge> : <Badge key="owner">{owner ? shortName(owner.name) : 'Atendente'}</Badge>),
    conversation.status === 'ia' && <Badge key="ai" tone="ai"><Sparkles aria-hidden="true" />IA</Badge>,
    conversation.status !== 'encerrada' && isReschedule(conversation) && <Badge key="reschedule"><Repeat aria-hidden="true" />Remarcação</Badge>,
  ].filter(Boolean);
  return <button type="button" aria-current={selected ? 'true' : undefined} data-status={conversation.status} data-conversation-id={conversation.id} onClick={() => onSelect(conversation.id)} className="conversation-list-item">
    <Avatar name={contact.name} size="sm" />
    <span className="inbox-item-body">
      <span className="inbox-item-line"><span className="conversation-contact-name">{contact.name}</span><time dateTime={last?.at} className="conversation-list-time tabular">{last ? formatTime(last.at) : '—'}</time></span>
      <span className="inbox-item-preview">{previewPrefix(last, state)}{last?.text || 'Nenhuma mensagem ainda'}</span>
      {badges.length > 0 && <span className="inbox-item-badges">{badges}</span>}
    </span>
  </button>;
}
