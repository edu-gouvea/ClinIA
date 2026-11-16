import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoState } from '../src/lib/demo-data';
import { minutes } from '../src/lib/date';
import { answerConversationQuestion, classifyConversationQuestion, draftReply, FALLBACK_TEXT, rescheduleTarget, suggestSlots } from '../src/lib/conversation-assistant';
import { getFreeSlots } from '../src/lib/metrics';

const state = createDemoState('2026-11-09');
const conversation = (id: string) => state.conversations.find(c => c.id === id)!;

test('classificador em PT-BR, com ou sem acento', () => {
  assert.equal(classifyConversationQuestion('Sugerir resposta'), 'draft');
  assert.equal(classifyConversationQuestion('pode escrever um rascunho?'), 'draft');
  assert.equal(classifyConversationQuestion('Horários livres'), 'slots');
  assert.equal(classifyConversationQuestion('tem vaga para remarcar'), 'slots');
  assert.equal(classifyConversationQuestion('horarios disponiveis'), 'slots');
  assert.equal(classifyConversationQuestion('Próximas consultas'), 'appointments');
  assert.equal(classifyConversationQuestion('como está a agenda dela'), 'appointments');
  assert.equal(classifyConversationQuestion('Resumir conversa'), 'summary');
  assert.equal(classifyConversationQuestion('Qual a previsão do tempo?'), 'fallback');
});

test('horários sugeridos: mesmo profissional, futuros e sem conflito com outras consultas do paciente', () => {
  const ana = rescheduleTarget(state, conversation('conversation-1'))!;
  assert.equal(ana.id, 'appt-ana');
  const slots = suggestSlots(state, ana);
  assert.equal(slots.length, 3);
  for (const slot of slots) {
    assert.equal(slot.professionalId, ana.professionalId);
    assert.ok(Date.parse(`${slot.date}T${slot.start}:00-03:00`) > Date.parse(state.now));
    assert.ok(getFreeSlots(state, ana.professionalId, slot.date).includes(slot.start));
    assert.ok(!(slot.date === ana.date && slot.start === ana.start));
  }
  // Occupy the first option with another appointment of the same patient (other professional):
  const busy = structuredClone(state);
  const first = slots[0];
  busy.appointments.push({ id: 'conflito', patientId: ana.patientId, professionalId: 'pro-lucas', specialty: 'Dermatologia', date: first.date, start: first.start, duration: 30, status: 'confirmada', events: [] });
  const after = suggestSlots(busy, busy.appointments.find(a => a.id === 'appt-ana')!);
  assert.ok(!after.some(slot => slot.date === first.date && minutes(slot.start) < minutes(first.start) + 30 && minutes(slot.start) + 30 > minutes(first.start)));
  assert.equal(after.length, 3);
});

test('rascunho de remarcação usa o horário escolhido e assina com o usuário atual', () => {
  const ana = conversation('conversation-1');
  const slots = suggestSlots(state, rescheduleTarget(state, ana)!);
  const chosen = draftReply(state, ana, slots[1])!;
  assert.match(chosen.text, /^Olá, Ana! Aqui é a Marina, da recepção da Clínica Florescer\. Para remarcar sua consulta de Cardiologia com Dra\. Clara Mendes, tenho disponível .+ \(\d{2}\/\d{2}\), às \d{2}:\d{2}\. Posso confirmar esse horário para você\?$/);
  assert.ok(chosen.text.includes(`às ${slots[1].start}`));
  assert.notEqual(chosen.text, draftReply(state, ana, slots[0])!.text);
  assert.deepEqual(chosen.sources.map(s => s.label), ['Conversa', 'Agenda']);
  // The signature follows state.currentUserId, never a literal name.
  const other = structuredClone(state); other.currentUserId = 'user-rafael';
  assert.match(draftReply(other, other.conversations[0], slots[0])!.text, /Aqui é a Rafael,/);
});

test('confirmação e base de conhecimento; sem modelo, nada é inventado', () => {
  const confirm = structuredClone(state);
  const juliana = confirm.conversations.find(c => c.id === 'conversation-3')!;
  confirm.appointments.find(a => a.patientId === juliana.patientId && a.status === 'confirmada' && a.date >= confirm.referenceDate)!.status = 'agendada';
  assert.match(draftReply(confirm, juliana)!.text, /Você confirma sua presença\?$/);
  const insurance = draftReply(state, conversation('conversation-2'))!;
  assert.ok(insurance.text.includes('Viva Saúde'));
  assert.deepEqual(insurance.sources.map(s => s.label), ['Conversa', 'Base de conhecimento']);
  assert.equal(insurance.sources[1].title, 'Orientação: Convênios disponíveis');
  // "Qual é o endereço da clínica?" has no matching guidance: no draft, no invented address.
  assert.equal(draftReply(state, conversation('conversation-4')), undefined);
  const answer = answerConversationQuestion(state, 'conversation-4', 'Sugerir resposta');
  assert.equal(answer.text, 'Não tenho uma sugestão de resposta para esta conversa.');
  assert.equal(answer.draft, undefined);
  assert.ok(!/Rua|endereço é/i.test(JSON.stringify(answer)));
});

test('respostas por intenção: horários com rascunho, consultas, resumo e fallback', () => {
  const slots = answerConversationQuestion(state, 'conversation-1', 'Horários livres');
  assert.equal(slots.slots?.length, 3);
  assert.ok(slots.draft?.text.includes(slots.slots![0].start));
  assert.match(slots.links![0].href, /^\/gestao\/agenda\?patient=patient-1&edit=appt-ana&context=conversation-1&date=/);
  const noTarget = answerConversationQuestion(state, 'conversation-2', 'Horários livres');
  assert.equal(noTarget.slots, undefined);
  assert.match(noTarget.text, /^Esta conversa não tem consulta para remarcar\. Hoje há \d+ horários livres de 30 min/);
  assert.match(answerConversationQuestion(state, 'conversation-3', 'Próximas consultas').text, /^Juliana Ferreira tem 1 consulta futura\. A próxima:\nHoje · 17:00/);
  assert.match(answerConversationQuestion(state, 'conversation-1', 'Resumir conversa').text, /^Conversa com Ana Beatriz Santos\./);
  assert.equal(answerConversationQuestion(state, 'conversation-1', 'Qual a previsão do tempo?').text, FALLBACK_TEXT);
  assert.equal(answerConversationQuestion(state, 'conversation-7', 'Sugerir resposta').draft?.sources[1].title, 'Orientação: Horários e canais de atendimento');
  const ia = structuredClone(state); ia.knowledge = [];
  assert.match(answerConversationQuestion(ia, 'conversation-7', 'Sugerir resposta').text, /^A IA está conduzindo esta conversa/);
});
