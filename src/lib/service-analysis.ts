import { clinicDate } from './date';
import type { DemoState, Period } from './types';

export type ServiceMetrics = {
  /** WhatsApp sessions opened in the period (by their first message). */
  sessions: number;
  /** Sessions the AI handled without asking for a person. */
  aiOnly: number;
  /** Sessions handed over to the reception (a hand-off request was recorded). */
  handoffs: number;
  /** aiOnly ÷ sessions, 0–100; `null` without sessions. */
  aiShare: number | null;
  /** Average minutes from the hand-off request to a person taking over; `null` without base. */
  claimMinutes: number | null;
  claimBase: number;
};

/** How the patient-facing channel performed in a period: how much the AI resolved alone and
 * how fast the reception picked up what it handed over. A session counts in the period of
 * its first message; hand-offs and claims are matched within the same session. */
export function serviceMetrics(state: DemoState, period: Period): ServiceMetrics {
  let sessions = 0; let handoffs = 0;
  const claims: number[] = [];
  for (const conversation of state.conversations) {
    const firstBySession = new Map<string, string>();
    for (const message of conversation.messages) {
      const first = firstBySession.get(message.sessionId);
      if (!first || message.at < first) firstBySession.set(message.sessionId, message.at);
    }
    for (const [sessionId, first] of firstBySession) {
      const day = clinicDate(first);
      if (day < period.start || day > period.end) continue;
      sessions += 1;
      const events = conversation.events.filter(event => event.sessionId === sessionId).sort((a, b) => a.at.localeCompare(b.at));
      const request = events.find(event => event.type === 'conversation.request');
      if (!request) continue;
      handoffs += 1;
      const claim = events.find(event => event.type === 'conversation.claim' && event.at >= request.at);
      if (claim) claims.push((Date.parse(claim.at) - Date.parse(request.at)) / 60000);
    }
  }
  const aiOnly = sessions - handoffs;
  return {
    sessions, aiOnly, handoffs,
    aiShare: sessions ? aiOnly / sessions * 100 : null,
    claimMinutes: claims.length ? claims.reduce((sum, value) => sum + value, 0) / claims.length : null,
    claimBase: claims.length,
  };
}
