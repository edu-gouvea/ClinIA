import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appointmentStatusLabels, appointmentStatusPresentation, appointmentStatusTones,
  conversationStatusLabels, conversationStatusPresentation, conversationStatusTones,
} from '../src/lib/status-presentation';

test('consultas: rótulos e tons únicos, sem alterar os valores internos', () => {
  assert.deepEqual(appointmentStatusPresentation, {
    agendada: { label: 'A confirmar', tone: 'warning' },
    confirmada: { label: 'Confirmada', tone: 'info' },
    realizada: { label: 'Realizada', tone: 'success' },
    falta: { label: 'Falta', tone: 'danger' },
    cancelada: { label: 'Cancelada', tone: 'neutral' },
  });
  assert.equal(appointmentStatusLabels.agendada, 'A confirmar');
  assert.equal(appointmentStatusTones.confirmada, 'info');
});

test('conversas: IA usa o tom violeta próprio e atendimento humano usa info', () => {
  assert.deepEqual(conversationStatusPresentation, {
    aguardando: { label: 'Aguardando atendente', tone: 'warning' },
    humano: { label: 'Com atendente', tone: 'info' },
    ia: { label: 'Com IA', tone: 'ai' },
    encerrada: { label: 'Encerrada', tone: 'neutral' },
  });
  assert.equal(conversationStatusLabels.ia, 'Com IA');
  assert.equal(conversationStatusTones.ia, 'ai');
});

test('cada status tem rótulo não vazio e tom conhecido', () => {
  const tones = new Set(['success', 'warning', 'danger', 'info', 'neutral', 'ai']);
  for (const entry of [...Object.values(appointmentStatusPresentation), ...Object.values(conversationStatusPresentation)]) {
    assert.ok(entry.label.trim());
    assert.ok(tones.has(entry.tone));
  }
});
