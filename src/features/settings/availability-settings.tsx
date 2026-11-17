'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CalendarOff, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Feedback } from '@/components/feedback';
import { HoursEditor } from '@/components/hours-editor';
import { Button, EmptyState, Field, Modal } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { formatDate } from '@/lib/date';
import { appointmentsOutsideAvailability } from '@/lib/scheduling';
import type { Block, Professional } from '@/lib/types';
import { BlockForm } from '../agenda/block-form';
import { AvailabilityConfirmation } from './shared';

function ProfessionalHours({ professional }: { professional: Professional }) {
  const { state, act } = useDemo();
  const [availability, setAvailability] = useState(() => structuredClone(professional.availability));
  const [confirm, setConfirm] = useState(false);
  const action = useAction();
  const input = { name: professional.name, specialties: professional.specialties, active: professional.active, color: professional.color, availability };
  const proposed = { ...state, professionals: state.professionals.map(item => item.id === professional.id ? { ...item, availability } : item) };
  const conflicts = appointmentsOutsideAvailability(proposed, professional.id);

  async function save() {
    if (await action.run(() => act({ type: 'professional.save', id: professional.id, input }), `Disponibilidade de ${professional.name} atualizada.`)) setConfirm(false);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    action.clear();
    if (conflicts.length) setConfirm(true);
    else void save();
  }

  return <form onSubmit={submit} className="page-stack">
    <Feedback error={action.error} success={action.success} />
    <HoursEditor label={professional.name} value={availability} onChange={setAvailability} />
    <div className="settings-footer">
      <p className="settings-note">Os horários também respeitam o funcionamento da clínica.</p>
      <Button type="submit" disabled={action.busy}><Save size={16} />{action.busy ? 'Salvando…' : 'Salvar disponibilidade'}</Button>
    </div>
    {confirm && <AvailabilityConfirmation count={conflicts.length} busy={action.busy} error={action.error} onClose={() => setConfirm(false)} onConfirm={save} />}
  </form>;
}

/** Weekly availability of each professional and their date blocks. */
export function AvailabilitySettings() {
  const { state, act } = useDemo();
  const params = useSearchParams();
  const router = useRouter();
  const [professionalId, setProfessionalId] = useState(params.get('professional') || state.professionals[0]?.id || '');
  const [blockForm, setBlockForm] = useState<Block | 'new' | null>(() => state.blocks.find(block => block.id === params.get('block')) ?? null);
  const [removeBlock, setRemoveBlock] = useState<Block | null>(null);
  const action = useAction();
  const professional = state.professionals.find(item => item.id === professionalId);
  const blocks = state.blocks.filter(block => block.professionalId === professionalId)
    .sort((left, right) => `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`));

  async function remove() {
    if (!removeBlock) return;
    if (await action.run(() => act({ type: 'block.delete', id: removeBlock.id }), 'Bloqueio removido. O intervalo volta a seguir a disponibilidade semanal.')) setRemoveBlock(null);
  }
  function closeBlockForm(saved?: boolean) {
    setBlockForm(null);
    if (saved) action.setSuccess('Bloqueio salvo com sucesso.');
    if (params.has('block')) {
      const next = new URLSearchParams(params.toString());
      next.delete('block');
      router.replace(`/gestao/configuracoes?${next}`);
    }
  }

  return <div className="page-stack">
    <Feedback error={removeBlock ? '' : action.error} success={action.success} />
    <section className="card settings-card">
      <div className="card-header settings-card-head">
        <div><h2>Disponibilidade da equipe</h2><p>Defina os horários de cada profissional de saúde.</p></div>
        <Field label="Profissional de saúde">
          <select value={professionalId} onChange={event => { setProfessionalId(event.target.value); action.clear(); }}>
            {state.professionals.map(item => <option key={item.id} value={item.id}>{item.name}{!item.active ? ' · Inativo' : ''}</option>)}
          </select>
        </Field>
      </div>
      {professional
        ? <ProfessionalHours professional={professional} key={professional.id} />
        : <EmptyState title="Nenhum profissional cadastrado" description="Cadastre profissionais na área Equipe para definir a disponibilidade." />}
    </section>

    <section className="card settings-card">
      <div className="card-header settings-card-head">
        <div><h2><CalendarOff size={18} aria-hidden="true" />Bloqueios por data</h2><p>Exceções na agenda de {professional?.name || 'cada profissional'}.</p></div>
        <Button variant="secondary" disabled={!professional} onClick={() => setBlockForm('new')}><Plus size={16} />Novo bloqueio</Button>
      </div>
      {blocks.length ? <div className="table-wrap">
        <table className="data-table settings-blocks">
          <thead><tr><th scope="col">Data e horário</th><th scope="col">Motivo</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{blocks.map(block => <tr key={block.id}>
            <td><strong>{formatDate(block.date, { year: 'numeric' })}</strong><small>{block.start}–{block.end}</small></td>
            <td>{block.reason}</td>
            <td><div className="inline-actions settings-row-actions">
              <Button variant="ghost" size="icon" aria-label={`Editar bloqueio de ${formatDate(block.date)}`} onClick={() => setBlockForm(block)}><Pencil size={16} /></Button>
              <Button variant="ghost" size="icon" aria-label={`Remover bloqueio de ${formatDate(block.date)}`} onClick={() => { action.clear(); setRemoveBlock(block); }}><Trash2 size={16} /></Button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div> : <EmptyState title="Sem bloqueios para este profissional" description="Os horários seguem a disponibilidade semanal e o funcionamento da clínica." />}
    </section>

    {blockForm && <BlockForm block={blockForm === 'new' ? undefined : blockForm} professionalId={professionalId} onClose={closeBlockForm} />}
    {removeBlock && <Modal title="Remover bloqueio?" onClose={() => !action.busy && setRemoveBlock(null)}>
      <p className="muted small">O intervalo de <strong>{formatDate(removeBlock.date)} às {removeBlock.start}–{removeBlock.end}</strong> ficará disponível conforme os horários da clínica e do profissional.</p>
      <p className="muted small">Motivo registrado: {removeBlock.reason}</p>
      <Feedback error={action.error} />
      <div className="form-actions">
        <Button variant="secondary" disabled={action.busy} onClick={() => setRemoveBlock(null)}>Manter bloqueio</Button>
        <Button variant="danger" disabled={action.busy} onClick={remove}>Remover bloqueio</Button>
      </div>
    </Modal>}
  </div>;
}
