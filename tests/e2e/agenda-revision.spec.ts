import { test, expect, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import type { Appointment, DemoState } from '../../src/lib/types';
const state = createDemoState('2026-11-09');
state.professionals.push({ ...state.professionals[0], id: 'pro-marina', name: 'Dra. Marina Dias' });
function appointment(id: string, patientId: string, professionalId: string, date: string, start: string, duration = 30): Appointment {
  return { id, patientId, professionalId, date, start, duration, specialty: professionalId === 'pro-lucas' ? 'Dermatologia' : 'Cardiologia', status: 'agendada', events: [] };
}
state.appointments = [
  appointment('today-early', 'patient-1', 'pro-clara', '2026-11-09', '14:00'),
  appointment('today-miss', 'patient-2', 'pro-clara', '2026-11-09', '15:00'),
  appointment('block-first', 'patient-1', 'pro-clara', '2026-11-10', '10:00'),
  appointment('block-second', 'patient-2', 'pro-clara', '2026-11-10', '10:30'),
  appointment('future', 'patient-3', 'pro-lucas', '2026-11-10', '14:00'),
  appointment('long', 'patient-4', 'pro-clara', '2026-11-09', '09:00', 60),
  appointment('overlap', 'patient-5', 'pro-lucas', '2026-11-09', '09:15', 30),
  appointment('quarter', 'patient-6', 'pro-marina', '2026-11-09', '09:45', 15),
  { ...appointment('short-cancelled', 'patient-7', 'pro-marina', '2026-11-10', '09:45', 15), status: 'cancelada', cancelReason: 'Paciente solicitou outra data' },
];
const readState = (page: Page): Promise<DemoState> => page.evaluate(() => JSON.parse(localStorage.getItem('clinia.demo.v1')!));
async function open(page: Page, url: string) { await page.goto(url); await expect(page.locator('h1')).toBeVisible(); await expect(page.locator('.app-loading')).toHaveCount(0); }
test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => { if (!sessionStorage.getItem('agenda-seeded')) { localStorage.setItem('clinia.demo.v1', JSON.stringify(data)); sessionStorage.setItem('agenda-seeded', 'yes'); } }, state);
});

test('remarcação fixa paciente e especialidade; data/hora digitadas sem saltos', async ({ page }) => {
  await open(page, '/gestao/agenda?edit=today-early');
  const dialog = page.getByRole('dialog', { name: 'Remarcar consulta', exact: true });
  await expect(dialog.getByLabel('Paciente', { exact: true })).toHaveAttribute('readonly', '');
  await expect(dialog.getByLabel('Paciente', { exact: true })).toHaveValue('Ana Beatriz Santos');
  await expect(dialog.getByLabel('Especialidade', { exact: true })).toHaveAttribute('readonly', '');
  const doctors = await dialog.getByLabel('Profissional', { exact: true }).locator('option').allTextContents();
  expect(doctors).toContain('Dra. Marina Dias'); expect(doctors).not.toContain('Dr. Lucas Vieira');
  await dialog.getByLabel('Profissional', { exact: true }).selectOption('pro-marina');
  const date = dialog.getByLabel('Data', { exact: true });
  await date.fill(''); await date.pressSequentially('10112026'); await expect(date).toHaveValue('10112026');
  await date.press('Tab'); await expect(date).toHaveValue('10/11/2026');
  const time = dialog.getByLabel('Horário de início', { exact: true });
  await time.fill(''); await time.pressSequentially('1130'); await expect(time).toHaveValue('1130');
  await time.press('Tab'); await expect(time).toHaveValue('11:30');
  await time.fill('2575'); await time.press('Tab');
  await expect(time).toHaveAttribute('aria-invalid', 'true');
  await dialog.getByRole('button', { name: '11:30', exact: true }).click();
  await expect(time).toHaveValue('11:30');
  expect(await time.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
  await dialog.getByRole('button', { name: 'Salvar remarcação', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = (await readState(page)).appointments.find(a => a.id === 'today-early')!;
  expect(saved).toMatchObject({ patientId: 'patient-1', professionalId: 'pro-marina', specialty: 'Cardiologia', date: '2026-11-10', start: '11:30' });
});

test('antecipação de hoje, anotações versionadas persistentes e restrição de datas futuras', async ({ page }) => {
  await open(page, '/gestao/agenda?appointment=today-early');
  const dialog = page.getByRole('dialog', { name: 'Detalhes da consulta', exact: true });
  await dialog.getByRole('button', { name: 'Marcar realizada', exact: true }).click();
  await expect(dialog.getByLabel('Anotações da consulta', { exact: true })).toBeVisible();
  await dialog.getByLabel('Anotações da consulta', { exact: true }).fill('Primeira anotação de teste fictícia.');
  await dialog.getByRole('button', { name: 'Salvar anotações' }).click();
  await expect(dialog.getByRole('status')).toContainText('Anotações salvas');
  await page.reload();
  await expect(dialog.getByLabel('Anotações da consulta', { exact: true })).toHaveValue('Primeira anotação de teste fictícia.');
  await dialog.getByLabel('Anotações da consulta', { exact: true }).fill('Versão revisada da anotação fictícia.');
  await dialog.getByRole('button', { name: 'Salvar anotações' }).click();
  await expect.poll(async () => (await readState(page)).appointments.find(a => a.id === 'today-early')?.notes?.length).toBe(2);
  await open(page, '/gestao/agenda?appointment=today-miss');
  await dialog.getByRole('button', { name: 'Registrar falta', exact: true }).click();
  await expect.poll(async () => (await readState(page)).appointments.find(a => a.id === 'today-miss')?.status).toBe('falta');
  await open(page, '/gestao/agenda?appointment=future');
  await expect(dialog.getByRole('button', { name: 'Marcar realizada' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Registrar falta' })).toHaveCount(0);
  await expect(dialog).toContainText('disponíveis no dia da consulta');
});

test('bloqueio revisa conflitos, remarca/cancela, mantém rascunho e preserva motivo no detalhamento', async ({ page }) => {
  await open(page, '/gestao/configuracoes?tab=availability&professional=pro-clara');
  await page.getByRole('button', { name: 'Novo bloqueio', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Novo bloqueio', exact: true });
  await form.getByLabel('Data do bloqueio', { exact: true }).fill('10/11/2026');
  await form.getByLabel('Início do bloqueio', { exact: true }).fill('1000');
  await form.getByLabel('Fim do bloqueio', { exact: true }).fill('1100');
  await form.getByLabel('Motivo administrativo', { exact: true }).fill('Reunião de planejamento');
  await form.getByRole('button', { name: 'Continuar', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Revisar consultas afetadas', exact: true });
  await expect(review.locator('[data-conflict-id]')).toHaveCount(2);
  await expect(review.getByRole('button', { name: 'Concluir e criar bloqueio' })).toBeDisabled();
  await review.locator('[data-conflict-id="block-first"]').getByRole('button', { name: 'Remarcar', exact: true }).click();
  const reschedule = page.getByRole('dialog', { name: 'Remarcar consulta', exact: true });
  await reschedule.getByLabel('Horário de início', { exact: true }).fill('1130');
  await reschedule.getByRole('button', { name: 'Salvar remarcação' }).click();
  await expect(review.locator('[data-conflict-id]')).toHaveCount(1);
  await review.locator('[data-conflict-id="block-second"]').getByRole('button', { name: 'Cancelar consulta', exact: true }).click();
  const cancel = page.getByRole('dialog', { name: 'Cancelar consulta para liberar o bloqueio?', exact: true });
  await cancel.getByLabel('Motivo do cancelamento', { exact: true }).fill('Paciente solicitou cancelar durante reorganização.');
  await cancel.getByRole('button', { name: 'Confirmar cancelamento' }).click();
  await expect(review.getByRole('status')).toContainText('intervalo está livre');
  await expect(review).toContainText('Reunião de planejamento');
  await review.getByRole('button', { name: 'Concluir e criar bloqueio' }).click();
  await expect(review).toHaveCount(0);
  const saved = await readState(page);
  expect(saved.blocks.some(b => b.date === '2026-11-10' && b.start === '10:00' && b.end === '11:00')).toBeTruthy();
  expect(saved.appointments.find(a => a.id === 'block-first')?.start).toBe('11:30');
  await open(page, '/gestao/agenda?date=2026-11-10&status=cancelada');
  const cancelled = page.locator('[data-appointment-id="block-second"]');
  await expect(cancelled.locator('.event-cancel-note')).toHaveCount(1);
  await cancelled.click();
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta' })).toContainText('Paciente solicitou cancelar durante reorganização.');
});

test('grade diária por médico usa horários/durações exatos e mantém cabeçalho e eixo fixos', async ({ page }) => {
  await open(page, '/gestao/agenda?view=week');
  const canvas = page.locator('.calendar-canvas');
  await expect(canvas).toHaveAttribute('data-start-minute', '480');
  await expect(canvas).toHaveAttribute('data-end-minute', '1080');
  await expect(canvas).toHaveAttribute('data-mode', 'professionals');
  const scale = Number(await canvas.getAttribute('data-pixels-per-minute'));
  expect(scale).toBe(2);
  const long = page.locator('[data-appointment-id="long"]');
  const quarter = page.locator('[data-appointment-id="quarter"]');
  const overlap = page.locator('[data-appointment-id="overlap"]');
  const rect = await long.boundingBox(); const shortRect = await quarter.boundingBox(); const overlapRect = await overlap.boundingBox();
  expect(rect!.height).toBeCloseTo(60 * scale, 1);
  expect(shortRect!.height).toBeCloseTo(15 * scale, 1);
  expect(shortRect!.y - rect!.y).toBeCloseTo(45 * scale, 1);
  expect(Math.min(rect!.x + rect!.width, overlapRect!.x + overlapRect!.width) - Math.max(rect!.x, overlapRect!.x)).toBeLessThanOrEqual(0);
  const headerY = (await page.locator('.calendar-day-headers').boundingBox())!.y;
  const axisX = (await page.locator('.calendar-time-axis').boundingBox())!.x;
  await page.locator('.calendar-scroll').evaluate(el => { el.scrollTop = 220; el.scrollLeft = 230; });
  expect((await page.locator('.calendar-day-headers').boundingBox())!.y).toBeCloseTo(headerY, 1);
  expect((await page.locator('.calendar-time-axis').boundingBox())!.x).toBeCloseTo(axisX, 1);
  await expect(page.locator('.schedule-calendar .avatar')).toHaveCount(0);
  await open(page, '/gestao/agenda?date=2026-11-10');
  const cancelled = page.locator('[data-appointment-id="short-cancelled"]');
  await expect(cancelled.locator('.event-cancel-note')).toHaveCount(1);
  await expect(cancelled).toHaveAttribute('title', /Paciente solicitou outra data/);
  await cancelled.click();
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta' })).toContainText('Paciente solicitou outra data');
});

test('grade reage ao expediente e mantém responsividade e painéis integrados', async ({ page }) => {
  await open(page, '/gestao/agenda?view=week&professional=pro-clara');
  await page.screenshot({ path: 'docs/qa/agenda-semanal-desktop.png', fullPage: true });
  const edited = await readState(page);
  edited.clinic.hours = [{ day: 1, start: '07:15', end: '19:45' }];
  await page.evaluate(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), edited);
  await page.reload();
  await expect(page.locator('.calendar-canvas')).toHaveAttribute('data-start-minute', '435');
  await expect(page.locator('.calendar-canvas')).toHaveAttribute('data-end-minute', '1185');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.availability-panel')).toContainText('Disponibilidade');
  await expect(page.locator('.blocks-panel')).toContainText('Bloqueios da semana');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  expect(await page.locator('.calendar-scroll').evaluate(el => el.scrollWidth > el.clientWidth)).toBeTruthy();
  await page.screenshot({ path: 'docs/qa/agenda-semanal-mobile.png', fullPage: true });
  edited.clinic.hours = [];
  await page.evaluate(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), edited);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sem expediente neste período' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Consultas preservadas' })).toContainText('Carlos Eduardo Lima');
  await page.locator('[data-appointment-id="long"]').click();
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta' })).toBeVisible();
});

test('visão geral por médico abre semana individual e mantém filtros e navegação', async ({ page }) => {
  await open(page, '/gestao/agenda');
  const canvas = page.locator('.calendar-canvas');
  await expect(canvas).toHaveAttribute('data-mode', 'professionals');
  await expect(page.getByRole('button', { name: 'Dia', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Semana', exact: true })).toHaveCount(0);
  await expect(page.locator('.calendar-professional-header')).toHaveCount(state.professionals.length);
  await expect(page.locator('[data-professional-id="pro-clara"] [data-appointment-id="long"]')).toBeVisible();
  await expect(page.locator('[data-professional-id="pro-lucas"] [data-appointment-id="overlap"]')).toBeVisible();
  await page.screenshot({ path: 'docs/qa/agenda-geral-por-medico.png', fullPage: true });
  await page.getByLabel('Filtrar especialidade da agenda').selectOption('Cardiologia');
  await expect(page.locator('.calendar-professional-header')).toHaveCount(2);
  await page.getByLabel('Filtrar paciente', { exact: true }).selectOption('patient-1');
  await expect(page.locator('.calendar-event')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver semana de Dra. Clara Mendes', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-mode', 'dates');
  await expect(page.locator('.calendar-day-column')).toHaveCount(7);
  await expect(page.getByLabel('Filtrar paciente', { exact: true })).toHaveValue('patient-1');
  await expect(page.getByLabel('Filtrar especialidade da agenda')).toHaveValue('Cardiologia');
  await expect(page.getByRole('button', { name: 'Semana', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Próximo período' }).click();
  await expect(page.getByLabel('Data da agenda', { exact: true })).toHaveValue('16/11/2026');
  await page.getByRole('button', { name: 'Período anterior' }).click();
  await page.getByRole('button', { name: 'Ver disponibilidade de 10 de novembro', exact: true }).click();
  await expect(page.getByLabel('Data da agenda', { exact: true })).toHaveValue('10/11/2026');
  await expect(page.locator('.blocks-panel')).toContainText('Bloqueios da semana');
  await page.getByLabel('Filtrar profissional').selectOption('');
  await expect(canvas).toHaveAttribute('data-mode', 'professionals');
  await expect(page.getByRole('button', { name: 'Semana', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Próximo período' }).click();
  await expect(page.getByLabel('Data da agenda', { exact: true })).toHaveValue('11/11/2026');
});

test('horários livres criam consultas e bloqueios mantêm o contexto de médico e data', async ({ page }) => {
  await open(page, '/gestao/agenda');
  await page.locator('.availability-panel summary').filter({ hasText: 'Dr. Lucas Vieira' }).click();
  await expect(page.locator('.availability-panel button[aria-label^="Agendar com Dr. Lucas Vieira"]').first()).toBeVisible();
  const slot = page.locator('.availability-panel button[aria-label^="Agendar com Dra. Clara Mendes"]').first();
  const start = (await slot.textContent())!;
  await slot.click();
  const form = page.getByRole('dialog', { name: 'Novo agendamento', exact: true });
  await expect(form.getByLabel('Profissional', { exact: true })).toHaveValue('pro-clara');
  await expect(form.getByLabel('Data', { exact: true })).toHaveValue('09/11/2026');
  await expect(form.getByLabel('Horário de início', { exact: true })).toHaveValue(start);
  await form.getByLabel('Paciente', { exact: true }).selectOption('patient-3');
  await form.getByRole('button', { name: 'Criar agendamento', exact: true }).click();
  await expect(form).toHaveCount(0);
  const saved = await readState(page);
  expect(saved.appointments.some(a => a.patientId === 'patient-3' && a.professionalId === 'pro-clara' && a.date === '2026-11-09' && a.start === start)).toBeTruthy();
  saved.blocks = [{ id: 'context-block', professionalId: 'pro-clara', date: '2026-11-10', start: '12:00', end: '13:00', reason: 'Reunião fictícia' }];
  await page.evaluate(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), saved);
  await open(page, '/gestao/agenda?professional=pro-clara&view=week&date=2026-11-10');
  await expect(page.locator('.blocks-panel')).toContainText('Reunião fictícia');
  await page.locator('.blocks-panel .panel-block').click();
  await expect(page).toHaveURL(/professional=pro-clara&block=context-block/);
  const block = page.getByRole('dialog', { name: 'Editar bloqueio', exact: true });
  await expect(block.getByLabel('Data do bloqueio', { exact: true })).toHaveValue('10/11/2026');
  await expect(block.getByLabel('Motivo administrativo')).toHaveValue('Reunião fictícia');
});

test('histórico inativo, nomes longos e períodos filtrados continuam acessíveis em telas menores', async ({ page }) => {
  await open(page, '/gestao/agenda');
  const changed = await readState(page);
  changed.professionals[0].active = false;
  changed.professionals[0].specialties = ['Outra área'];
  changed.patients.find(p => p.id === 'patient-6')!.name = 'Maria Eduarda de Albuquerque Cavalcanti';
  await page.evaluate(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), changed);
  await open(page, '/gestao/agenda?specialty=Cardiologia');
  await expect(page.getByRole('button', { name: 'Ver semana de Dra. Clara Mendes', exact: true })).toContainText('Inativo');
  await expect(page.locator('[data-appointment-id="long"]')).toHaveCount(1);
  const name = page.locator('[data-appointment-id="quarter"] .event-patient');
  expect(await name.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await open(page, '/gestao/agenda?from=2026-11-09&to=2026-11-10&status=agendada');
  await expect(page.locator('.schedule-list-event')).toHaveCount(8);
  await page.getByLabel('Filtrar profissional').selectOption('pro-clara');
  await expect(page.locator('.schedule-list-event')).toHaveCount(5);
  await expect(page).toHaveURL(/from=2026-11-09/);
  await open(page, '/gestao/agenda?date=2026-11-09');
  await page.getByRole('button', { name: 'Ativar modo noturno', exact: true }).click();
  await page.screenshot({ path: 'docs/qa/agenda-geral-noturna.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  expect(await page.locator('.calendar-scroll').evaluate(el => el.scrollWidth > el.clientWidth)).toBeTruthy();
  await page.locator('[data-appointment-id="quarter"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta' })).toContainText('Maria Eduarda de Albuquerque Cavalcanti');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta' })).toHaveCount(0);
  await page.getByRole('heading', { name: 'Agenda', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/qa/agenda-geral-mobile.png', fullPage: true });
});

test('modo automático e bloqueios acompanham o dia geral ou a semana inteira do médico', async ({ page }) => {
  await open(page, '/gestao/agenda');
  const edited = await readState(page);
  const block = (id: string, professionalId: string, date: string) => ({ id, professionalId, date, start: '12:00', end: '13:00', reason: id });
  edited.blocks = [block('domingo', 'pro-clara', '2026-11-15'), block('proxima-semana', 'pro-clara', '2026-11-16'), block('sabado', 'pro-clara', '2026-11-14'), block('segunda', 'pro-clara', '2026-11-09'), block('outro-medico', 'pro-lucas', '2026-11-14'), block('outro-medico-hoje', 'pro-lucas', '2026-11-09')];
  await page.evaluate(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), edited);
  // An old explicit day URL must still open the selected physician's full week.
  await open(page, '/gestao/agenda?professional=pro-clara&view=day&date=2026-11-11');
  await expect(page.locator('.calendar-day-column')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Dia', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Semana', exact: true })).toHaveCount(0);
  const panel = page.locator('.blocks-panel');
  const ids = () => panel.locator('[data-block-id]').evaluateAll(elements => elements.map(el => el.getAttribute('data-block-id')));
  await expect(panel.getByRole('heading', { name: 'Bloqueios da semana' })).toBeVisible();
  await expect.poll(ids).toEqual(['segunda', 'sabado', 'domingo']);
  await expect(panel.locator('[data-block-id="sabado"]')).toContainText('14 de nov.');
  await page.screenshot({ path: 'docs/qa/agenda-bloqueios-semana.png', fullPage: true });
  await page.getByLabel('Filtrar paciente', { exact: true }).selectOption('patient-3');
  await expect.poll(ids).toEqual(['segunda', 'sabado', 'domingo']);
  await page.getByRole('button', { name: 'Próximo período' }).click();
  await expect(page.getByLabel('Data da agenda', { exact: true })).toHaveValue('18/11/2026');
  await expect.poll(ids).toEqual(['proxima-semana']);
  await page.getByRole('button', { name: 'Período anterior' }).click();
  await page.getByRole('button', { name: 'Ver disponibilidade de 10 de novembro', exact: true }).click();
  await expect(page.getByLabel('Data da agenda', { exact: true })).toHaveValue('10/11/2026');
  await expect.poll(ids).toEqual(['segunda', 'sabado', 'domingo']);
  await page.getByLabel('Filtrar profissional', { exact: true }).selectOption('');
  await expect(page.locator('.calendar-canvas')).toHaveAttribute('data-mode', 'professionals');
  await expect(panel.getByRole('heading', { name: 'Bloqueios do dia' })).toBeVisible();
  await expect(panel).toContainText('Nenhum bloqueio neste dia.');
  await page.getByRole('button', { name: 'Período anterior' }).click();
  await expect(page.getByLabel('Data da agenda', { exact: true })).toHaveValue('09/11/2026');
  await expect.poll(ids).toEqual(['outro-medico-hoje', 'segunda']);
  await page.getByLabel('Filtrar profissional', { exact: true }).selectOption('pro-clara');
  await expect.poll(ids).toEqual(['segunda', 'sabado', 'domingo']);
});
