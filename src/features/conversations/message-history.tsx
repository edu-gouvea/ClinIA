'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Bot, CheckCheck, CircleAlert, Clock3, RotateCcw } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { CLINIC_TIMEZONE } from '@/lib/date';
import type { Conversation, DemoState, Message } from '@/lib/types';

function authorLabel(message: Message, state: DemoState, patientName: string) {
  if (message.author === 'paciente') return patientName;
  if (message.author === 'ia') return 'IA de atendimento';
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
        const delivery = message.id === pendingId ? 'pendente' : message.delivery;
        return <div key={message.id} data-message-id={message.id} className="conversation-message-entry">
          {(newSession || newDay) && <div className="conversation-date-separator"><span>{day(message.at)}{newSession && ` · ${message.sessionId === conversation.sessionId ? 'Sessão atual' : 'Sessão anterior'}`}</span></div>}
          {message.author === 'evento' ? <div className="conversation-message-event">{message.text}<time dateTime={message.at}>{formatTime(message.at)}</time></div>
            : <article className={`conversation-message ${outgoing ? 'is-outgoing' : ''}`} data-author={message.author}>
              <div className="conversation-bubble">
                <div className="conversation-message-author">{message.author === 'ia' && <Bot size={13} aria-hidden="true" />}{authorLabel(message, state, patientName)}</div>
                <p>{message.text}</p>
                <div className="conversation-message-meta"><time dateTime={message.at}>{formatTime(message.at)}</time>{outgoing && (delivery === 'pendente' ? <><Clock3 size={12} /><span>Enviando…</span></> : delivery === 'falha' ? <span className="conversation-message-failed"><CircleAlert size={12} />Falha no envio</span> : <><CheckCheck size={13} /><span>Enviada</span></>)}</div>
                {outgoing && delivery === 'falha' && <button type="button" disabled={busy || !owned} className="conversation-retry" onClick={() => onRetry(message)}><RotateCcw size={13} />Tentar novamente</button>}
              </div>
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
