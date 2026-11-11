'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Archive, ArrowUpRight, BookOpen, Building2, CalendarOff, Check, Clock3, FlaskConical, Pencil, Plus, RotateCcw, Save, Search, Trash2, X } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { TimeInput } from '@/components/date-time-fields';
import { BlockForm } from './agenda/block-form';
import { Badge, Button, EmptyState, Field, Modal, PageHeading } from '@/components/ui';
import { dateTime, formatDate, minutes } from '@/lib/date';
import { getAvailability } from '@/lib/metrics';
import { failNextRequest } from '@/lib/services';
import type { Appointment, Block, Clinic, DemoState, Knowledge, Professional, WeekSlot } from '@/lib/types';

const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const weekOrder = [1, 2, 3, 4, 5, 6, 0];
function errorText(error: unknown) { return error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.'; }
function lines(value: string) { return [...new Set(value.split(/[\n,]/).map((line) => line.trim()).filter(Boolean))]; }
function futureConflicts(state: DemoState): Appointment[] {
  return state.appointments.filter((appointment) => ['agendada', 'confirmada'].includes(appointment.status)
    && new Date(dateTime(appointment.date, appointment.start)).getTime() > new Date(state.now).getTime()
    && !getAvailability(state, appointment.professionalId, appointment.date).some((slot) => minutes(slot.start) <= minutes(appointment.start)
      && minutes(slot.end) >= minutes(appointment.start) + appointment.duration));
}

function Feedback({ error, success }: { error: string; success?: string }) {
  return <>{error && <div className="error-banner" role="alert">{error}</div>}{success && <div className="success-banner" role="status"><Check size={16} />{success}</div>}</>;
}

function HoursEditor({ value, onChange, label }: { value: WeekSlot[]; onChange: (slots: WeekSlot[]) => void; label: string }) {
  function change(index: number, field: 'start' | 'end', time: string) {
    onChange(value.map((slot, slotIndex) => slotIndex === index ? { ...slot, [field]: time } : slot));
  }
  return <div className="overflow-x-auto"><div className="min-w-[300px] divide-y divide-[var(--border)]">{weekOrder.map((day) => {
    const slots = value.map((slot, index) => ({ ...slot, index })).filter((slot) => slot.day === day);
    return <div key={day} className="flex flex-wrap items-center gap-3 py-3"><div className="w-[116px] shrink-0 text-sm font-medium">{weekdays[day]}</div><div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{slots.length ? slots.map((slot, order) => <div key={slot.index} className="flex items-center gap-2"><TimeInput required label={`${label}: início de ${weekdays[day]}, faixa ${order + 1}`} value={slot.start} onChange={time => change(slot.index, 'start', time)} className="hours-input" /><span className="text-xs text-[var(--muted)]">às</span><TimeInput required label={`${label}: fim de ${weekdays[day]}, faixa ${order + 1}`} value={slot.end} onChange={time => change(slot.index, 'end', time)} className="hours-input" /><button type="button" onClick={() => onChange(value.filter((_, index) => index !== slot.index))} aria-label={`Remover faixa ${order + 1} de ${weekdays[day]}`} className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger-ink)]"><X size={16} /></button></div>) : <span className="text-xs text-[var(--muted)]">Sem atendimento</span>}</div><button type="button" onClick={() => onChange([...value, { day, start: slots.length ? '14:00' : '08:00', end: slots.length ? '18:00' : '12:00' }])} aria-label={`Adicionar faixa de ${weekdays[day]}`} className="flex items-center gap-1.5 rounded-lg p-2 text-xs font-medium text-[var(--green-ink)] hover:bg-[var(--mint)]"><Plus size={14} /><span>Faixa</span></button></div>;
  })}</div></div>;
}

function ConflictNotice({ appointments, state }: { appointments: Appointment[]; state: DemoState }) {
  if (!appointments.length) return null;
  return <div className="rounded-xl border border-[var(--warning-border)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--warning-ink)]"><strong>{appointments.length} {appointments.length === 1 ? 'consulta futura precisa' : 'consultas futuras precisam'} de revisão.</strong><p>Os horários abaixo ficaram fora da disponibilidade. As consultas permanecem agendadas; revise ou remarque com o paciente.</p><ul className="mt-2 space-y-1">{appointments.slice(0, 8).map((appointment) => <li key={appointment.id}><Link className="inline-flex items-center gap-1 underline underline-offset-4" href={`/gestao/agenda?date=${appointment.date}&professional=${appointment.professionalId}&patient=${appointment.patientId}`}>
    {state.patients.find((patient) => patient.id === appointment.patientId)?.name} · {formatDate(appointment.date)} às {appointment.start}<ArrowUpRight size={13} /></Link></li>)}</ul>{appointments.length > 8 && <p className="mt-2">Mais {appointments.length - 8} consultas precisam de revisão na agenda.</p>}</div>;
}

function SaveAvailabilityConfirmation({ count, busy, error, onClose, onConfirm }: { count: number; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) {
  return <Modal title="Revisar mudança de disponibilidade" onClose={() => !busy && onClose()}><p className="text-sm leading-6 text-[var(--muted)]">Esta alteração deixa <strong>{count} {count === 1 ? 'consulta futura fora' : 'consultas futuras fora'} da disponibilidade</strong>. Os agendamentos serão preservados e identificados para revisão nesta página.</p><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Você poderá remarcar cada consulta pela agenda após salvar.</p><Feedback error={error} /><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={onClose}>Voltar e ajustar</Button><Button disabled={busy} onClick={onConfirm}>Salvar alteração</Button></div></Modal>;
}

function ClinicSettings() {
  const { state, act } = useDemo();
  const [clinic, setClinic] = useState<Clinic>(() => structuredClone(state.clinic));
  const [insurance, setInsurance] = useState(state.clinic.insurance.join('\n'));
  const [specialties, setSpecialties] = useState(state.clinic.specialties.join('\n'));
  const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const input = { ...clinic, insurance: lines(insurance), specialties: lines(specialties) };
  const conflicts = futureConflicts({ ...state, clinic: input });
  async function save() {
    setBusy(true); setError(''); setSuccess('');
    try { await act({ type: 'clinic.save', input }); setSuccess('Informações da clínica atualizadas.'); setConfirm(false); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); setError(''); if (conflicts.length) setConfirm(true); else void save(); }
  return <form onSubmit={submit} className="page-stack"><Feedback error={error} success={success} /><section className="card p-6"><div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-[var(--mint)] p-3 text-[var(--green-ink)]"><Building2 size={21} /></span><div><h2 className="text-lg font-semibold">Informações da clínica</h2><p className="muted mt-1 text-sm">Os dados administrativos que sua equipe usa no dia a dia.</p></div></div><div className="form-grid"><Field label="Nome da clínica"><input required value={clinic.name} onChange={(event) => setClinic({ ...clinic, name: event.target.value })} /></Field><Field label="Telefone de contato"><input required type="tel" value={clinic.phone} onChange={(event) => setClinic({ ...clinic, phone: event.target.value })} /></Field><div className="md:col-span-2"><Field label="Endereço"><input required value={clinic.address} onChange={(event) => setClinic({ ...clinic, address: event.target.value })} /></Field></div><Field label="Convênios aceitos" hint="Um convênio por linha. Deixe vazio para atendimento particular."><textarea rows={4} value={insurance} onChange={(event) => setInsurance(event.target.value)} /></Field><Field label="Especialidades" hint="Uma especialidade por linha. Especialidades de profissionais ativos precisam ser mantidas."><textarea required rows={4} value={specialties} onChange={(event) => setSpecialties(event.target.value)} /></Field></div><p className="mt-5 flex items-center gap-2 text-xs text-[var(--muted)]"><Clock3 size={14} />Fuso da clínica: America/Recife (UTC−03:00)</p></section>
    <section className="card p-6"><h2 className="text-lg font-semibold">Horário de funcionamento</h2><p className="muted mt-1 mb-4 text-sm">Adicione faixas para intervalos de almoço. Dias sem faixa ficam fechados.</p><HoursEditor label="Clínica" value={clinic.hours} onChange={(hours) => setClinic({ ...clinic, hours })} /><p className="mt-4 text-xs leading-5 text-[var(--muted)]">A agenda usa a interseção entre o funcionamento da clínica, os horários de cada profissional e os bloqueios. Períodos históricos mantêm a disponibilidade registrada.</p></section><div className="flex justify-end"><Button disabled={busy} type="submit"><Save size={16} />{busy ? 'Salvando…' : 'Salvar informações da clínica'}</Button></div>{confirm && <SaveAvailabilityConfirmation count={conflicts.length} busy={busy} error={error} onClose={() => setConfirm(false)} onConfirm={save} />}</form>;
}

function ProfessionalHours({ professional }: { professional: Professional }) {
  const { state, act } = useDemo();
  const [availability, setAvailability] = useState(() => structuredClone(professional.availability));
  const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  const input = { name: professional.name, specialties: professional.specialties, active: professional.active, color: professional.color, availability };
  const proposed = { ...state, professionals: state.professionals.map((item) => item.id === professional.id ? { ...item, availability } : item) };
  const conflicts = futureConflicts(proposed).filter((appointment) => appointment.professionalId === professional.id);
  async function save() {
    setBusy(true); setError(''); setSuccess('');
    try { await act({ type: 'professional.save', id: professional.id, input }); setSuccess(`Disponibilidade de ${professional.name} atualizada.`); setConfirm(false); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  return <form onSubmit={(event) => { event.preventDefault(); setError(''); if (conflicts.length) setConfirm(true); else void save(); }} className="page-stack"><Feedback error={error} success={success} /><HoursEditor label={professional.name} value={availability} onChange={setAvailability} /><div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4"><p className="text-xs leading-5 text-[var(--muted)]">Os horários também respeitam o funcionamento da clínica.</p><Button type="submit" disabled={busy}><Save size={16} />{busy ? 'Salvando…' : 'Salvar disponibilidade'}</Button></div>{confirm && <SaveAvailabilityConfirmation count={conflicts.length} busy={busy} error={error} onClose={() => setConfirm(false)} onConfirm={save} />}</form>;
}

function AvailabilitySettings() {
  const { state, act } = useDemo();
  const params = useSearchParams(); const router = useRouter();
  const [professionalId, setProfessionalId] = useState(params.get('professional') || state.professionals[0]?.id || '');
  const [blockForm, setBlockForm] = useState<Block | 'new' | null>(() => state.blocks.find(b => b.id === params.get('block')) ?? null);
  const [removeBlock, setRemoveBlock] = useState<Block | null>(null);
  const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false);
  const professional = state.professionals.find((item) => item.id === professionalId);
  const blocks = state.blocks.filter((block) => block.professionalId === professionalId).sort((left, right) => `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`));
  async function remove() {
    if (!removeBlock) return;
    setBusy(true); setError(''); setSuccess('');
    try { await act({ type: 'block.delete', id: removeBlock.id }); setSuccess('Bloqueio removido. O intervalo volta a seguir a disponibilidade semanal.'); setRemoveBlock(null); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  return <div className="page-stack"><Feedback error={error} success={success} /><section className="card p-6"><div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Disponibilidade da equipe</h2><p className="muted mt-1 text-sm">Defina os horários de cada profissional de saúde.</p></div><Field label="Profissional de saúde"><select value={professionalId} onChange={(event) => { setProfessionalId(event.target.value); setSuccess(''); setError(''); }}>{state.professionals.map((item) => <option key={item.id} value={item.id}>{item.name}{!item.active ? ' · Inativo' : ''}</option>)}</select></Field></div>{professional ? <ProfessionalHours professional={professional} key={professional.id} /> : <EmptyState title="Nenhum profissional cadastrado" description="Cadastre profissionais na área Equipe para definir a disponibilidade." />}</section>
    <section className="card p-6"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarOff size={19} />Bloqueios por data</h2><p className="muted mt-1 text-sm">Exceções na agenda de {professional?.name || 'cada profissional'}.</p></div><Button variant="secondary" disabled={!professional} onClick={() => setBlockForm('new')}><Plus size={15} />Novo bloqueio</Button></div>{blocks.length ? <div className="overflow-x-auto"><table className="data-table w-full"><thead><tr><th>Data e horário</th><th>Motivo</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{blocks.map((block) => <tr key={block.id}><td><strong className="text-sm font-medium">{formatDate(block.date, { year: 'numeric' })}</strong><small className="mt-1 block text-xs text-[var(--muted)]">{block.start}–{block.end}</small></td><td className="text-sm">{block.reason}</td><td><div className="flex justify-end gap-1"><Button variant="ghost" aria-label={`Editar bloqueio de ${formatDate(block.date)}`} onClick={() => setBlockForm(block)}><Pencil size={15} /></Button><Button variant="ghost" aria-label={`Remover bloqueio de ${formatDate(block.date)}`} onClick={() => { setError(''); setRemoveBlock(block); }}><Trash2 size={15} /></Button></div></td></tr>)}</tbody></table></div> : <EmptyState title="Sem bloqueios para este profissional" description="Os horários seguem a disponibilidade semanal e o funcionamento da clínica." />}</section>
    {blockForm && <BlockForm block={blockForm === 'new' ? undefined : blockForm} professionalId={professionalId} onClose={(saved) => { setBlockForm(null); if (saved) setSuccess('Bloqueio salvo com sucesso.'); if (params.has('block')) { const next = new URLSearchParams(params.toString()); next.delete('block'); router.replace(`/gestao/configuracoes?${next}`); } }} />}
    {removeBlock && <Modal title="Remover bloqueio?" onClose={() => !busy && setRemoveBlock(null)}><p className="text-sm leading-6 text-[var(--muted)]">O intervalo de <strong>{formatDate(removeBlock.date)} às {removeBlock.start}–{removeBlock.end}</strong> ficará disponível conforme os horários da clínica e do profissional.</p><p className="mt-2 text-sm text-[var(--muted)]">Motivo registrado: {removeBlock.reason}</p><Feedback error={error} /><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={() => setRemoveBlock(null)}>Manter bloqueio</Button><Button variant="danger" disabled={busy} onClick={remove}>Remover bloqueio</Button></div></Modal>}</div>;
}

function KnowledgeForm({ document, onClose }: { document?: Knowledge; onClose: () => void }) {
  const { act } = useDemo();
  const [input, setInput] = useState<Omit<Knowledge, 'id'>>(() => document ? { title: document.title, category: document.category, content: document.content, archived: document.archived } : { title: '', category: 'Políticas administrativas', content: '', archived: false });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await act({ type: 'knowledge.save', input, id: document?.id }); onClose(); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  return <Modal title={document ? 'Editar orientação' : 'Nova orientação administrativa'} onClose={() => !busy && onClose()} wide><form onSubmit={submit} className="page-stack"><p className="muted text-sm leading-6">Registre informações administrativas fornecidas pela clínica. Esta base de demonstração não gera nem valida orientações médicas.</p><Feedback error={error} /><Field label="Título da orientação"><input required maxLength={140} value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} /></Field><Field label="Categoria"><input required list="knowledge-categories" maxLength={70} value={input.category} onChange={(event) => setInput({ ...input, category: event.target.value })} /><datalist id="knowledge-categories"><option value="Horários" /><option value="Convênios" /><option value="Preparos administrativos" /><option value="Políticas administrativas" /></datalist></Field><Field label="Conteúdo da orientação"><textarea required rows={6} maxLength={6000} value={input.content} onChange={(event) => setInput({ ...input, content: event.target.value })} /></Field><div className="flex justify-end gap-3"><Button type="button" disabled={busy} variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}><Save size={15} />{busy ? 'Salvando…' : 'Salvar orientação'}</Button></div></form></Modal>;
}

function KnowledgeSettings() {
  const { state, act } = useDemo();
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('active');
  const [form, setForm] = useState<Knowledge | 'new' | null>(null); const [archive, setArchive] = useState<Knowledge | null>(null);
  const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false);
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const documents = state.knowledge.filter((document) => (filter === 'all' || (filter === 'archived' ? document.archived : !document.archived)) && normalize(`${document.title} ${document.category} ${document.content}`).includes(normalize(search)));
  async function toggleArchive(document: Knowledge) {
    setBusy(true); setError(''); setSuccess('');
    const input = { title: document.title, category: document.category, content: document.content, archived: !document.archived };
    try { await act({ type: 'knowledge.save', id: document.id, input }); setArchive(null); setSuccess(document.archived ? 'Orientação reativada.' : 'Orientação arquivada. Ela continua disponível no filtro Arquivadas.'); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  return <div className="page-stack"><Feedback error={error} success={success} /><section className="card p-6"><div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpen size={20} />Base de conhecimento</h2><p className="muted mt-1 text-sm">Informações da clínica, sempre à mão para o atendimento.</p></div><Button onClick={() => setForm('new')}><Plus size={16} />Nova orientação</Button></div><div className="mb-6 flex flex-wrap items-center gap-3"><div className="relative min-w-[220px] flex-1"><Search size={16} className="pointer-events-none absolute top-3.5 left-3 text-[var(--muted)]" /><input aria-label="Pesquisar orientações" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar título, categoria ou conteúdo" className="!pl-10" /></div><select aria-label="Situação das orientações" value={filter} onChange={(event) => setFilter(event.target.value)} className="!w-auto"><option value="active">Ativas</option><option value="archived">Arquivadas</option><option value="all">Todas</option></select><span className="text-xs text-[var(--muted)]">{documents.length} orientações</span></div>{documents.length ? <div className="grid gap-4 md:grid-cols-2">{documents.map((document) => <article key={document.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><div className="mb-3 flex flex-wrap items-center gap-2"><Badge tone={document.archived ? 'gray' : 'green'}>{document.category}</Badge>{document.archived && <Badge>Arquivada</Badge>}</div><h3 className="text-base font-semibold">{document.title}</h3><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--muted)]">{document.content}</p><div className="mt-4 flex flex-wrap justify-end gap-1 border-t border-[var(--border)] pt-3"><Button variant="ghost" disabled={busy} onClick={() => setForm(document)}><Pencil size={14} />Editar</Button><Button variant="ghost" disabled={busy} onClick={() => { setError(''); if (document.archived) void toggleArchive(document); else setArchive(document); }}>{document.archived ? <RotateCcw size={14} /> : <Archive size={14} />}{document.archived ? 'Reativar' : 'Arquivar'}</Button></div></article>)}</div> : <EmptyState title="Nenhuma orientação encontrada" description="Altere a pesquisa ou o filtro para consultar a base da clínica."><Button variant="secondary" onClick={() => { setSearch(''); setFilter('all'); }}>Limpar filtros</Button></EmptyState>}</section>{form && <KnowledgeForm document={form === 'new' ? undefined : form} onClose={() => setForm(null)} />}{archive && <Modal title="Arquivar orientação?" onClose={() => !busy && setArchive(null)}><p className="text-sm leading-6 text-[var(--muted)]">“{archive.title}” deixará a lista ativa. Seu conteúdo será preservado e poderá ser reativado pelo filtro Arquivadas.</p><Feedback error={error} /><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={() => setArchive(null)}>Manter ativa</Button><Button disabled={busy} onClick={() => toggleArchive(archive)}><Archive size={15} />Arquivar orientação</Button></div></Modal>}</div>;
}

export function Settings() {
  const { state, reset } = useDemo();
  const router = useRouter(); const params = useSearchParams();
  const requestedTab = params.get('tab');
  const tab = requestedTab === 'availability' || requestedTab === 'knowledge' ? requestedTab : 'clinic';
  const setTab = (next: string) => { const query = new URLSearchParams(params.toString()); query.set('tab', next); router.push(`/gestao/configuracoes?${query}`); };
  const [restore, setRestore] = useState(false); const [resetVersion, setResetVersion] = useState(0);
  const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false);
  const conflicts = futureConflicts(state);
  async function restoreDemo() {
    setBusy(true); setError(''); setSuccess('');
    try { await reset(); setRestore(false); setResetVersion((value) => value + 1); setSuccess('Demonstração restaurada. Os dados fictícios originais estão disponíveis novamente.'); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  return <div className="page-stack"><PageHeading eyebrow="GESTÃO DA CLÍNICA" title="Configurações" description="Organize os detalhes que fazem a rotina fluir." /><Feedback error={error} success={success} /><ConflictNotice appointments={conflicts} state={state} /><div className="flex flex-wrap gap-2" role="tablist" aria-label="Áreas de configuração">{([{ id: 'clinic', label: 'Clínica e horários', icon: Building2 }, { id: 'availability', label: 'Disponibilidade', icon: Clock3 }, { id: 'knowledge', label: 'Base de conhecimento', icon: BookOpen }] as const).map((item) => <button type="button" role="tab" aria-selected={tab === item.id} aria-controls={`settings-${item.id}`} id={`tab-${item.id}`} key={item.id} tabIndex={tab === item.id ? 0 : -1} onKeyDown={(event) => { const tabs = ['clinic', 'availability', 'knowledge']; const index = tabs.indexOf(tab); const target = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1; if (target >= 0) { event.preventDefault(); setTab(tabs[target]); document.getElementById(`tab-${tabs[target]}`)?.focus(); } }} onClick={() => setTab(item.id)} className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium ${tab === item.id ? 'border-[var(--border)] bg-[var(--green)] text-[var(--on-green)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--green-ink)] hover:bg-[var(--surface-subtle)]'}`}><item.icon size={16} />{item.label}</button>)}</div><div role="tabpanel" id={`settings-${tab}`} aria-labelledby={`tab-${tab}`} key={`${tab}-${resetVersion}`}>{tab === 'clinic' ? <ClinicSettings /> : tab === 'availability' ? <AvailabilitySettings /> : <KnowledgeSettings />}</div>
    <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><summary className="cursor-pointer text-sm font-medium text-[var(--muted)]">Ferramentas da demonstração</summary><div className="mt-5 flex flex-wrap items-start justify-between gap-6"><div className="max-w-xl"><p className="text-sm leading-6 text-[var(--muted)]">As alterações ficam somente neste navegador. Identidade, WhatsApp e IA são simulados. Restaurar remove as alterações locais e recria a base fictícia.</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">A falha de teste afeta apenas o próximo salvamento, preserva os dados preenchidos e permite tentar novamente.</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { failNextRequest(); setError(''); setSuccess('Falha de teste preparada. O próximo salvamento falhará uma vez; tente novamente para concluir.'); }}><FlaskConical size={15} />Testar falha de salvamento</Button><Button variant="secondary" onClick={() => { setError(''); setRestore(true); }}><RotateCcw size={15} />Restaurar demonstração</Button></div></div></details>{restore && <Modal title="Restaurar demonstração?" onClose={() => !busy && setRestore(false)}><p className="text-sm leading-6 text-[var(--muted)]">Todas as alterações feitas neste navegador serão substituídas pelos dados fictícios originais, incluindo mensagens, agendamentos, cadastros e histórico do assistente.</p><Feedback error={error} /><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={() => setRestore(false)}>Manter alterações</Button><Button variant="danger" disabled={busy} onClick={restoreDemo}>{busy ? 'Restaurando…' : 'Restaurar demonstração'}</Button></div></Modal>}</div>;
}
