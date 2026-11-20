'use client';

import { useState, type FormEvent } from 'react';
import { Archive, BookOpen, Pencil, Plus, RotateCcw, Save } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Feedback } from '@/components/feedback';
import { Badge, Button, EmptyState, Field, Modal, SearchInput } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { normalizeText, plural } from '@/lib/format';
import type { Knowledge } from '@/lib/types';

type Filter = 'active' | 'archived' | 'all';
const filters: { value: Filter; label: string }[] = [
  { value: 'active', label: 'Ativas' },
  { value: 'archived', label: 'Arquivadas' },
  { value: 'all', label: 'Todas' },
];
const categories = ['Horários', 'Convênios', 'Preparos administrativos', 'Políticas administrativas'];

function KnowledgeForm({ document, onClose }: { document?: Knowledge; onClose: () => void }) {
  const { act } = useDemo();
  const [input, setInput] = useState<Omit<Knowledge, 'id'>>(() => document
    ? { title: document.title, category: document.category, content: document.content, archived: document.archived }
    : { title: '', category: 'Políticas administrativas', content: '', archived: false });
  const action = useAction();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await action.run(() => act({ type: 'knowledge.save', input, id: document?.id }))) onClose();
  }
  return <Modal title={document ? 'Editar orientação' : 'Nova orientação administrativa'} onClose={() => !action.busy && onClose()} wide>
    <form onSubmit={submit} className="page-stack">
      <p className="muted small">Registre informações administrativas fornecidas pela clínica. Esta base de demonstração não gera nem valida orientações médicas.</p>
      <Feedback error={action.error} />
      <Field label="Título da orientação"><input required maxLength={140} value={input.title} onChange={event => setInput({ ...input, title: event.target.value })} /></Field>
      <Field label="Categoria">
        <input required list="knowledge-categories" maxLength={70} value={input.category} onChange={event => setInput({ ...input, category: event.target.value })} />
        <datalist id="knowledge-categories">{categories.map(category => <option key={category} value={category} />)}</datalist>
      </Field>
      <Field label="Conteúdo da orientação"><textarea required rows={6} maxLength={6000} value={input.content} onChange={event => setInput({ ...input, content: event.target.value })} /></Field>
      <div className="form-actions">
        <Button type="button" disabled={action.busy} variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={action.busy}><Save size={16} />{action.busy ? 'Salvando…' : 'Salvar orientação'}</Button>
      </div>
    </form>
  </Modal>;
}

/** Administrative guidance the reception (and the assistant's drafts) rely on. */
export function KnowledgeSettings() {
  const { state, act } = useDemo();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [form, setForm] = useState<Knowledge | 'new' | null>(null);
  const [archive, setArchive] = useState<Knowledge | null>(null);
  const action = useAction();
  const query = normalizeText(search);
  const documents = state.knowledge.filter(document => (filter === 'all' || (filter === 'archived' ? document.archived : !document.archived))
    && normalizeText(`${document.title} ${document.category} ${document.content}`).includes(query));

  async function toggleArchive(document: Knowledge) {
    const input = { title: document.title, category: document.category, content: document.content, archived: !document.archived };
    const message = document.archived ? 'Orientação reativada.' : 'Orientação arquivada. Ela continua disponível no filtro Arquivadas.';
    if (await action.run(() => act({ type: 'knowledge.save', id: document.id, input }), message)) setArchive(null);
  }

  return <div className="page-stack">
    <Feedback error={archive ? '' : action.error} success={action.success} />
    <section className="card settings-card">
      <div className="card-header settings-card-head">
        <div><h2><BookOpen size={18} aria-hidden="true" />Base de conhecimento</h2><p>Informações da clínica, sempre à mão para o atendimento.</p></div>
        <Button onClick={() => setForm('new')}><Plus size={16} />Nova orientação</Button>
      </div>
      <div className="knowledge-toolbar">
        <SearchInput aria-label="Pesquisar orientações" placeholder="Buscar título, categoria ou conteúdo" value={search} onChange={event => setSearch(event.target.value)} />
        <div className="segmented" role="group" aria-label="Situação das orientações">
          {filters.map(option => <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}
        </div>
        <span className="knowledge-count tabular">{plural(documents.length, 'orientação', 'orientações')}</span>
      </div>
      {documents.length ? <div className="knowledge-grid">
        {documents.map(document => <article key={document.id} className="knowledge-card">
          <div className="knowledge-tags"><Badge tone={document.archived ? 'neutral' : 'success'}>{document.category}</Badge>{document.archived && <Badge>Arquivada</Badge>}</div>
          <h3>{document.title}</h3>
          <p>{document.content}</p>
          <div className="knowledge-actions">
            <Button variant="ghost" disabled={action.busy} onClick={() => setForm(document)}><Pencil size={14} />Editar</Button>
            <Button variant="ghost" disabled={action.busy} onClick={() => { action.clear(); if (document.archived) void toggleArchive(document); else setArchive(document); }}>
              {document.archived ? <RotateCcw size={14} /> : <Archive size={14} />}{document.archived ? 'Reativar' : 'Arquivar'}
            </Button>
          </div>
        </article>)}
      </div> : <EmptyState title="Nenhuma orientação encontrada" description="Altere a pesquisa ou o filtro para consultar a base da clínica.">
        <Button variant="secondary" onClick={() => { setSearch(''); setFilter('all'); }}>Limpar filtros</Button>
      </EmptyState>}
    </section>

    {form && <KnowledgeForm document={form === 'new' ? undefined : form} onClose={() => setForm(null)} />}
    {archive && <Modal title="Arquivar orientação?" onClose={() => !action.busy && setArchive(null)}>
      <p className="muted small">“{archive.title}” deixará a lista ativa. Seu conteúdo será preservado e poderá ser reativado pelo filtro Arquivadas.</p>
      <Feedback error={action.error} />
      <div className="form-actions">
        <Button variant="secondary" disabled={action.busy} onClick={() => setArchive(null)}>Manter ativa</Button>
        <Button disabled={action.busy} onClick={() => toggleArchive(archive)}><Archive size={16} />Arquivar orientação</Button>
      </div>
    </Modal>}
  </div>;
}
