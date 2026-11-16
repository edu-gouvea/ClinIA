import { test, expect, type Locator, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import { appointmentSummaryLine, availableDaysInMonth, availableSlots } from '../../src/lib/booking';
import type { DemoState } from '../../src/lib/types';

// Seed variant: the clinic closes on Sundays and Dr. Lucas also attends Nutrição, so
// closed days and multi-specialty professionals exist.
const seed = createDemoState('2026-11-09');
seed.clinic.hours = seed.clinic.hours.filter(h => h.day !== 0);
seed.professionals.find(p => p.id === 'pro-lucas')!.specialties = ['Dermatologia', 'Nutrição'];
const key = 'clinia.demo.v1';
const realizada = seed.appointments.find(a => a.patientId === 'patient-1' && a.status === 'realizada' && a.date === '2026-11-07')!;

test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ data, storageKey }) => {
    if (!sessionStorage.getItem('modals-seeded')) { localStorage.setItem(storageKey, JSON.stringify(data)); sessionStorage.setItem('modals-seeded', '1'); }
  }, { data: seed, storageKey: key });
});
const snapshot = (page: Page) => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)!) as DemoState, key);
async function openForm(page: Page, url = '/gestao/agenda?new=1') {
  await page.goto(url);
  const form = page.getByRole('dialog', { name: /^(Novo agendamento|Remarcar consulta)$/ });
  await expect(form).toBeVisible();
  return form;
}
async function openDetails(page: Page, id: string) {
  await page.goto(`/gestao/agenda?appointment=${id}`);
  const details = page.getByRole('dialog', { name: 'Detalhes da consulta', exact: true });
  await expect(details).toBeVisible();
  return details;
}
const day = (form: Locator, date: string) => form.locator(`[data-date="${date}"]`);
const contrast = (el: Locator) => el.evaluate(node => {
  const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  const lum = (c: number[]) => c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const s = getComputedStyle(node); const [a, b] = [lum(rgb(s.color)), lum(rgb(s.backgroundColor))].sort((m, n) => n - m);
  return (a + .05) / (b + .05);
});

test('(a) dias com horário batem com availableDaysInMonth; passado e domingo fechado desabilitados', async ({ page }) => {
  const form = await openForm(page);
  await expect(form.getByLabel('Profissional', { exact: true })).toHaveValue('pro-clara');
  const counts = availableDaysInMonth(seed, { professionalId: 'pro-clara', duration: 30, month: '2026-11' });
  for (const [date, count] of Object.entries(counts)) {
    const cell = day(form, date);
    if (count) {
      await expect(cell, date).not.toHaveAttribute('aria-disabled', 'true');
      await expect(cell, date).toHaveAttribute('aria-label', new RegExp(`, ${count} ${count === 1 ? 'horário livre' : 'horários livres'}$`));
    } else {
      await expect(cell, date).toHaveAttribute('aria-disabled', 'true');
      await expect(cell, date).toHaveAttribute('aria-label', /, sem horários$/);
    }
  }
  expect(counts['2026-11-08']).toBe(0);
  expect(counts['2026-11-15']).toBe(0);
  await expect(day(form, '2026-11-09')).toHaveAttribute('aria-current', 'date');
  await expect(form.getByRole('button', { name: 'Mês anterior' })).toBeDisabled();
  // A disabled day does not select. It is `aria-disabled` (still focusable for arrow
  // navigation), so Playwright's enabled-check is skipped to dispatch the real click.
  await day(form, '2026-11-15').click({ force: true });
  await expect(day(form, '2026-11-15')).not.toHaveClass(/is-selected/);
  await form.getByRole('button', { name: 'Próximo mês' }).click();
  await expect(form.getByRole('grid', { name: /Dezembro/ })).toBeVisible();
  const december = availableDaysInMonth(seed, { professionalId: 'pro-clara', duration: 30, month: '2026-12' });
  const open = Object.entries(december).find(([, n]) => n > 0)![0];
  await expect(day(form, open)).toHaveClass(/is-available/);
  await expect(day(form, '2026-12-06')).toHaveAttribute('aria-disabled', 'true');
});

test('(b) dia + horário habilitam "Agendar consulta" e a frase-resumo; duração maior limpa horário inválido', async ({ page }) => {
  const form = await openForm(page);
  const submit = form.getByRole('button', { name: 'Agendar consulta', exact: true });
  await expect(submit).toBeDisabled();
  await expect(form.locator('.booking-line')).toHaveText('Escolha um horário para continuar.');
  await form.getByLabel('Paciente', { exact: true }).selectOption('patient-2');
  await day(form, '2026-11-10').click();
  const q = { professionalId: 'pro-clara', patientId: 'patient-2', date: '2026-11-10' };
  const thirty = availableSlots(seed, { ...q, duration: 30 });
  const sixty = availableSlots(seed, { ...q, duration: 60 });
  const stale = thirty.find(slot => !sixty.includes(slot))!;
  expect(stale).toBeTruthy();
  await expect(form.getByRole('listbox')).toBeVisible();
  await expect(form.getByRole('listbox').getByRole('option')).toHaveCount(thirty.length);
  await expect(form.locator('.booking-times')).toContainText(`${thirty.length} horários de 30 min livres`);
  await form.getByRole('option', { name: stale, exact: true }).click();
  await expect(submit).toBeEnabled();
  await expect(form.locator('.booking-line')).toHaveText(appointmentSummaryLine({ date: '2026-11-10', start: stale, duration: 30, professional: 'Dra. Clara Mendes', specialty: 'Cardiologia' }));
  await form.getByRole('group', { name: 'Duração' }).getByRole('button', { name: '60', exact: true }).click();
  await expect(form.getByRole('group', { name: 'Duração' }).getByRole('button', { name: '60', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(form.getByRole('status').filter({ hasText: 'O horário escolhido não está mais livre.' })).toBeVisible();
  await expect(form.getByRole('listbox').getByRole('option')).toHaveCount(sixty.length);
  await expect(form.locator('[role="option"][aria-selected="true"]')).toHaveCount(0);
  await expect(submit).toBeDisabled();
  // "Outra" reveals every valid duration of the old select.
  await form.getByRole('button', { name: 'Outra', exact: true }).click();
  await expect(form.getByLabel('Duração', { exact: true }).locator('option')).toHaveText(['15 minutos', '30 minutos', '45 minutos', '60 minutos', '90 minutos', '120 minutos']);
  await form.getByRole('button', { name: '30', exact: true }).click();
  await form.getByRole('option', { name: thirty[0], exact: true }).click();
  await form.getByRole('group', { name: 'Situação', exact: true }).getByRole('button', { name: 'Confirmada' }).click();
  await submit.click();
  await expect(form).toHaveCount(0);
  const created = (await snapshot(page)).appointments.find(a => a.patientId === 'patient-2' && a.date === '2026-11-10' && a.start === thirty[0] && a.professionalId === 'pro-clara');
  expect(created?.status).toBe('confirmada');
});

test('(c) "Outro horário…" aceita 0930 e recusa horário fora da disponibilidade com erro inline', async ({ page }) => {
  const date = Object.entries(availableDaysInMonth(seed, { professionalId: 'pro-clara', duration: 30, month: '2026-11' }))
    .map(([d]) => d).find(d => availableSlots(seed, { professionalId: 'pro-clara', duration: 30, date: d }).includes('09:30'))!;
  const form = await openForm(page);
  await day(form, date).click();
  await form.getByRole('button', { name: 'Outro horário…', exact: true }).click();
  const time = form.getByLabel('Horário de início', { exact: true });
  await time.pressSequentially('0930'); await time.press('Tab');
  await expect(time).toHaveValue('09:30');
  await expect(time).not.toHaveAttribute('aria-invalid', 'true');
  await expect(form.locator('.booking-line')).toContainText('09:30–10:00');
  await expect(form.getByRole('button', { name: 'Agendar consulta', exact: true })).toBeEnabled();
  await time.fill('0700'); await time.press('Tab');
  await expect(time).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await time.getAttribute('aria-describedby');
  await expect(form.locator(`[id="${describedBy}"]`)).toContainText('fora da disponibilidade');
  await expect(form.getByRole('button', { name: 'Agendar consulta', exact: true })).toBeDisabled();
  await form.getByRole('button', { name: 'Ver horários livres', exact: true }).click();
  await expect(form.getByRole('listbox')).toBeVisible();
});

test('(d) especialidade derivada, select com mais de uma, remarcação trava paciente e especialidade', async ({ page }) => {
  const form = await openForm(page);
  await expect(form.getByLabel('Especialidade', { exact: true })).toHaveValue('Cardiologia');
  await expect(form.getByLabel('Especialidade', { exact: true })).toHaveAttribute('readonly', '');
  await expect(form).toContainText('Vem do profissional. Vira lista quando ele atende mais de uma.');
  await form.getByLabel('Profissional', { exact: true }).selectOption('pro-lucas');
  const specialty = form.getByRole('combobox', { name: 'Especialidade', exact: true });
  await expect(specialty.locator('option')).toHaveText(['Dermatologia', 'Nutrição']);
  await specialty.selectOption('Nutrição');
  await expect(specialty).toHaveValue('Nutrição');

  const edit = await openForm(page, '/gestao/agenda?edit=appt-ana');
  await expect(edit).toHaveAccessibleName('Remarcar consulta');
  await expect(edit.getByLabel('Paciente', { exact: true })).toHaveAttribute('readonly', '');
  await expect(edit.getByLabel('Especialidade', { exact: true })).toHaveAttribute('readonly', '');
  await expect(edit.getByRole('group', { name: 'Situação', exact: true })).toHaveCount(0);
  await expect(edit.locator('.booking-current')).toContainText('Seg, 09 nov. · 11:30 · Dra. Clara Mendes');
  const options = await edit.getByLabel('Profissional', { exact: true }).locator('option:not([disabled])').allTextContents();
  expect(options.filter(name => name !== 'Selecione')).toEqual(['Dra. Clara Mendes']);
  // The current time is selected (its own slot is free for itself).
  await expect(edit.getByRole('option', { name: '11:30', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(edit.getByRole('button', { name: 'Salvar remarcação', exact: true })).toBeEnabled();
});

test('(e) link com start abre com dia e horário selecionados', async ({ page }) => {
  const start = availableSlots(seed, { professionalId: 'pro-clara', duration: 30, date: '2026-11-12' })[2];
  const form = await openForm(page, `/gestao/agenda?new=1&date=2026-11-12&start=${start}&patient=patient-3`);
  await expect(day(form, '2026-11-12')).toHaveClass(/is-selected/);
  await expect(form.getByRole('gridcell', { selected: true })).toHaveText('12');
  await expect(form.getByRole('option', { name: start, exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(form.getByLabel('Paciente', { exact: true })).toHaveValue('patient-3');
  await expect(form.locator('.booking-times h3')).toHaveText('Qui, 12 nov.');
  await expect(form.getByRole('button', { name: 'Agendar consulta', exact: true })).toBeEnabled();
});

test('(f) detalhes: ações por situação, menu ⋯, cancelamento com motivo e "Agendar retorno"', async ({ page }) => {
  const details = await openDetails(page, 'appt-ana');
  await expect(details.getByRole('heading', { name: 'Consulta de Cardiologia' })).toBeVisible();
  await expect(details).toContainText('Segunda, 9 de novembro · 11:30–12:00');
  await expect(details.locator('.details-header .badge').first()).toHaveText('A confirmar');
  await expect(details.locator('.details-header')).toContainText('Pediu remarcação');
  await expect(details.getByRole('link', { name: /Ana Beatriz Santos/ })).toHaveAttribute('href', '/gestao/pacientes?id=patient-1');
  await expect(details.locator('.details-meta')).toContainText('Viva Saúde');
  await expect(details.locator('.details-meta')).toContainText('Marina Costa');
  await expect(details).toContainText('As anotações ficam disponíveis depois que a consulta for realizada.');
  await expect(details.getByRole('button', { name: 'Confirmar', exact: true })).toBeVisible();
  await expect(details.getByRole('button', { name: 'Remarcar', exact: true })).toBeVisible();
  await details.getByRole('button', { name: 'Mais ações', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Mais ações' });
  await expect(menu.getByRole('menuitem')).toHaveText(['Marcar como realizada', 'Registrar falta', 'Cancelar consulta']);
  await expect(menu.getByRole('menuitem', { name: 'Cancelar consulta' })).toHaveClass(/is-danger/);
  await page.keyboard.press('Escape');
  await details.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(details.getByRole('status')).toContainText('Consulta confirmada.');
  await expect(details.getByRole('button', { name: 'Marcar como realizada', exact: true })).toBeVisible();
  await details.getByRole('button', { name: 'Mais ações', exact: true }).click();
  await expect(menu.getByRole('menuitem')).toHaveText(['Registrar falta', 'Cancelar consulta']);
  await menu.getByRole('menuitem', { name: 'Cancelar consulta' }).click();
  await details.getByLabel('Motivo do cancelamento', { exact: true }).fill('Paciente pediu para cancelar.');
  await details.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(details.getByRole('status')).toContainText('Consulta cancelada.');
  await expect(details.locator('.details-cancelled')).toHaveText('Motivo: “Paciente pediu para cancelar.”');
  await expect(details).toContainText('Consulta encerrada: a situação não pode mais mudar.');
  await expect(details.getByRole('button', { name: 'Mais ações' })).toHaveCount(0);
  await expect(details.locator('.details-history li').first()).toContainText('cancelou a consulta');

  const done = await openDetails(page, realizada.id);
  const retorno = done.getByRole('link', { name: 'Agendar retorno', exact: true });
  await expect(retorno).toHaveAttribute('href', `/gestao/agenda?new=1&patient=patient-1&professional=${realizada.professionalId}`);
  await retorno.click();
  const form = page.getByRole('dialog', { name: 'Novo agendamento', exact: true });
  await expect(form.getByLabel('Paciente', { exact: true })).toHaveValue('patient-1');
  await expect(form.getByLabel('Profissional', { exact: true })).toHaveValue(realizada.professionalId);
});

test('(g) anotação: salvar, Ctrl+Enter, editar cria versão e <details> mostra a anterior', async ({ page }) => {
  const details = await openDetails(page, realizada.id);
  await expect(details.getByRole('heading', { name: 'Anotações' })).toBeVisible();
  await expect(details).not.toContainText('Anotações da consulta');
  const composer = details.getByLabel('Nova anotação', { exact: true });
  await expect(composer).toHaveAttribute('placeholder', 'Adicionar uma anotação…');
  await expect(details.getByRole('button', { name: 'Salvar anotação', exact: true })).toBeDisabled();
  await composer.fill('Primeira versão da anotação fictícia.');
  await composer.press('Control+Enter');
  await expect(details.getByRole('status')).toContainText('Anotações salvas');
  await expect(details.locator('.note-body')).toHaveText('Primeira versão da anotação fictícia.');
  await details.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(composer).toHaveValue('Primeira versão da anotação fictícia.');
  await composer.fill('Segunda versão revisada.');
  await details.getByRole('button', { name: 'Salvar anotação', exact: true }).click();
  await expect(details.locator('.note-body')).toHaveText('Segunda versão revisada.');
  const versions = details.locator('details.note-versions');
  await expect(versions.locator('summary')).toHaveText('Versão 2 · ver 1 versão anterior');
  await expect(versions.getByText('Primeira versão da anotação fictícia.')).toBeHidden();
  await versions.locator('summary').click();
  await expect(versions.getByText('Primeira versão da anotação fictícia.')).toBeVisible();
  const notes = (await snapshot(page)).appointments.find(a => a.id === realizada.id)!.notes!;
  expect(notes.map(n => n.text)).toEqual(['Primeira versão da anotação fictícia.', 'Segunda versão revisada.']);
  await expect(details.locator('.details-history li').first()).toContainText('salvou uma anotação');
});

test('(h) 390 px: formulário em uma coluna e detalhes sem transbordamento', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const form = await openForm(page);
  expect(await form.locator('.booking-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
  const boxes = await Promise.all(['.booking-summary', '.booking-month', '.booking-times'].map(s => form.locator(s).boundingBox()));
  expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y); expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
  expect(await form.locator('.booking-slots').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);
  expect((await form.getByRole('listbox').getByRole('option').first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const fits = async (target: Locator) => {
    const size = await target.evaluate(el => ({ page: document.documentElement.scrollWidth, viewport: innerWidth, dialog: el.scrollWidth, box: el.clientWidth }));
    expect(size.page).toBeLessThanOrEqual(size.viewport + 1);
    expect(size.dialog).toBeLessThanOrEqual(size.box + 1);
  };
  await fits(form);
  await fits(await openDetails(page, 'appt-ana'));
});

test('(i) teclado no calendário e na lista de horários', async ({ page }) => {
  const form = await openForm(page, '/gestao/agenda?new=1&date=2026-11-10');
  await expect(day(form, '2026-11-10')).toHaveClass(/is-selected/);
  await day(form, '2026-11-10').focus();
  await page.keyboard.press('ArrowRight');
  await expect(day(form, '2026-11-11')).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect(day(form, '2026-12-11')).toBeFocused();
  await expect(form.getByRole('grid', { name: /Dezembro/ })).toBeVisible();
  await page.keyboard.press('PageUp');
  await expect(day(form, '2026-11-11')).toBeFocused();
  // Navigation never goes before today: Home (Sunday 8) stops at today, the 9th.
  await page.keyboard.press('Home');
  await expect(day(form, '2026-11-09')).toBeFocused();
  // Unavailable days stay focusable for navigation but cannot be chosen (Sunday 15: closed).
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowLeft');
  await expect(day(form, '2026-11-15')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(day(form, '2026-11-15')).not.toHaveClass(/is-selected/);
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  await expect(day(form, '2026-11-10')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(day(form, '2026-11-10')).toHaveClass(/is-selected/);
  const options = form.getByRole('listbox').getByRole('option');
  await options.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(options.last()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(options.last()).toHaveAttribute('aria-selected', 'true');
  await expect(options.last()).toHaveCSS('outline-style', 'solid');
});

test('(j) temas claro e escuro: dias disponíveis e selecionado com contraste ≥ 4,5', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      await page.goto('/gestao/agenda');
      await page.getByRole('button', { name: 'Tema escuro', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    }
    const form = await openForm(page, '/gestao/agenda?new=1&date=2026-11-10');
    expect(await contrast(day(form, '2026-11-11')), `${theme} disponível`).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(day(form, '2026-11-10')), `${theme} selecionado`).toBeGreaterThanOrEqual(4.5);
    await form.getByRole('listbox').getByRole('option').first().click();
    expect(await contrast(form.getByRole('listbox').getByRole('option').first()), `${theme} horário`).toBeGreaterThanOrEqual(4.5);
    const details = await openDetails(page, 'appt-ana');
    expect(await contrast(details.locator('.details-header .badge').first()), `${theme} badge`).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `test-results/modais-${theme}.png` });
  }
});
