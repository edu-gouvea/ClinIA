'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Bot, Check, CircleAlert, CircleCheck, Clock3, MessageCircle, MoreHorizontal, PanelRight, Repeat, Send, Sparkles, TriangleAlert, UserCheck, UserRound, X } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Badge, Button, Drawer, Field, Menu, Modal } from '@/components/ui';
import { answerConversationQuestion } from '@/lib/conversation-assistant';
import { closedInfo, firstName, formatElapsed, inboxCounts, matchesFilters, resolveInbox, viewOf, waitingSince, type InboxView } from '@/lib/conversation-inbox';
import { orderConversations } from '@/lib/conversation-presentation';
import { breakpointQuery } from '@/lib/breakpoints';
import { conversationStatusLabels, conversationStatusTones } from '@/lib/status-presentation';
import type { Command, Message } from '@/lib/types';
import { ContextPanel, insertBlockedReason, type Exchange, type PanelTab } from './conversations/context-panel';
import { Inbox } from './conversations/inbox';
import { MessageHistory } from './conversations/message-history';

/** ≥1280 three columns · 768–1279 panel as a right drawer · <768 master/detail. */
type LayoutMode = 'mobile' | 'drawer' | 'inline';
const md = breakpointQuery('md');
const xl = breakpointQuery('xl');
const modeSnapshot = (): LayoutMode => window.matchMedia(xl).matches ? 'inline' : window.matchMedia(md).matches ? 'drawer' : 'mobile';
const serverMode = (): LayoutMode => 'inline';
function subscribeMode(notify: () => void) {
  const queries = [window.matchMedia(md), window.matchMedia(xl)];
  queries.forEach(query => query.addEventListener('change', notify));
  return () => queries.forEach(query => query.removeEventListener('change', notify));
}
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Conversations() {
  const { state, act } = useDemo();
  const router = useRouter();
  const params = useSearchParams();
  const mode = useSyncExternalStore(subscribeMode, modeSnapshot, serverMode);
  const selectedId = params.get('id');
  const filters = resolveInbox(new URLSearchParams(params.toString()), state.conversations, state.currentUserId);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Panel: open/closed and tab are remembered for this page session; the default depends on the layout.
  const [panelChoice, setPanelChoice] = useState<boolean | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('paciente');
  const panelOpen = panelChoice ?? mode === 'inline';
  // Panel assistant chat: per conversation, React state only (not persisted; see report).
  const [chats, setChats] = useState<Record<string, Exchange[]>>({});
  const [slots, setSlots] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ conversationId: string; message: Message } | null>(null);
  const [closeDialog, setCloseDialog] = useState(false);
  const [simulationDialog, setSimulationDialog] = useState(false);
  const [simulatedText, setSimulatedText] = useState('Olá! Gostaria de confirmar meu próximo horário.');
  const [failNextMessage, setFailNextMessage] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const panelButton = useRef<HTMLButtonElement>(null);

  const selected = state.conversations.find(conversation => conversation.id === selectedId);
  const patient = state.patients.find(item => item.id === selected?.patientId);
  const owner = state.users.find(user => user.id === selected?.assigneeId);
  const owned = selected?.status === 'humano' && selected.assigneeId === state.currentUserId;
  const claimable = !!selected && !selected.assigneeId && (selected.status === 'ia' || selected.status === 'aguardando');
  const closed = selected?.status === 'encerrada';
  const counts = inboxCounts(state.conversations, state.currentUserId);
  const searchValue = normalize(search.trim());
  const visibleIn = (view: InboxView) => orderConversations(state.conversations.filter(conversation => {
    const contact = state.patients.find(item => item.id === conversation.patientId);
    if (!contact || !matchesFilters(conversation, { ...filters, view, status: view === filters.view ? filters.status : '' }, state.currentUserId)) return false;
    return !searchValue || normalize(`${contact.name} ${contact.phone}`).includes(searchValue)
      || (search.replace(/\D/g, '').length > 0 && contact.phone.replace(/\D/g, '').includes(search.replace(/\D/g, '')));
  }), state.currentUserId);
  const list = visibleIn(filters.view);
  const displayedMessages = selected ? [...selected.messages] : [];
  if (pending && pending.conversationId === selected?.id && !displayedMessages.some(message => message.id === pending.message.id)) displayedMessages.push(pending.message);

  useEffect(() => {
    const host = pageRef.current?.closest<HTMLElement>('.app-main-conversations');
    const viewport = window.visualViewport;
    function fitViewport() {
      const height = viewport && viewport.scale === 1 ? viewport.height : window.innerHeight;
      host?.style.setProperty('--conversation-viewport-height', `${height}px`);
    }
    fitViewport();
    window.addEventListener('resize', fitViewport);
    viewport?.addEventListener('resize', fitViewport);
    return () => {
      window.removeEventListener('resize', fitViewport);
      viewport?.removeEventListener('resize', fitViewport);
      host?.style.removeProperty('--conversation-viewport-height');
    };
  }, []);

  function navigate(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setError('');
    setNotice('');
    router.push(`/conversas${next.size ? `?${next}` : ''}`, { scroll: false });
  }
  /** Changing tab opens the first conversation of that tab (not on phones); an
   * empty tab keeps the conversation that is open. */
  function changeView(view: InboxView) {
    const first = visibleIn(view)[0];
    navigate({ view, status: null, id: mode === 'mobile' ? null : first?.id ?? selectedId });
  }

  async function execute(command: Command, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await act(command);
      setNotice(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir. Tente novamente.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    if (!selected) return;
    const id = selected.id;
    if (await execute({ type: 'conversation.claim', id }, 'Conversa assumida. Você já pode responder.')) {
      const next = new URLSearchParams(params.toString());
      next.set('view', viewOf('humano')); next.delete('status'); next.set('id', id);
      router.push(`/conversas?${next}`, { scroll: false });
      setTimeout(() => composer.current?.focus(), 0);
    }
  }

  async function sendMessage(retry?: Message) {
    if (!selected || !owned || busy) return;
    const text = (retry?.text || drafts[selected.id] || '').trim();
    if (!text) return;
    const id = retry?.id || `message-${crypto.randomUUID()}`;
    const message: Message = { id, text, author: 'humano', authorId: state.currentUserId, at: state.now, delivery: 'pendente', sessionId: selected.sessionId };
    setPending({ conversationId: selected.id, message });
    const shouldFail = failNextMessage && !retry;
    const success = await execute({ type: 'conversation.send', id: selected.id, text, messageId: id, fail: shouldFail }, shouldFail ? 'Falha de envio simulada. Use “Tentar novamente” na mensagem.' : 'Mensagem enviada.');
    setPending(null);
    if (success) {
      setDrafts(current => ({ ...current, [selected.id]: '' }));
      if (shouldFail) setFailNextMessage(false);
    }
  }

  function ask(question: string) {
    if (!selected) return;
    const exchange: Exchange = { id: crypto.randomUUID(), question, answer: answerConversationQuestion(state, selected.id, question) };
    setChats(current => ({ ...current, [selected.id]: [...(current[selected.id] ?? []), exchange] }));
  }
  /** Puts the draft in the composer (after a blank line when there is text) and never sends. */
  function insertDraft(text: string) {
    if (!selected || !owned) return;
    setDrafts(current => ({ ...current, [selected.id]: current[selected.id]?.trim() ? `${current[selected.id].trimEnd()}\n\n${text}` : text }));
    if (mode !== 'inline') setPanelChoice(false);
    setTimeout(() => composer.current?.focus(), mode === 'inline' ? 0 : 80);
  }

  const since = selected?.status === 'aguardando' ? waitingSince(selected) : undefined;
  const ended = selected && closed ? closedInfo(selected, state) : undefined;
  const statusLine = !selected ? '' : selected.status === 'aguardando' ? (since ? formatElapsed(since, state.now) : '')
    : selected.status === 'ia' ? 'IA conduzindo o atendimento'
      : selected.status === 'humano' ? (owned ? 'com você' : `com ${owner?.name ?? 'outro atendente'}`)
        : ended ? `${ended.when} por ${ended.by}` : '';
  const name = patient ? firstName(patient.name) : '';

  const panel = selected && patient && panelOpen ? <ContextPanel state={state} conversation={selected} tab={panelTab} onTab={setPanelTab}
    onClose={() => { setPanelChoice(false); requestAnimationFrame(() => panelButton.current?.focus()); }}
    exchanges={chats[selected.id] ?? []} onAsk={ask} onClear={() => setChats(current => ({ ...current, [selected.id]: [] }))}
    selectedSlot={slots[selected.id]} onSelectSlot={id => setSlots(current => ({ ...current, [selected.id]: id }))}
    canInsert={owned} insertBlocked={insertBlockedReason(state, selected)} onInsert={insertDraft} /> : null;

  return <div ref={pageRef} className={`conversations-page${selected ? ' has-conversation' : ''}${panel && mode === 'inline' ? ' has-panel' : ''}`}>
    {/* Phones show the conversation alone; the page keeps its h1 for assistive technology. */}
    {mode === 'mobile' && selected ? <h1 className="sr-only">Conversas</h1> : <Inbox state={state} filters={filters} counts={counts} conversations={list} selectedId={selectedId} search={search} onSearch={setSearch}
      filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen(open => !open)} onView={changeView}
      onFilter={changes => navigate({ view: filters.view, ...changes })} onSelect={id => navigate({ id })} />}

    {selected && patient ? <section aria-label={`Conversa com ${patient.name}`} data-conversation-id={selected.id} className="conversation-detail">
      <header className="conversation-header">
        {mode === 'mobile' && <Button variant="ghost" size="icon" className="conversation-back" aria-label="Voltar para lista de conversas" onClick={() => navigate({ id: null })}><ArrowLeft size={18} /></Button>}
        <div className="conversation-heading">
          <div className="conversation-title"><h2>{patient.name}</h2><span className="tabular">{patient.phone}</span></div>
          <p className="conversation-ownership">
            <Badge tone={conversationStatusTones[selected.status]}>{selected.status === 'aguardando' && <Clock3 aria-hidden="true" />}{selected.status === 'ia' && <Sparkles aria-hidden="true" />}{conversationStatusLabels[selected.status]}</Badge>
            {statusLine && <span>{statusLine}</span>}
            {selected.reason && !closed && <span className="conversation-reason"><Repeat size={14} aria-hidden="true" />Motivo: <strong>{selected.reason}</strong></span>}
          </p>
        </div>
        <div className="conversation-actions">
          {owned && mode !== 'mobile' && <Button variant="secondary" disabled={busy} onClick={() => setCloseDialog(true)}>Encerrar</Button>}
          <Menu label="Mais ações" icon={<MoreHorizontal size={18} />} items={[
            { label: 'Devolver à IA', icon: <Bot size={16} aria-hidden="true" />, disabled: !owned || busy, onSelect: () => { void execute({ type: 'conversation.return', id: selected.id }, 'A IA retomará após a próxima mensagem simulada do paciente.'); } },
            { label: 'Encerrar atendimento', icon: <Check size={16} aria-hidden="true" />, disabled: !owned || busy, onSelect: () => setCloseDialog(true) },
            { label: 'Ver cadastro do paciente', icon: <UserRound size={16} aria-hidden="true" />, onSelect: () => router.push(`/gestao/pacientes?id=${patient.id}&context=${selected.id}`) },
            { separator: true, label: 'Ferramentas da demonstração' },
            { label: 'Simular mensagem recebida', icon: <MessageCircle size={16} aria-hidden="true" />, onSelect: () => setSimulationDialog(true) },
            { label: 'Simular falha no próximo envio', icon: <TriangleAlert size={16} aria-hidden="true" />, disabled: !owned || failNextMessage, onSelect: () => { setFailNextMessage(true); setNotice('O próximo envio terá uma falha simulada para testar a nova tentativa.'); } },
          ]} />
          <button ref={panelButton} type="button" className="btn btn-ghost btn-icon" aria-label="Painel do paciente e assistente" title="Painel do paciente e assistente" aria-pressed={panelOpen} onClick={() => setPanelChoice(!panelOpen)}><PanelRight size={18} /></button>
        </div>
      </header>

      <MessageHistory key={selected.id} state={state} conversation={selected} patientName={patient.name} messages={displayedMessages} pendingId={pending?.conversationId === selected.id ? pending.message.id : undefined} busy={busy} owned={owned} onRetry={message => { void sendMessage(message); }} />

      <div className="conversation-bottom">
        {error && <div role="alert" className="conversation-banner is-error"><CircleAlert size={16} aria-hidden="true" /><span>{error}</span><button type="button" aria-label="Fechar mensagem de erro" onClick={() => setError('')}><X size={14} /></button></div>}
        {notice && <div role="status" className="conversation-banner is-success"><CircleCheck size={16} aria-hidden="true" /><span>{notice}</span></div>}
        {owned ? <form className="conversation-composer" onSubmit={event => { event.preventDefault(); void sendMessage(); }}>
          <label className="sr-only" htmlFor={`composer-${selected.id}`}>Mensagem para {patient.name}</label>
          <textarea ref={composer} id={`composer-${selected.id}`} placeholder={`Escreva para ${name}…`} rows={3} className="conversation-compose-input" value={drafts[selected.id] || ''}
            onChange={event => setDrafts(current => ({ ...current, [selected.id]: event.target.value }))}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} />
          <div className="conversation-composer-footer"><span className="conversation-hint">Enter envia · Shift+Enter quebra linha</span>
            <Button type="submit" aria-label="Enviar mensagem" disabled={busy || !(drafts[selected.id] || '').trim()}><Send size={16} />{busy && pending ? 'Enviando…' : 'Enviar'}</Button></div>
        </form> : claimable ? <div className={`composer-card is-${selected.status}`}>
          <span className="composer-card-icon" aria-hidden="true">{selected.status === 'ia' ? <Sparkles size={16} /> : <Clock3 size={16} />}</span>
          <div className="composer-card-text"><strong>{selected.status === 'ia' ? 'A IA está conduzindo este atendimento' : 'Esta conversa aguarda um atendente'}</strong>
            <p>{selected.status === 'ia' ? 'Assuma se precisar responder diretamente ao paciente.' : `Assuma para responder a ${name}.`}</p></div>
          <Button disabled={busy} onClick={() => { void claim(); }}><UserCheck size={16} />Assumir conversa</Button>
        </div> : <p className="composer-notice">{closed
          ? `Encerrada${ended ? ` ${ended.when} por ${ended.by}` : ''}. Se o paciente escrever de novo, uma nova sessão é aberta.`
          : `${owner?.name ?? 'Outro atendente'} está atendendo esta conversa. Só quem assumiu pode responder.`}</p>}
      </div>
    </section> : <section className="conversation-idle" aria-label="Nenhuma conversa aberta">
      <span className="conversation-idle-icon" aria-hidden="true"><MessageCircle size={22} /></span>
      <h2>Selecione uma conversa</h2>
      <p>Abra um atendimento da lista para ler o histórico, assumir e responder.</p>
      {selectedId && <p role="alert" className="conversation-idle-alert">Essa conversa não está disponível na demonstração atual.</p>}
    </section>}

    {panel && mode === 'inline' && <aside className="context-column" aria-label="Paciente e assistente">{panel}</aside>}
    {panel && mode !== 'inline' && <Drawer label="Paciente e assistente" side={mode === 'mobile' ? 'full' : 'right'} className="context-drawer" onClose={() => setPanelChoice(false)}>{panel}</Drawer>}

    {closeDialog && selected && <Modal title="Encerrar atendimento?" onClose={() => !busy && setCloseDialog(false)}><p className="muted small">O atendimento de <strong>{patient?.name}</strong> será concluído. O histórico fica disponível e uma nova mensagem recebida iniciará outra sessão.</p><div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => setCloseDialog(false)}>Continuar atendendo</Button><Button disabled={busy} onClick={async () => { if (await execute({ type: 'conversation.close', id: selected.id }, 'Atendimento encerrado. O histórico foi preservado.')) setCloseDialog(false); }}>Encerrar atendimento</Button></div>{error && <p role="alert" className="error-banner">{error}</p>}</Modal>}

    {simulationDialog && selected && <Modal title="Simular mensagem recebida" onClose={() => !busy && setSimulationDialog(false)}><p className="muted small">Envie uma mensagem fictícia como {patient?.name}. {closed ? 'Uma nova sessão será aberta, preservando as anteriores.' : selected.status === 'ia' ? 'A IA de atendimento retomará a conversa.' : 'A mensagem será adicionada ao atendimento atual.'}</p><form className="page-stack simulation-form" onSubmit={async event => { event.preventDefault(); if (await execute({ type: 'conversation.receive', id: selected.id, text: simulatedText.trim() }, 'Mensagem fictícia recebida.')) setSimulationDialog(false); }}><Field label="Mensagem do paciente"><textarea required maxLength={2000} rows={3} value={simulatedText} onChange={event => setSimulatedText(event.target.value)} /></Field>{owned && <label className="checkbox-label"><input type="checkbox" checked={failNextMessage} onChange={event => setFailNextMessage(event.target.checked)} /><span>Simular falha no próximo envio do atendente, para testar a nova tentativa.</span></label>}<div className="form-actions"><Button variant="secondary" disabled={busy} type="button" onClick={() => setSimulationDialog(false)}>Fechar</Button><Button disabled={busy || !simulatedText.trim()} type="submit"><MessageCircle size={16} />Receber mensagem</Button></div></form>{error && <p role="alert" className="error-banner">{error}</p>}</Modal>}
  </div>;
}
