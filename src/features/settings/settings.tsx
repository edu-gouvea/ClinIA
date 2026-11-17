'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { BookOpen, Building2, Clock3, FlaskConical, RotateCcw } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Feedback } from '@/components/feedback';
import { Tabs, tabPanelProps, type TabItem } from '@/components/tabs';
import { Button, Modal, PageHeading } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { appointmentsOutsideAvailability } from '@/lib/scheduling';
import { failNextRequest } from '@/lib/demo/demo-adapter';
import { AvailabilitySettings } from './availability-settings';
import { ClinicSettings } from './clinic-settings';
import { KnowledgeSettings } from './knowledge-settings';
import { ConflictNotice } from './shared';

type SettingsTab = 'clinic' | 'availability' | 'knowledge';
const tabs: TabItem<SettingsTab>[] = [
  { key: 'clinic', label: <><Building2 size={16} aria-hidden="true" />Clínica e horários</> },
  { key: 'availability', label: <><Clock3 size={16} aria-hidden="true" />Disponibilidade</> },
  { key: 'knowledge', label: <><BookOpen size={16} aria-hidden="true" />Base de conhecimento</> },
];

export function Settings() {
  const { state, reset } = useDemo();
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('tab');
  const tab: SettingsTab = requested === 'availability' || requested === 'knowledge' ? requested : 'clinic';
  const [restore, setRestore] = useState(false);
  // Restoring replaces every record: remount the open section so its drafts start over.
  const [resetVersion, setResetVersion] = useState(0);
  const action = useAction();
  const conflicts = appointmentsOutsideAvailability(state);

  function setTab(next: SettingsTab) {
    const query = new URLSearchParams(params.toString());
    query.set('tab', next);
    router.push(`/gestao/configuracoes?${query}`);
  }
  async function restoreDemo() {
    if (await action.run(reset, 'Demonstração restaurada. Os dados fictícios originais estão disponíveis novamente.')) {
      setRestore(false);
      setResetVersion(value => value + 1);
    }
  }

  return <div className="page-stack settings-page">
    <PageHeading trail={['Gestão', 'Configurações']} title="Configurações" description="Organize os detalhes que fazem a rotina fluir." />
    <Feedback error={restore ? '' : action.error} success={action.success} />
    <ConflictNotice appointments={conflicts} state={state} />
    <Tabs idPrefix="settings" label="Áreas de configuração" className="settings-tabs" items={tabs} value={tab} onChange={setTab} />
    <div {...tabPanelProps('settings', tab)} key={`${tab}-${resetVersion}`}>
      {tab === 'clinic' ? <ClinicSettings /> : tab === 'availability' ? <AvailabilitySettings /> : <KnowledgeSettings />}
    </div>

    <details className="card demo-tools">
      <summary>Ferramentas da demonstração</summary>
      <div className="demo-tools-body">
        <div>
          <p>As alterações ficam somente neste navegador. Identidade, WhatsApp e IA são simulados. Restaurar remove as alterações locais e recria a base fictícia.</p>
          <p>A falha de teste afeta apenas o próximo salvamento, preserva os dados preenchidos e permite tentar novamente.</p>
        </div>
        <div className="inline-actions">
          <Button variant="secondary" onClick={() => { failNextRequest(); action.setSuccess('Falha de teste preparada. O próximo salvamento falhará uma vez; tente novamente para concluir.'); }}>
            <FlaskConical size={16} />Testar falha de salvamento
          </Button>
          <Button variant="secondary" onClick={() => { action.clear(); setRestore(true); }}><RotateCcw size={16} />Restaurar demonstração</Button>
        </div>
      </div>
    </details>

    {restore && <Modal title="Restaurar demonstração?" onClose={() => !action.busy && setRestore(false)}>
      <p className="muted small">Todas as alterações feitas neste navegador serão substituídas pelos dados fictícios originais, incluindo mensagens, agendamentos, cadastros e histórico do assistente.</p>
      <Feedback error={action.error} />
      <div className="form-actions">
        <Button variant="secondary" disabled={action.busy} onClick={() => setRestore(false)}>Manter alterações</Button>
        <Button variant="danger" disabled={action.busy} onClick={restoreDemo}>{action.busy ? 'Restaurando…' : 'Restaurar demonstração'}</Button>
      </div>
    </Modal>}
  </div>;
}
