import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDate, isValidTime, monthShortOf, weekdayOf, weekdaysFull, weekdaysLong, weekdaysShort, weekOrder } from '../src/lib/date';
import { capitalize, errorMessage, formatDecimal, formatRate, normalizePhone, normalizeText, plural } from '../src/lib/format';

test('taxas usam uma casa decimal em todas as telas e "Sem dados" sem denominador', () => {
  assert.equal(formatRate(12.5), '12,5%');
  assert.equal(formatRate(13), '13,0%');
  assert.equal(formatRate(0), '0,0%');
  assert.equal(formatRate(null), 'Sem dados');
  assert.equal(formatDecimal(7.25), '7,3');
  assert.equal(formatDecimal(8), '8');
});

test('plural, capitalização e busca sem acento', () => {
  assert.equal(plural(1, 'consulta', 'consultas'), '1 consulta');
  assert.equal(plural(0, 'consulta', 'consultas'), '0 consultas');
  assert.equal(plural(1250, 'consulta', 'consultas'), '1.250 consultas');
  assert.equal(capitalize('segunda-feira'), 'Segunda-feira');
  assert.equal(normalizeText('João Élcio'), 'joao elcio');
});

test('telefone: só dígitos e sem o código do país', () => {
  assert.equal(normalizePhone('(81) 99999-0001'), '81999990001');
  assert.equal(normalizePhone('+55 81 99999-0001'), '81999990001');
  assert.equal(normalizePhone('5581999990001'), '81999990001');
  assert.equal(normalizePhone('81 3333-0001'), '8133330001');
});

test('mensagem de erro: a do erro lançado ou o texto padrão', () => {
  assert.equal(errorMessage(new Error('Horário ocupado.')), 'Horário ocupado.');
  assert.equal(errorMessage('x', 'Tente novamente.'), 'Tente novamente.');
});

test('datas e horários válidos rejeitam formatos e dias inexistentes', () => {
  assert.equal(isValidDate('2026-11-09'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('09/11/2026'), false);
  assert.equal(isValidDate(null), false);
  assert.equal(isValidTime('09:30'), true);
  assert.equal(isValidTime('24:00'), false);
  assert.equal(isValidTime('9:30'), false);
});

test('vocabulário de calendário: domingo é o índice 0 e a semana começa na segunda', () => {
  assert.equal(weekdayOf('2026-11-09'), 1);
  assert.equal(weekdaysShort[weekdayOf('2026-11-09')], 'Seg');
  assert.equal(weekdaysLong[0], 'Domingo');
  assert.equal(weekdaysFull[1], 'Segunda-feira');
  assert.deepEqual([...weekOrder], [1, 2, 3, 4, 5, 6, 0]);
  assert.equal(monthShortOf('2026-11-09'), 'nov.');
});

test('fuso: Recife mantém o formato de sempre; outros fusos usam o deslocamento da data', async () => {
  const { clinicDate, clinicTimeZone, dateTime, isTimeZone, setClinicTimeZone } = await import('../src/lib/date');
  assert.equal(clinicTimeZone(), 'America/Recife');
  assert.equal(dateTime('2026-11-09', '10:15'), '2026-11-09T10:15:00-03:00');
  assert.equal(dateTime('2026-11-09', '10:15', 'America/Manaus'), '2026-11-09T10:15:00-04:00');
  assert.equal(dateTime('2026-11-09', '10:15', 'America/Noronha'), '2026-11-09T10:15:00-02:00');
  // Daylight saving: the offset follows the date, not the moment of the call.
  assert.equal(dateTime('2026-01-15', '09:00', 'America/New_York'), '2026-01-15T09:00:00-05:00');
  assert.equal(dateTime('2026-07-15', '09:00', 'America/New_York'), '2026-07-15T09:00:00-04:00');
  assert.equal(dateTime('2026-07-15', '09:00', 'UTC'), '2026-07-15T09:00:00+00:00');
  // 01:30 UTC is still the previous day in Recife.
  assert.equal(clinicDate('2026-11-10T01:30:00Z'), '2026-11-09');
  assert.equal(isTimeZone('America/Recife'), true);
  assert.equal(isTimeZone('Marte/Olimpo'), false);
  setClinicTimeZone('Marte/Olimpo');
  assert.equal(clinicTimeZone(), 'America/Recife', 'an invalid zone is ignored');
});
