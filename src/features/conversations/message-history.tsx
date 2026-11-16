'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, CheckCheck, CircleAlert, Clock3, RotateCcw, Sparkles } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { CLINIC_TIMEZONE } from '@/lib/date';
import type { Conversation, DemoState, Message } from '@/lib/types';

/** Patient bubbles carry no label; IA and staff are labelled ("Você" for the current user). */
function authorLabel(message: Message, state: DemoState) {
  if (message.author === 'ia') return 'Assistente IA';
  if (message.authorId === state.currentUserId) return 'Você';
  return state.users.find(user => user.id === message.authorId)?.name ?? 'Atendente';
}
const dayFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: CLINIC_TIMEZONE, day: 'numeric', month: 'long', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: CLINIC_TIMEZONE, hour: '2-digit', minute: '2-digit' });
const day = (at: string) => dayFormatter.format(new Date(at));
const formatTime = (at: string) => timeFormatter.format(new Date(at));

export function MessageHistory({ state, conversation, patientName, messages, pendingId, busy, owned, onRetry }: {
  state: DemoState; conversation: Conversation; patientName: string; messages: Message[];
  pendingId?: string; busy: boolean; owned: boolean; onRetry: (message: Message) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const previousLastId = useRef<string | undefined>(undefined);
  const [showLatest, setShowLatest] = useState(false);
  const last = messages.at(-1);

  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = scroll.current;
    const outgoing = last?.author === 'humano' && last.id !== previousLastId.current;
    if (element && (atBottom.current || outgoing)) element.scrollTop = element.scrollHeight;
    previousLastId.current = last?.id;
  }, [messages.length, last?.id, last?.author, last?.delivery, pendingId]);

  return <div className="conversation-history-pane">
    <div ref={scroll} role="log" aria-label="Mensagens do atendimento" aria-live="polite" tabIndex={0} className="conversation-messages" onScroll={event => {
      const element = event.currentTarget;
      atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 32;
      setShowLatest(!atBottom.current);
    }}>
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const newSession = !previous || previous.sessionId !== message.sessionId;
        const newDay = !previous || day(previous.at) !== day(message.at);
        const outgoing = message.author === 'humano';
        const right = message.author === 'humano' || message.author === 'ia';
        const delivery = message.id === pendingId ? 'pendente' : message.delivery;
        return <div key={message.id} data-message-id={message.id} className="conversation-message-entry">
          {(newSession || newDay) && <div className="conversation-date-separator"><span className="tabular">{day(message.at)}{newSession && ` · ${message.sessionId === conversation.sessionId ? 'Sessão atual' : 'Sessão anterior'}`}</span></div>}
          {message.author === 'evento' ? <p className="conversation-message-event">{message.text}<span className="conversation-event-time"> · <time dateTime={message.at}>{formatTime(message.at)}</time></span></p>
            : <article className={`conversation-message${right ? ' is-outgoing' : ''}`} data-author={message.author} aria-label={message.author === 'paciente' ? patientName : authorLabel(message, state)}>
              <div className="conversation-bubble">
                {message.author !== 'paciente' && <div className="conversation-message-author">{message.author === 'ia' && <Sparkles size={12} aria-hidden="true" />}{authorLabel(message, state)}</div>}
                <p>{message.text}</p>
              </div>
              <div className="conversation-message-meta tabular"><time dateTime={message.at}>{formatTime(message.at)}</time>{outgoing && (delivery === 'pendente' ? <><span aria-hidden="true">·</span><Clock3 size={12} aria-hidden="true" /><span>Enviando…</span></> : delivery === 'falha' ? <><span aria-hidden="true">·</span><span className="conversation-message-failed"><CircleAlert size={12} aria-hidden="true" />Falha no envio</span></> : <><span aria-hidden="true">·</span><span className="conversation-message-sent"><CheckCheck size={13} aria-hidden="true" />Enviada</span></>)}</div>
              {outgoing && delivery === 'falha' && <button type="button" disabled={busy || !owned} className="conversation-retry" onClick={() => onRetry(message)}><RotateCcw size={13} aria-hidden="true" />Tentar novamente</button>}
            </article>}
        </div>;
      })}
      {!messages.length && <EmptyState title="Uma nova conversa começa aqui" description="As mensagens recebidas e as respostas aparecerão neste espaço." />}
    </div>
    {showLatest && <Button variant="secondary" className="conversation-latest" onClick={() => {
      if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
      atBottom.current = true; setShowLatest(false);
    }}><ArrowDown size={14} />Últimas mensagens</Button>}
  </div>;
}
