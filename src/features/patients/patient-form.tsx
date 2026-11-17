'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Plus, UserPen, UserPlus, X } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Button, Field, Modal } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { normalizePhone } from '@/lib/format';
import type { Patient } from '@/lib/types';


type Optional = 'insurance' | 'notes';
const optionalLabels: Record<Optional, string> = { insurance: 'Convênio', notes: 'Observação' };

/** "Cadastrar paciente" / "Editar cadastro". Same validation, Command (`patient.save`),
 * error banner and shared-phone confirmation as before; the form keeps its data after a
 * failure. Insurance and notes start hidden unless they already have a value. */
export function PatientForm({ patient, onClose }: { patient?: Patient; onClose: () => void }) {
  const { state, act } = useDemo();
  const [form, setForm] = useState({ name: patient?.name ?? '', phone: patient?.phone ?? '', insurance: patient?.insurance ?? '', notes: patient?.notes ?? '' });
  const [visible, setVisible] = useState<Record<Optional, boolean>>({ insurance: !!patient?.insurance, notes: !!patient?.notes });
  const [shared, setShared] = useState(false);
  const action = useAction();
  const nameRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ kind: 'field' | 'add'; key: Optional } | null>(null);
  const ids = { insurance: useId(), notes: useId(), notesHint: useId(), error: useId() };
  /** The error names its input (`CommandError.field`): mark that input, not just the banner. */
  const invalid = (field: string) => action.field === field ? { 'aria-invalid': true, 'aria-describedby': ids.error } as const : {};
  const duplicates = state.patients.filter((p) => p.id !== patient?.id && normalizePhone(p.phone) === normalizePhone(form.phone) && normalizePhone(form.phone).length > 0);

  // Runs after the Modal's own initial focus (child effects first), so the name wins.
  useEffect(() => { nameRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const target = pendingFocus.current; if (!target) return;
    pendingFocus.current = null;
    bodyRef.current?.querySelector<HTMLElement>(`[data-${target.kind}="${target.key}"]`)?.focus();
  });

  function show(key: Optional) { pendingFocus.current = { kind: 'field', key }; setVisible({ ...visible, [key]: true }); }
  function remove(key: Optional) {
    pendingFocus.current = { kind: 'add', key };
    setVisible({ ...visible, [key]: false }); setForm({ ...form, [key]: '' });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await action.run(() => act({ type: 'patient.save', input: form, id: patient?.id, allowSharedPhone: shared }))) onClose();
  }
  const removeButton = (key: Optional) => <button type="button" className="field-remove" aria-label={`Remover campo ${optionalLabels[key]}`} onClick={() => remove(key)}><X size={12} aria-hidden="true" />Remover</button>;
  const hidden = (['insurance', 'notes'] as Optional[]).filter(key => !visible[key]);

  return <Modal title={patient ? 'Editar cadastro' : 'Cadastrar paciente'} onClose={onClose} className="patient-modal" icon={patient ? <UserPen size={16} /> : <UserPlus size={16} />}>
    <form onSubmit={submit}>
      <div className="patient-modal-body" ref={bodyRef}>
        {action.error && <div className="error-banner" role="alert" id={ids.error}>{action.error}</div>}
        <Field label="Nome completo"><input ref={nameRef} required minLength={3} autoComplete="off" aria-label="Nome completo" {...invalid('name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do paciente" /></Field>
        <Field label="Telefone" hint="Com DDD. Usado para identificar as conversas do WhatsApp."><input required type="tel" autoComplete="off" aria-label="Telefone" {...invalid('phone')} value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setShared(false); }} placeholder="(81) 90000-0000" /></Field>
        {visible.insurance && <div className="field">
          <div className="field-head"><label htmlFor={ids.insurance}>Convênio</label>{removeButton('insurance')}</div>
          <select id={ids.insurance} data-field="insurance" aria-label="Convênio" value={form.insurance} onChange={(e) => setForm({ ...form, insurance: e.target.value })}><option value="">Sem convênio / particular</option>{Array.from(new Set([...state.clinic.insurance, ...(form.insurance ? [form.insurance] : [])])).map((insurance) => <option key={insurance}>{insurance}</option>)}</select>
        </div>}
        {visible.notes && <div className="field">
          <div className="field-head"><label htmlFor={ids.notes}>Observação administrativa</label>{removeButton('notes')}</div>
          <textarea id={ids.notes} data-field="notes" aria-label="Observação administrativa" aria-describedby={ids.notesHint} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Ex.: prefere contato no período da tarde" />
          <small id={ids.notesHint}>Não registre informações clínicas, diagnósticos ou prescrições.</small>
        </div>}
        {hidden.length > 0 && <div className="optional-fields">
          {!visible.insurance && <p className="field-hint">Sem convênio, o paciente fica como particular.</p>}
          <div className="optional-buttons">{hidden.map(key => <button key={key} data-add={key} type="button" className="add-field" onClick={() => show(key)}><Plus size={14} aria-hidden="true" />{optionalLabels[key]}</button>)}</div>
        </div>}
        {duplicates.length > 0 && <div className="warning-banner"><strong>Este telefone já está vinculado a {duplicates.map((p) => p.name).join(', ')}.</strong><p>Confira o cadastro existente antes de criar outro contato.</p>{duplicates.map((p) => <Link key={p.id} className="text-link" href={`/gestao/pacientes?id=${p.id}`} onClick={onClose}>Abrir cadastro de {p.name} →</Link>)}<label className="checkbox-label"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />Conferi o vínculo: este é outro paciente que compartilha o telefone.</label></div>}
      </div>
      <div className="patient-modal-footer">
        <small>Somente dados administrativos.</small>
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={action.busy || (duplicates.length > 0 && !shared)}>{action.busy ? 'Salvando…' : patient ? 'Salvar alterações' : 'Cadastrar paciente'}</Button>
      </div>
    </form>
  </Modal>;
}
