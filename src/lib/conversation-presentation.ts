import type { Conversation } from './types';

/** Operational priority affects presentation only; ownership and transitions stay
 * in the service. Within the waiting queue, older requests come first. */
export function orderConversations(conversations: Conversation[], userId: string): Conversation[] {
  const priority = (conversation: Conversation) => conversation.status === 'aguardando' ? 0
    : conversation.status === 'humano' ? conversation.assigneeId === userId ? 1 : 2
      : conversation.status === 'ia' ? 3 : 4;
  const time = (value?: string) => value ? Date.parse(value) || 0 : 0;
  return [...conversations].sort((a, b) => {
    const rank = priority(a) - priority(b);
    if (rank) return rank;
    if (a.status === 'aguardando' && b.status === 'aguardando') {
      const waiting = time(a.requestedAt ?? a.messages[0]?.at) - time(b.requestedAt ?? b.messages[0]?.at);
      if (waiting) return waiting;
    }
    return time(b.messages.at(-1)?.at) - time(a.messages.at(-1)?.at) || a.id.localeCompare(b.id);
  });
}
