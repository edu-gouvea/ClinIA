import type { AdminEvent, DemoState, DemoUser } from './types';

export type AttendantMetrics = {
  /** Conversations the person took over in the period. */
  assumed: number;
  closed: number;
  /** Conversations currently assigned to the person (not limited to the period). */
  pending: number;
  /** Average minutes from the hand-off request to the claim, or `null` without a base. */
  claimMinutes: number | null;
  /** Average minutes from the hand-off request to the first delivered reply. */
  replyMinutes: number | null;
  claimBase: number;
  replyBase: number;
  created: number;
  rescheduled: number;
  /** Conversation and appointment events authored in the period, most recent first. */
  events: AdminEvent[];
};

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const handoffTypes = ['conversation.claim', 'conversation.return', 'conversation.close'];

/** Activity of one attendant between `from` and `to` (calendar dates, inclusive).
 * Times are elapsed minutes counted from the moment a human was requested; an action
 * stays attributed to whoever performed it, even after the conversation changes hands. */
export function attendantMetrics(state: DemoState, user: Pick<DemoUser, 'id'>, from: string, to: string): AttendantMetrics {
  const inPeriod = (at: string) => at.slice(0, 10) >= from && at.slice(0, 10) <= to;
  const claims: number[] = [];
  const replies: number[] = [];
  const events: AdminEvent[] = [];
  let assumed = 0;
  let closed = 0;
  for (const conversation of state.conversations) {
    const chronological = [...conversation.events].sort((a, b) => a.at.localeCompare(b.at));
    for (const event of chronological) {
      if (event.authorId !== user.id || !inPeriod(event.at)) continue;
      if (event.type === 'conversation.close') closed += 1;
      if (event.type !== 'conversation.claim') continue;
      assumed += 1;
      const request = chronological.filter(item => item.type === 'conversation.request' && item.at <= event.at).at(-1);
      const requestedAt = event.requestedAt ?? request?.at
        ?? (conversation.requestedAt && conversation.requestedAt <= event.at ? conversation.requestedAt : undefined);
      if (!requestedAt) continue;
      const requestTime = new Date(requestedAt).getTime();
      claims.push((new Date(event.at).getTime() - requestTime) / 60000);
      const handover = chronological.find(item => item.at > event.at && handoffTypes.includes(item.type));
      const firstReply = conversation.messages
        .filter(message => message.author === 'humano' && message.authorId === user.id && message.delivery === 'enviada'
          && (!event.sessionId || message.sessionId === event.sessionId)
          && message.at >= event.at && (!handover || message.at <= handover.at))
        .sort((a, b) => a.at.localeCompare(b.at))[0];
      if (firstReply) replies.push((new Date(firstReply.at).getTime() - requestTime) / 60000);
    }
    events.push(...conversation.events.filter(event => event.authorId === user.id && inPeriod(event.at) && handoffTypes.includes(event.type)));
  }
  const appointmentEvents = state.appointments.flatMap(appointment => appointment.events).filter(event => event.authorId === user.id && inPeriod(event.at));
  return {
    assumed, closed,
    pending: state.conversations.filter(conversation => conversation.status === 'humano' && conversation.assigneeId === user.id).length,
    claimMinutes: average(claims), replyMinutes: average(replies),
    claimBase: claims.length, replyBase: replies.length,
    created: appointmentEvents.filter(event => event.type === 'appointment.create').length,
    rescheduled: appointmentEvents.filter(event => event.type === 'appointment.reschedule').length,
    events: [...events, ...appointmentEvents].sort((a, b) => b.at.localeCompare(a.at)),
  };
}

/** "12 min", or "Sem dados" without a base. */
export const formatMinutes = (value: number | null) => value === null ? 'Sem dados' : `${Math.round(value)} min`;
