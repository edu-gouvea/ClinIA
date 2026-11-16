import { test, expect, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import type { Appointment, DemoState } from '../../src/lib/types';
import { timeFromMinutes } from '../../src/lib/date';
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
/** The professional select became a picker popover (listbox of active professionals). */
async function chooseProfessional(page: Page, name: string) {
  await page.getByRole('button', { name: /^Profissional:/ }).click();
  await page.getByRole('dialog', { name: 'Escolher profissional' }).getByRole('option', { name: new RegExp(`^${name}`) }).click();
}
/** Patient/specialty selects now live in the Filtros popover (they still apply at once). */
async function filter(page: Page, label: string, value: string) {
  const dialog = page.getByRole('dialog', { name: 'Filtros' });
  if (!(await dialog.isVisible())) await page.getByRole('button', { name: /^Filtros/ }).click();
  await dialog.getByLabel(label, { exact: true }).selectOption(value);
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => { if (!sessionStorage.getItem('agenda-seeded')) { localStorage.setItem('clinia.demo.v1', JSON.stringify(data)); sessionStorage.setItem('agenda-seeded', 'yes'); } }, state);
});

test('remarcação fixa paciente e especialidade; dia no calendário e hora digitada sem saltos', async ({ page }) => {
  await open(page, '/gestao/agenda?edit=today-early');
  const dialog = page.getByRole('dialog', { name: 'Remarcar consulta', exact: true });
  await expect(dialog.getByLabel('Paciente', { exact: true })).toHaveAttribute('readonly', '');
  await expect(dialog.getByLabel('Paciente', { exact: true })).toHaveValue('Ana Beatriz Santos');
  await expect(dialog.getByLabel('Especialidade', { exact: true })).toHaveAttribute('readonly', '');
  const doctors = await dialog.getByLabel('Profissional', { exact: true }).locator('option').allTextContents();
  expect(doctors).toContain('Dra. Marina Dias'); expect(doctors).not.toContain('Dr. Lucas Vieira');
  await dialog.getByLabel('Profissional', { exact: true }).selectOption('pro-marina');
  // The day comes from the month grid; the typed time lives behind "Outro horário…"
  // and keeps the same TimeInput (digits without a colon, no jumps while typing).
  await dialog.locator('[data-date="2026-11-10"]').click();
  await dialog.getByRole('button', { name: 'Outro horário…', exact: true }).click();
  const time = dialog.getByLabel('Horário de início', { exact: true });
  await time.fill(''); await time.pressSequentially('1130'); await expect(time).toHaveValue('1130');
  await time.press('Tab'); await expect(time).toHaveValue('11:30');
  await time.fill('2575'); await time.press('Tab');
  await expect(time).toHaveAttribute('aria-invalid', 'true');
  await dialog.getByRole('button', { name: 'Ver horários livres', exact: true }).click();
  await dialog.getByRole('option', { name: '11:30', exact: true }).click();
  await expect(dialog.getByRole('option', { name: '11:30', exact: true })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('button', { name: 'Salvar remarcação', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = (await readState(page)).appointments.find(a => a.id === 'today-early')!;
  expect(saved).toMatchObject({ patientId: 'patient-1', professionalId: 'pro-marina', specialty: 'Cardiologia', date: '2026-11-10', start: '11:30' });
});

test('antecipação de hoje, anotações versionadas persistentes e restrição de datas futuras', async ({ page }) => {
  await open(page, '/gestao/agenda?appointment=today-early');
  const dialog = page.getByRole('dialog', { name: 'Detalhes da consulta', exact: true });
  // "A confirmar": outcomes moved into the ⋯ menu ("Marcar como realizada").
  await dialog.getByRole('button', { name: 'Mais ações', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Marcar como realizada', exact: true }).click();
  // The composer replaces the old "Anotações da consulta" field.
  await expect(dialog.getByLabel('Nova anotação', { exact: true })).toBeVisible();
  await dialog.getByLabel('Nova anotação', { exact: true }).fill('Primeira anotação de teste fictícia.');
  await dialog.getByRole('button', { name: 'Salvar anotação', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Anotações salvas');
  await page.reload();
  await expect(dialog.locator('.note-body')).toHaveText('Primeira anotação de teste fictícia.');
  await dialog.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(dialog.getByLabel('Nova anotação', { exact: true })).toHaveValue('Primeira anotação de teste fictícia.');
  await dialog.getByLabel('Nova anotação', { exact: true }).fill('Versão revisada da anotação fictícia.');
  await dialog.getByRole('button', { name: 'Salvar anotação', exact: true }).click();
  await expect.poll(async () => (await readState(page)).appointments.find(a => a.id === 'today-early')?.notes?.length).toBe(2);
  await open(page, '/gestao/agenda?appointment=today-miss');
  await dialog.getByRole('button', { name: 'Mais ações', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Registrar falta', exact: true }).click();
  await expect.poll(async () => (await readState(page)).appointments.find(a => a.id === 'today-miss')?.status).toBe('falta');
  await open(page, '/gestao/agenda?appointment=future');
  // Future: outcome actions are hidden (not shown disabled), in the footer and in the menu.
  await expect(dialog.getByRole('button', { name: 'Marcar como realizada' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Mais ações', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Marcar como realizada' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Registrar falta' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Cancelar consulta' })).toBeVisible();
  await page.keyboard.press('Escape');
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
  // The typed time is behind "Outro horário…" (same TimeInput, same rules).
  await reschedule.getByRole('button', { name: 'Outro horário…', exact: true }).click();
  await reschedule.getByLabel('Horário de início', { exact: true }).fill('1130');
  await reschedule.getByLabel('Horário de início', { exact: true }).press('Tab');
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
  // `view=week` is a legacy value: without a professional it keeps the day by professional.
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
  // Cards keep 1 px of air above and below: height = duration × 2 − 2, top = start × 2 + 1.
  expect(rect!.height).toBeCloseTo(60 * scale - 2, 1);
  expect(shortRect!.height).toBeCloseTo(15 * scale - 2, 1);
  expect(shortRect!.y - rect!.y).toBeCloseTo(45 * scale, 1);
  await expect(long).toHaveAttribute('data-start-minute', '540');
  await expect(long).toHaveAttribute('data-end-minute', '600');
  expect(Math.min(rect!.x + rect!.width, overlapRect!.x + overlapRect!.width) - Math.max(rect!.x, overlapRect!.x)).toBeLessThanOrEqual(0);
  const headerY = (await page.locator('.calendar-day-headers').boundingBox())!.y;
  const axisX = (await page.locator('.calendar-time-axis').boundingBox())!.x;
  await page.locator('.calendar-scroll').evaluate(el => { el.scrollTop = 220; el.scrollLeft = 230; });
  expect((await page.locator('.calendar-day-headers').boundingBox())!.y).toBeCloseTo(headerY, 1);
  expect((await page.locator('.calendar-time-axis').boundingBox())!.x).toBeCloseTo(axisX, 1);
  // The professional's colour lives only in the header avatar; events carry the situation.
  await expect(page.locator('.calendar-event .avatar')).toHaveCount(0);
  await expect(page.locator('.calendar-professional-header .avatar')).toHaveCount(state.professionals.length);
  await open(page, '/gestao/agenda?date=2026-11-10');
  const cancelled = page.locator('[data-appointment-id="short-cancelled"]');
  await expect(cancelled.locator('.event-cancel-note')).toHaveCount(1);
  await expect(cancelled.locator('.event-cancel-note')).toHaveAttribute('title', 'Motivo do cancelamento registrado');
  await expect(cancelled).toHaveAttribute('aria-label', /Cancelada, com motivo de cancelamento registrado$/);
  await cancelled.click();
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta' })).toContainText('Paciente solicitou outra data');
});

test('grade reage ao expediente, indica dias fechados de forma simples e mantém a responsividade', async ({ page }) => {
  await open(page, '/gestao/agenda?view=week&professional=pro-clara');
  await page.screenshot({ path: 'docs/qa/agenda-semanal-desktop.png', fullPage: true });
  const edited = await readState(page);
  edited.clinic.hours = [{ day: 1, start: '07:15', end: '19:45' }];
  await page.evaluate(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), edited);
  await page.reload();
  await expect(page.locator('.calendar-canvas')).toHaveAttribute('data-start-minute', '435');
  await expect(page.locator('.calendar-canvas')).toHaveAttribute('data-end-minute', '1185');
  // All seven days stay; closed days without appointments are compact, Tuesday keeps its records.
  await expect(page.locator('.calendar-day-column')).toHaveCount(7);
  await expect(page.locator('.calendar-day-header.is-closed')).toHaveCount(5);
  await expect(page.locator('.calendar-day-column[data-date="2026-11-10"] .calendar-off-hours')).toHaveText('Clínica fechada');
  await expect(page.locator('.calendar-day-column[data-date="2026-11-10"] [data-appointment-id="block-first"]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  // Below 768 the week becomes a list per day, with free slots at the end of each day.
  await expect(page.locator('.agenda-day-group')).toHaveCount(7);
  await expect(page.locator('.agenda-day-group[data-date="2026-11-11"]')).toContainText('Clínica fechada neste dia.');
  await expect(page.locator('.agenda-day-group[data-date="2026-11-09"] .calendar-free-chip').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await page.screenshot({ path: 'docs/qa/agenda-semanal-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  edited.clinic.hours = [];
  await page.evaluate(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), edited);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sem expediente neste período' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Consultas preservadas' })).toContainText('Carlos Eduardo Lima');
  await page.locator('[data-appointment-id="long"]').click();
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta' })).toBeVisible();
});

test('dia por profissional abre a semana individual e mantém filtros, navegação e o voltar do navegador', async ({ page }) => {
  await open(page, '/gestao/agenda');
  const canvas = page.locator('.calendar-canvas');
  const views = page.getByRole('group', { name: 'Visualização' });
  await expect(canvas).toHaveAttribute('data-mode', 'professionals');
  await expect(views.getByRole('button', { name: 'Dia', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(views.getByRole('button', { name: 'Semana', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.calendar-professional-header')).toHaveCount(state.professionals.length);
  await expect(page.locator('[data-professional-id="pro-clara"] [data-appointment-id="long"]')).toBeVisible();
  await expect(page.locator('[data-professional-id="pro-lucas"] [data-appointment-id="overlap"]')).toBeVisible();
  await page.screenshot({ path: 'docs/qa/agenda-geral-por-medico.png', fullPage: true });
  await filter(page, 'Filtrar especialidade da agenda', 'Cardiologia');
  await expect(page.locator('.calendar-professional-header')).toHaveCount(2);
  await filter(page, 'Filtrar paciente', 'patient-1');
  await expect(page.locator('.calendar-event')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Filtros, 2 aplicados', exact: true })).toBeFocused();
  const applied = page.getByRole('group', { name: 'Filtros aplicados' });
  await expect(applied).toContainText('Paciente: Ana Beatriz Santos');
  await expect(applied).toContainText('Especialidade: Cardiologia');
  await page.getByRole('link', { name: 'Ver semana de Dra. Clara Mendes', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-mode', 'dates');
  await expect(page).toHaveURL(/professional=pro-clara/);
  await expect(page).toHaveURL(/view=semana/);
  await expect(page.locator('.calendar-day-column')).toHaveCount(7);
  await expect(views.getByRole('button', { name: 'Semana', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(applied).toContainText('Paciente: Ana Beatriz Santos');
  await page.getByRole('button', { name: 'Próxima semana' }).click();
  await expect(page).toHaveURL(/date=2026-11-16/);
  await page.getByRole('button', { name: 'Semana anterior' }).click();
  await expect(page).toHaveURL(/date=2026-11-09/);
  await page.getByRole('link', { name: /^Terça-feira, 10 de novembro, .*ver o dia com todos os profissionais$/ }).click();
  await expect(canvas).toHaveAttribute('data-mode', 'professionals');
  await expect(page).toHaveURL(/date=2026-11-10/);
  await expect(page).not.toHaveURL(/professional=/);
  await page.getByRole('button', { name: 'Próximo dia' }).click();
  await expect(page).toHaveURL(/date=2026-11-11/);
  await page.goBack();
  await expect(page).toHaveURL(/date=2026-11-10/);
  await page.goBack();
  await expect(canvas).toHaveAttribute('data-mode', 'dates');
});

test('horários livres da grade criam consultas e bloqueios abrem a gestão no contexto de médico e data', async ({ page }) => {
  await open(page, '/gestao/agenda');
  const slot = page.locator('.calendar-free-slot[data-professional-id="pro-clara"]').first();
  const start = timeFromMinutes(Number(await slot.getAttribute('data-start-minute')));
  await expect(slot).toHaveAccessibleName(`Agendar às ${start} com Dra. Clara Mendes`);
  await slot.click();
  const form = page.getByRole('dialog', { name: 'Novo agendamento', exact: true });
  await expect(form.getByLabel('Profissional', { exact: true })).toHaveValue('pro-clara');
  // Date and time are no longer text fields: the day is selected in the month grid
  // and the time in the free-times list.
  await expect(form.locator('[data-date="2026-11-09"]')).toHaveClass(/is-selected/);
  await expect(form.getByRole('option', { name: start, exact: true })).toHaveAttribute('aria-selected', 'true');
  // The view behind the dialog stays the day by professional.
  await expect(page).not.toHaveURL(/[?&]professional=/);
  await form.getByLabel('Paciente', { exact: true }).selectOption('patient-3');
  await form.getByRole('button', { name: 'Agendar consulta', exact: true }).click();
  await expect(form).toHaveCount(0);
  const saved = await readState(page);
  const created = saved.appointments.find(a => a.patientId === 'patient-3' && a.professionalId === 'pro-clara' && a.date === '2026-11-09' && a.start === start);
  expect(created).toBeTruthy();
  // The new appointment gets a brief mint ring (1.2 s).
  await expect(page.locator(`[data-appointment-id="${created!.id}"]`)).toHaveClass(/is-highlighted/);
  await expect(page.locator(`[data-appointment-id="${created!.id}"]`)).not.toHaveClass(/is-highlighted/, { timeout: 4000 });
  saved.blocks = [{ id: 'context-block', professionalId: 'pro-clara', date: '2026-11-10', start: '12:00', end: '13:00', reason: 'Reunião fictícia' }];
  await page.evaluate(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), saved);
  await open(page, '/gestao/agenda?professional=pro-clara&view=week&date=2026-11-10');
  const block = page.locator('.calendar-day-column[data-date="2026-11-10"] .calendar-block[data-block-id="context-block"]');
  await expect(block).toContainText('Reunião fictícia');
  await expect(block).toContainText('12:00–13:00');
  await block.click();
  await expect(page).toHaveURL(/professional=pro-clara&block=context-block/);
  const editor = page.getByRole('dialog', { name: 'Editar bloqueio', exact: true });
  await expect(editor.getByLabel('Data do bloqueio', { exact: true })).toHaveValue('10/11/2026');
  await expect(editor.getByLabel('Motivo administrativo')).toHaveValue('Reunião fictícia');
});

test('histórico inativo, nomes longos e períodos filtrados continuam acessíveis em telas menores', async ({ page }) => {
  await open(page, '/gestao/agenda');
  const changed = await readState(page);
  changed.professionals[0].active = false;
  changed.professionals[0].specialties = ['Outra área'];
  changed.patients.find(p => p.id === 'patient-6')!.name = 'Maria Eduarda de Albuquerque Cavalcanti';
  await page.evaluate(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), changed);
  await open(page, '/gestao/agenda?specialty=Cardiologia');
  await expect(page.locator('.calendar-professional-header[data-professional-id="pro-clara"]')).toContainText('Inativo');
  await expect(page.locator('[data-appointment-id="long"]')).toHaveCount(1);
  // Column width no longer grows with the name: it truncates and keeps the full name accessible.
  const quarter = page.locator('[data-appointment-id="quarter"]');
  await expect(quarter.locator('.event-patient')).toHaveCSS('text-overflow', 'ellipsis');
  await expect(quarter).toHaveAttribute('aria-label', /^Maria Eduarda de Albuquerque Cavalcanti, 09:45 a 10:00, A confirmar/);
  await open(page, '/gestao/agenda?from=2026-11-09&to=2026-11-10&status=agendada');
  await expect(page.locator('.schedule-list-event')).toHaveCount(8);
  await chooseProfessional(page, 'Dr. Lucas Vieira');
  await expect(page.locator('.schedule-list-event')).toHaveCount(2);
  await expect(page).toHaveURL(/from=2026-11-09/);
  await open(page, '/gestao/agenda?date=2026-11-09');
  await page.getByRole('button', { name: 'Tema escuro', exact: true }).click();
  await page.screenshot({ path: 'docs/qa/agenda-geral-noturna.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  // One professional at a time on phones; the switcher announces the change.
  await expect(page.locator('.calendar-day-column')).toHaveCount(1);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Próximo profissional' }).click();
  await expect(page.locator('.mobile-pro-current')).toContainText('Dra. Marina Dias');
  await quarter.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta' })).toContainText('Maria Eduarda de Albuquerque Cavalcanti');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta' })).toHaveCount(0);
  await page.getByRole('heading', { name: 'Agenda', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/qa/agenda-geral-mobile.png', fullPage: true });
});

test('bloqueios aparecem na grade do dia geral ou da semana inteira do médico', async ({ page }) => {
  await open(page, '/gestao/agenda');
  const edited = await readState(page);
  const block = (id: string, professionalId: string, date: string) => ({ id, professionalId, date, start: '12:00', end: '13:00', reason: id });
  edited.blocks = [block('domingo', 'pro-clara', '2026-11-15'), block('proxima-semana', 'pro-clara', '2026-11-16'), block('sabado', 'pro-clara', '2026-11-14'), block('segunda', 'pro-clara', '2026-11-09'), block('outro-medico', 'pro-lucas', '2026-11-14'), block('outro-medico-hoje', 'pro-lucas', '2026-11-09')];
  await page.evaluate(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), edited);
  // An old explicit `view=day` URL keeps opening the selected physician's full week.
  await open(page, '/gestao/agenda?professional=pro-clara&view=day&date=2026-11-11');
  await expect(page.locator('.calendar-day-column')).toHaveCount(7);
  const ids = () => page.locator('.calendar-block').evaluateAll(elements => elements.map(el => el.getAttribute('data-block-id')));
  await expect.poll(ids).toEqual(['segunda', 'sabado', 'domingo']);
  await expect(page.locator('.calendar-day-column[data-date="2026-11-14"] [data-block-id="sabado"]')).toHaveCount(1);
  await expect(page.locator('.status-strip-note')).toContainText('3 bloqueios');
  await page.screenshot({ path: 'docs/qa/agenda-bloqueios-semana.png', fullPage: true });
  await filter(page, 'Filtrar paciente', 'patient-3');
  await page.keyboard.press('Escape');
  await expect.poll(ids).toEqual(['segunda', 'sabado', 'domingo']);
  await page.getByRole('button', { name: 'Próxima semana' }).click();
  await expect(page).toHaveURL(/date=2026-11-18/);
  await expect.poll(ids).toEqual(['proxima-semana']);
  await page.getByRole('button', { name: 'Semana anterior' }).click();
  await page.getByRole('link', { name: /^Terça-feira, 10 de novembro, .*ver o dia com todos os profissionais$/ }).click();
  await expect(page.locator('.calendar-canvas')).toHaveAttribute('data-mode', 'professionals');
  await expect.poll(ids).toEqual([]);
  await page.getByRole('button', { name: 'Dia anterior' }).click();
  await expect(page).toHaveURL(/date=2026-11-09/);
  await expect.poll(ids).toEqual(['segunda', 'outro-medico-hoje']);
  await chooseProfessional(page, 'Dra. Clara Mendes');
  await expect.poll(ids).toEqual(['segunda', 'sabado', 'domingo']);
});
