import { addDays, clinicTimeZone } from './date';
import { normalizeText } from './format';
import type { Conversation, ConversationStatus, DemoState, Message } from './types';

/** Inbox presentation helpers. Pure: no mutation, no clock other than `state.now`. */
export type InboxView = 'pendentes' | 'atendimento' | 'finalizadas';
export const inboxViews: InboxView[] = ['pendentes', 'atendimento', 'finalizadas'];
export const inboxViewLabels: Record<InboxView, string> = { pendentes: 'Pendentes', atendimento: 'Em atendimento', finalizadas: 'Finalizadas' };
const viewStatuses: Record<InboxView, ConversationStatus[]> = { pendentes: ['aguardando'], atendimento: ['humano', 'ia'], finalizadas: ['encerrada'] };

export type InboxFilters = {
  view: InboxView;
  /** Narrows "Em atendimento": `ia` = Com IA, `humano` = with staff. Empty = all. */
  status: '' | 'ia' | 'humano';
  /** '' | 'me' | 'other' | user id (same values as the former select). */
  assignee: string;
  reason: '' | 'remarcacao';
};

export const isReschedule = (conversation: Conversation) => /remarc/.test(normalizeText(conversation.reason || ''));
export const viewOf = (status: ConversationStatus): InboxView => status === 'aguardando' ? 'pendentes' : status === 'encerrada' ? 'finalizadas' : 'atendimento';

/** Maps current and legacy query strings onto one inbox state.
 * `view` wins; otherwise `status`, then the open conversation (`id`), then the
 * tab that holds the first legacy filter match, then "Pendentes". */
export function resolveInbox(params: URLSearchParams, conversations: Conversation[], currentUserId: string): InboxFilters {
  const rawView = params.get('view');
  const rawStatus = params.get('status') || '';
  const assignee = params.get('assignee') || '';
  const reason = params.get('reason') === 'remarcacao' ? 'remarcacao' as const : '' as const;
  const status = rawStatus === 'ia' || rawStatus === 'humano' ? rawStatus : '';
  let view: InboxView | undefined = inboxViews.find(item => item === rawView);
  if (!view && ['aguardando', 'humano', 'ia', 'encerrada'].includes(rawStatus)) view = viewOf(rawStatus as ConversationStatus);
  if (!view) {
    const open = conversations.find(conversation => conversation.id === params.get('id'));
    if (open) view = viewOf(open.status);
  }
  if (!view && (reason || assignee)) {
    const match = conversations.find(conversation => matchesFilters(conversation, { view: viewOf(conversation.status), status: '', assignee, reason }, currentUserId));
    view = match ? viewOf(match.status) : assignee ? 'atendimento' : 'pendentes';
  }
  view ??= 'pendentes';
  return { view, status: view === 'atendimento' ? status : '', assignee, reason };
}

export function matchesFilters(conversation: Conversation, filters: InboxFilters, currentUserId: string): boolean {
  if (!viewStatuses[filters.view].includes(conversation.status)) return false;
  if (filters.status && conversation.status !== filters.status) return false;
  if (filters.reason === 'remarcacao' && (conversation.status === 'encerrada' || !isReschedule(conversation))) return false;
  if (filters.assignee === 'me' && conversation.assigneeId !== currentUserId) return false;
  if (filters.assignee === 'other' && (!conversation.assigneeId || conversation.assigneeId === currentUserId)) return false;
  if (filters.assignee && !['me', 'other'].includes(filters.assignee) && conversation.assigneeId !== filters.assignee) return false;
  return true;
}

/** Tab counts ignore search and filters: they describe the whole queue. */
export function inboxCounts(conversations: Conversation[], currentUserId: string) {
  const working = conversations.filter(c => c.status === 'humano' || c.status === 'ia');
  return {
    pendentes: conversations.filter(c => c.status === 'aguardando').length,
    atendimento: working.length,
    finalizadas: conversations.filter(c => c.status === 'encerrada').length,
    mine: working.filter(c => c.status === 'humano' && c.assigneeId === currentUserId).length,
    ai: working.filter(c => c.status === 'ia').length,
  };
}

/** Instant of the last transition to "aguardando" (request event), falling back
 * to the last patient message. */
export function waitingSince(conversation: Conversation): string | undefined {
  const request = [...conversation.events].reverse().find(event => event.type === 'conversation.request');
  return request?.at ?? [...conversation.messages].reverse().find(message => message.author === 'paciente')?.at;
}

/** "há 50 min", "há 2 h". Never negative; under a minute reads "há menos de 1 min". */
export function formatElapsed(from: string, now: string): string {
  const minutes = Math.max(0, Math.floor((Date.parse(now) - Date.parse(from)) / 60000));
  if (minutes < 1) return 'há menos de 1 min';
  if (minutes < 60) return `há ${minutes} min`;
  return `há ${Math.floor(minutes / 60)} h`;
}

export const firstName = (name: string) => name.replace(/^(Dr\.?|Dra\.?)\s+/, '').split(' ')[0] ?? name;
/** "Rafael M." */
export const shortName = (name: string) => { const parts = name.split(' ').filter(Boolean); return parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0]}.` : name; };

export const lastVisibleMessage = (conversation: Conversation): Message | undefined => [...conversation.messages].reverse().find(message => message.author !== 'evento');

/** Preview prefix: "IA: ", "Você: ", "{primeiro nome}: " or none for the patient. */
export function previewPrefix(message: Message | undefined, state: Pick<DemoState, 'users' | 'currentUserId'>): string {
  if (!message || message.author === 'paciente' || message.author === 'evento') return '';
  if (message.author === 'ia') return 'IA: ';
  if (message.authorId === state.currentUserId) return 'Você: ';
  const user = state.users.find(item => item.id === message.authorId);
  return user ? `${firstName(user.name)}: ` : 'Atendente: ';
}

const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: clinicTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const time = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: clinicTimeZone(), hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** "hoje às 09:39", "ontem às 18:00", "em 05/11 às 10:00". */
export function relativeMoment(iso: string, referenceDate: string): string {
  const day = dayKey(iso);
  if (day === referenceDate) return `hoje às ${time(iso)}`;
  if (day === addDays(referenceDate, -1)) return `ontem às ${time(iso)}`;
  return `em ${day.slice(8, 10)}/${day.slice(5, 7)} às ${time(iso)}`;
}

/** Who closed the current session and when, from the last close event. */
export function closedInfo(conversation: Conversation, state: Pick<DemoState, 'users' | 'currentUserId' | 'referenceDate'>): { when: string; by: string } | undefined {
  const close = [...conversation.events].reverse().find(event => event.type === 'conversation.close');
  if (!close) return undefined;
  const user = state.users.find(item => item.id === close.authorId);
  return { when: relativeMoment(close.at, state.referenceDate), by: close.authorId === state.currentUserId ? 'você' : user?.name ?? 'a recepção' };
}
