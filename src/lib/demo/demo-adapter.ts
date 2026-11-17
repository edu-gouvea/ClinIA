import { CommandError } from '../errors';
import { runCommand } from '../services';
import type { Command, DemoState } from '../types';
import { simulatedAiReply } from './simulated-ai';

/** Everything the demo pretends: network latency, a server that sometimes fails, the
 * WhatsApp provider's delivery reports and the patient-facing AI agent. Each simulated
 * actor answers through the same domain commands its real counterpart will use, so
 * replacing this file with an HTTP adapter changes no screen and no rule. */

let failNextRequestFlag = false;
let failNextDeliveryFlag = false;

/** The next command fails once with a retryable `unavailable` error. */
export function failNextRequest(): void { failNextRequestFlag = true; }
/** The next outgoing message is reported as not delivered. */
export function failNextDelivery(): void { failNextDeliveryFlag = true; }

const LATENCY_MS = 180;

export async function runDemoCommand(state: DemoState, command: Command): Promise<DemoState> {
  await new Promise(resolve => setTimeout(resolve, process.env.NODE_ENV === 'test' ? 0 : LATENCY_MS));
  if (failNextRequestFlag) {
    failNextRequestFlag = false;
    throw new CommandError('unavailable', 'Não foi possível salvar desta vez. Falha simulada: tente novamente; seus dados foram preservados.');
  }
  let next = await runCommand(state, command);
  if (command.type === 'conversation.send') {
    // The provider reports the delivery right away in the demo.
    const message = next.conversations.find(c => c.id === command.id)?.messages.find(m => m.id === command.messageId);
    if (message?.delivery === 'pendente') {
      const delivery = failNextDeliveryFlag ? 'falha' : 'enviada';
      failNextDeliveryFlag = false;
      next = await runCommand(next, { type: 'conversation.delivery', id: command.id, messageId: command.messageId, delivery });
    }
  }
  if (command.type === 'conversation.receive') {
    const conversation = next.conversations.find(c => c.id === command.id);
    if (conversation?.status === 'ia') next = await runCommand(next, { type: 'conversation.ai_reply', id: command.id, ...simulatedAiReply(command.text) });
  }
  return next;
}
