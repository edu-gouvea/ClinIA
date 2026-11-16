import { test, expect, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import { getFreeSlots } from '../../src/lib/metrics';
import { minutes } from '../../src/lib/date';
import { contrastRatio } from '../../src/lib/agenda-presentation';
import type { DemoState } from '../../src/lib/types';

const seed = createDemoState('2026-11-09');
const key = 'clinia.demo.v1';

async function open(page: Page, url: string, data: DemoState = seed) {
  await page.addInitScript(({ value, storageKey }) => { if (!sessionStorage.getItem('redesign-seeded')) { localStorage.setItem(storageKey, JSON.stringify(value)); sessionStorage.setItem('redesign-seeded', '1'); } }, { value: data, storageKey: key });
  await page.goto(url);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.app-loading')).toHaveCount(0);
}
const noHorizontalScroll = (page: Page) => page.locator('.calendar-scroll').evaluate(el => el.scrollWidth <= el.clientWidth);
const hex = (rgb: string) => `#${(rgb.match(/\d+/g) ?? []).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('')}`;

test('(a) em 1440 px cabem 4 profissionais ou a semana com fim de semana fechado, sem rolagem horizontal do card', async ({ page }) => {
  const weekdays: DemoState = structuredClone(seed);
  weekdays.clinic.hours = weekdays.clinic.hours.filter(slot => slot.day >= 1 && slot.day <= 5);
  weekdays.appointments = weekdays.appointments.filter(a => { const day = new Date(`${a.date}T12:00:00Z`).getUTCDay(); return day >= 1 && day <= 5; });
  await open(page, '/gestao/agenda', weekdays);
  await expect(page.locator('.calendar-professional-header')).toHaveCount(4);
  expect(await noHorizontalScroll(page)).toBe(true);
  // The week keeps all seven days: closed weekend days are compact and simply say so.
  await page.goto('/gestao/agenda?professional=pro-clara');
  await expect(page.locator('.calendar-day-column')).toHaveCount(7);
  expect(await noHorizontalScroll(page)).toBe(true);
  for (const date of ['2026-11-09', '2026-11-13']) expect((await page.locator(`.calendar-day-column[data-date="${date}"]`).boundingBox())!.width).toBeGreaterThanOrEqual(167);
  await expect(page.locator('.calendar-day-header.is-closed')).toHaveCount(2);
  await expect(page.locator('.calendar-day-header.is-closed').first()).toContainText('Fechada');
  await expect(page.locator('.calendar-day-column[data-date="2026-11-15"] .calendar-off-hours')).toHaveText('Fechada');
  await expect(page.locator('.calendar-day-column[data-date="2026-11-15"] .calendar-free-slot')).toHaveCount(0);
  await expect(page.locator('.calendar-footer')).toContainText('Clínica aberta 08:00–18:00 · Sábado e domingo: clínica fechada');
  await expect(page.getByRole('button', { name: 'Mostrar fim de semana' })).toHaveCount(0);
  // A closed day in the day view is a simple note.
  await page.goto('/gestao/agenda?date=2026-11-15');
  await expect(page.getByRole('heading', { name: 'Clínica fechada neste dia' })).toBeVisible();
  await expect(page.getByText('Domingo, 15 de novembro: sem horário de funcionamento.')).toBeVisible();
  // Weekend care: with Saturday hours the Saturday column is a regular one with free slots.
  const saturday: DemoState = structuredClone(weekdays);
  saturday.clinic.hours.push({ day: 6, start: '08:00', end: '12:00' });
  await page.evaluate(([value, storageKey]) => localStorage.setItem(storageKey as string, JSON.stringify(value)), [saturday, key] as const);
  await page.goto('/gestao/agenda?professional=pro-clara');
  await expect(page.locator('.calendar-day-header.is-closed')).toHaveCount(1);
  expect((await page.locator('.calendar-day-column[data-date="2026-11-14"]').boundingBox())!.width).toBeGreaterThanOrEqual(167);
  await expect(page.locator('.calendar-day-column[data-date="2026-11-14"] .calendar-free-slot').first()).toBeVisible();
});

test('(b) horários livres da grade são os da função de disponibilidade e abrem o agendamento pré-preenchido', async ({ page }) => {
  await open(page, '/gestao/agenda');
  for (const date of ['2026-11-09', '2026-11-10']) {
    if (date !== '2026-11-09') await page.goto(`/gestao/agenda?date=${date}`);
    for (const professional of seed.professionals.filter(p => p.active)) {
      const expected = getFreeSlots(seed, professional.id, date).map(minutes);
      const shown = await page.locator(`.calendar-free-slot[data-professional-id="${professional.id}"]`).evaluateAll(els => els.map(el => Number(el.getAttribute('data-start-minute'))));
      expect(shown, `${professional.name} ${date}`).toEqual(expected);
    }
  }
  // The free-slots assistant link (legacy `view=week`) opens the professional's week on the first free slot.
  await page.goto('/gestao/agenda?professional=pro-lucas&date=2026-11-09&view=week');
  await expect(page.locator('.calendar-canvas')).toHaveAttribute('data-mode', 'dates');
  await expect(page.locator('.calendar-free-slot').first()).toBeFocused();
  // Past days have no free slots.
  await page.goto('/gestao/agenda?date=2026-11-06');
  await expect(page.locator('.calendar-free-slot')).toHaveCount(0);
  await page.goto('/gestao/agenda?date=2026-11-10');
  const slot = page.locator('.calendar-free-slot[data-professional-id="pro-lucas"]').first();
  const start = getFreeSlots(seed, 'pro-lucas', '2026-11-10')[0];
  await expect(slot).toHaveAccessibleName(`Agendar às ${start} com Dr. Lucas Vieira`);
  await slot.hover();
  await expect(slot).toContainText(`+ Agendar às ${start}`);
  await slot.click();
  const form = page.getByRole('dialog', { name: 'Novo agendamento', exact: true });
  await expect(form.getByLabel('Profissional', { exact: true })).toHaveValue('pro-lucas');
  // Date and time are no longer text fields: the day is selected in the month grid
  // and the time in the free-times list.
  await expect(form.locator('[data-date="2026-11-10"]')).toHaveClass(/is-selected/);
  await expect(form.getByRole('option', { name: start, exact: true })).toHaveAttribute('aria-selected', 'true');
  // Week view label names the day.
  await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.goto('/gestao/agenda?professional=pro-lucas&date=2026-11-10');
  await expect(page.locator('.calendar-day-column[data-date="2026-11-10"] .calendar-free-slot').first()).toHaveAccessibleName(`Terça-feira, 10 de novembro: agendar às ${start}`);
  // Links that used to open the availability panel focus the first free slot.
  await page.goto('/gestao/agenda?date=2026-11-10&availability=1');
  await expect(page.locator('.calendar-free-slot').first()).toBeFocused();
});

test('(c) bloqueio fica no horário certo, abre a gestão do bloqueio e o menu ⋯ cria bloqueio no contexto', async ({ page }) => {
  await open(page, '/gestao/agenda?date=2026-11-10');
  const column = page.locator('.calendar-day-column[data-professional-id="pro-clara"]');
  const block = column.locator('.calendar-block[data-block-id="block-1"]');
  await expect(block).toHaveAttribute('data-start-minute', String(minutes('14:00')));
  await expect(block).toHaveAttribute('data-end-minute', String(minutes('15:00')));
  await expect(block).toContainText('Bloqueio · Reunião de equipe');
  await expect(block).toContainText('14:00–15:00');
  const columnBox = (await column.boundingBox())!; const blockBox = (await block.boundingBox())!;
  expect(blockBox.y - columnBox.y).toBeCloseTo((minutes('14:00') - 480) * 2 + 1, 0);
  expect(blockBox.height).toBeCloseTo(60 * 2 - 2, 0);
  await page.getByRole('button', { name: 'Opções de Dra. Clara Mendes', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Bloquear horário' }).click();
  const draft = page.getByRole('dialog', { name: 'Novo bloqueio', exact: true });
  await expect(draft.getByLabel('Profissional do bloqueio')).toHaveValue('pro-clara');
  await expect(draft.getByLabel('Data do bloqueio', { exact: true })).toHaveValue('10/11/2026');
  await draft.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await block.click();
  await expect(page).toHaveURL(/\/gestao\/configuracoes\?tab=availability&professional=pro-clara&block=block-1/);
  await expect(page.getByRole('dialog', { name: 'Editar bloqueio', exact: true }).getByLabel('Motivo administrativo')).toHaveValue('Reunião de equipe');
});

test('(d) chips de situação: contagens, aria-pressed, status na URL, opacidade e status legado', async ({ page }) => {
  await open(page, '/gestao/agenda');
  const chips = page.getByRole('group', { name: 'Filtrar por situação' });
  const today = seed.appointments.filter(a => a.date === seed.referenceDate);
  const count = (status: string) => today.filter(a => a.status === status).length;
  await expect(chips.getByRole('button', { name: `Todas ${today.length}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const [status, label] of [['agendada', 'A confirmar'], ['confirmada', 'Confirmadas'], ['realizada', 'Realizadas'], ['falta', 'Faltas'], ['cancelada', 'Canceladas']])
    await expect(chips.getByRole('button', { name: `${label} ${count(status)}`, exact: true })).toHaveAttribute('aria-pressed', 'false');
  await chips.getByRole('button', { name: /^Confirmadas/ }).click();
  await expect(page).toHaveURL(/status=confirmada/);
  await expect(chips.getByRole('button', { name: /^Confirmadas/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(chips.getByRole('button', { name: /^Todas/ })).toHaveAttribute('aria-pressed', 'false');
  const confirmed = today.find(a => a.status === 'confirmada')!; const other = today.find(a => a.status !== 'confirmada')!;
  await expect(page.locator(`[data-appointment-id="${confirmed.id}"]`)).toHaveCSS('opacity', '1');
  await expect(page.locator(`[data-appointment-id="${other.id}"]`)).toHaveCSS('opacity', '0.28');
  await expect(page.locator('.calendar-free-slot').first()).toHaveCSS('opacity', '0.4');
  // Counts ignore the situation filter itself.
  await expect(chips.getByRole('button', { name: `Todas ${today.length}`, exact: true })).toBeVisible();
  await chips.getByRole('button', { name: /^Todas/ }).click();
  await expect(page).not.toHaveURL(/status=/);
  await page.goto('/gestao/agenda?status=previstas');
  await expect(chips.locator('[aria-pressed="true"]')).toHaveCount(0);
  const applied = page.getByRole('group', { name: 'Filtros aplicados' });
  await expect(applied).toContainText('Situação: Previstas');
  await applied.getByRole('button', { name: 'Remover filtro Situação: Previstas' }).click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(applied).toHaveCount(0);
});

test('(e) "Semana" sem profissional abre o seletor; escolher abre a semana; "×" volta para todos', async ({ page }) => {
  await open(page, '/gestao/agenda');
  const views = page.getByRole('group', { name: 'Visualização' });
  await views.getByRole('button', { name: 'Semana', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Escolher profissional' });
  await expect(picker).toBeVisible();
  await expect(views.getByRole('button', { name: 'Dia', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).not.toHaveURL(/view=/);
  await expect(picker.getByRole('option', { name: /^Todos os profissionais/ })).toHaveAttribute('aria-selected', 'true');
  await expect(picker).toContainText('Escolher um profissional abre a semana dele.');
  await picker.getByRole('option', { name: /^Dra\. Clara Mendes/ }).click();
  await expect(page).toHaveURL(/professional=pro-clara/);
  await expect(page).toHaveURL(/view=semana/);
  await expect(page.locator('.calendar-canvas')).toHaveAttribute('data-mode', 'dates');
  // "Dia" keeps the professional: one column, no column header (the picker names them) and the day panel.
  await views.getByRole('button', { name: 'Dia', exact: true }).click();
  await expect(page).toHaveURL(/view=dia/);
  await expect(page.locator('.calendar-day-column')).toHaveCount(1);
  await expect(page.locator('.calendar-professional-header')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Painel do dia' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar para todos os profissionais', exact: true }).click();
  await expect(page).not.toHaveURL(/professional=/);
  await expect(page.locator('.calendar-professional-header')).toHaveCount(4);
});

test('(f) popovers de data, profissional e filtros funcionam pelo teclado e devolvem o foco', async ({ page }) => {
  await open(page, '/gestao/agenda');
  const dateTrigger = page.getByRole('button', { name: /Escolher data$/ });
  await expect(dateTrigger).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(dateTrigger).toContainText('Segunda-feira, 9 de novembro');
  await dateTrigger.focus(); await page.keyboard.press('Enter');
  const datePopover = page.getByRole('dialog', { name: 'Escolher data' });
  await expect(dateTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(datePopover.getByLabel('Data', { exact: true })).toBeFocused();
  await expect(datePopover.getByRole('button', { name: /^Segunda-feira, 9 de novembro de 2026/ })).toHaveAttribute('aria-current', 'date');
  await datePopover.getByLabel('Data', { exact: true }).fill('');
  await datePopover.getByLabel('Data', { exact: true }).pressSequentially('10112026');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/date=2026-11-10/);
  await expect(datePopover).toHaveCount(0);
  await dateTrigger.click();
  await datePopover.getByRole('button', { name: /^Terça-feira, 10 de novembro de 2026/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(datePopover.getByRole('button', { name: /^Quarta-feira, 11 de novembro de 2026/ })).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect(datePopover.getByRole('button', { name: /^Sexta-feira, 11 de dezembro de 2026/ })).toBeFocused();
  await expect(datePopover.getByRole('grid')).toHaveAccessibleName('Dezembro 2026');
  await page.keyboard.press('Escape');
  await expect(datePopover).toHaveCount(0);
  await expect(dateTrigger).toBeFocused();

  const professional = page.getByRole('button', { name: /^Profissional:/ });
  await professional.focus(); await page.keyboard.press('Enter');
  const picker = page.getByRole('dialog', { name: 'Escolher profissional' });
  await expect(picker.getByLabel('Buscar profissional')).toBeFocused();
  await page.keyboard.type('derma');
  await expect(picker.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(picker.getByRole('option', { name: /^Dr\. Lucas Vieira/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(professional).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/professional=pro-clara&view=semana|view=semana.*professional=pro-clara/);

  const filters = page.getByRole('button', { name: 'Filtros', exact: true });
  await filters.focus(); await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Filtros' });
  await expect(panel.getByLabel('Filtrar paciente', { exact: true })).toBeFocused();
  await panel.getByLabel('Filtrar especialidade da agenda').selectOption('Cardiologia');
  await expect(page.getByRole('button', { name: 'Filtros, 1 aplicado', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Filtros, 1 aplicado', exact: true })).toBeFocused();
});

test('(g) pílula do horário atual só hoje, sem linha de "agora" atravessando a grade', async ({ page }) => {
  await open(page, '/gestao/agenda');
  const pill = page.locator('.calendar-time-axis .calendar-now');
  await expect(pill).toHaveText('Agora: 10:15');
  const axis = (await page.locator('.calendar-time-axis').boundingBox())!; const box = (await pill.boundingBox())!;
  expect(box.y + box.height / 2 - axis.y).toBeCloseTo((minutes('10:15') - 480) * 2, 0);
  expect(box.height).toBeCloseTo(20, 0);
  await expect(page.locator('.calendar-day-column [class*="now"], .calendar-body > [class*="now"]')).toHaveCount(0);
  // Today opens 30 minutes before now.
  expect(await page.locator('.calendar-scroll').evaluate(el => el.scrollTop)).toBe((minutes('09:45') - 480) * 2);
  await page.goto('/gestao/agenda?date=2026-11-10');
  await expect(pill).toHaveCount(0);
});

test('(h) cancelada tracejada e riscada; selo de remarcação na consulta da Ana Beatriz', async ({ page }) => {
  const cancelled = seed.appointments.find(a => a.date === seed.referenceDate && a.status === 'cancelada')!;
  await open(page, '/gestao/agenda');
  const card = page.locator(`[data-appointment-id="${cancelled.id}"]`);
  await expect(card).toHaveCSS('border-top-style', 'dashed');
  await expect(card.locator('.event-patient')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(card).toHaveAttribute('data-tone', 'neutral');
  const ana = page.locator('[data-appointment-id="appt-ana"]');
  await expect(ana.locator('.event-flag')).toHaveText('Remarcar');
  await expect(ana).toHaveAttribute('aria-label', 'Ana Beatriz Santos, 11:30 a 12:00, A confirmar, pediu remarcação');
  await page.goto('/gestao/agenda?professional=pro-clara');
  await expect(ana.locator('.event-flag')).toHaveText('Pediu remarcação');
  await expect(ana).toHaveAttribute('aria-label', 'Ana Beatriz Santos, 11:30 a 12:00, A confirmar, pediu remarcação, com Dra. Clara Mendes');
});

test('(i) modo lista por from/to: título do recorte, "Voltar à agenda" e sem seletor Dia/Semana', async ({ page }) => {
  await open(page, '/gestao/agenda?from=2026-11-01&to=2026-11-15&status=cancelada');
  await expect(page.locator('h1')).toHaveText('Agenda');
  await expect(page.getByRole('heading', { level: 2, name: 'Cancelamentos · 1 a 15 de nov.' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Visualização' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hoje', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Escolher data$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Profissional:/ })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Filtrar por situação' })).toBeVisible();
  const expected = seed.appointments.filter(a => a.date >= '2026-11-01' && a.date <= '2026-11-15' && a.status === 'cancelada');
  await expect(page.locator('.schedule-list-event')).toHaveCount(expected.length);
  await expect(page.locator('.agenda-day-group h3').first()).toHaveText(/^[A-Z][a-zçáéíóúãõâê-]+, \d{1,2} de novembro · \d+$/);
  await page.locator('.schedule-list-event').first().click();
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Voltar à agenda' }).first().click();
  await expect(page).not.toHaveURL(/from=|to=/);
  await expect(page).toHaveURL(/date=2026-11-01/);
  await expect(page.getByRole('group', { name: 'Visualização' })).toBeVisible();
  await page.goto('/gestao/agenda?from=2027-03-01&to=2027-03-02');
  await expect(page.getByRole('heading', { name: 'Nenhuma consulta neste período' })).toBeVisible();
});

test('(j) 1024 rola dentro do card; 390 mostra uma coluna e a lista semanal, sem overflow global', async ({ page }) => {
  const five: DemoState = structuredClone(seed);
  five.professionals.push({ ...five.professionals[0], id: 'pro-marina', name: 'Dra. Marina Dias' });
  await page.setViewportSize({ width: 1024, height: 800 });
  await open(page, '/gestao/agenda', five);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  expect(await noHorizontalScroll(page)).toBe(false);
  await expect(page.locator('.calendar-frame')).toHaveAttribute('data-edge', 'start');
  // 200 px columns: 30-minute cards show the full situation label.
  expect((await page.locator('.calendar-day-column').first().boundingBox())!.width).toBeCloseTo(200, 0);
  const truncated = await page.locator('.calendar-event[data-duration="30"] .event-status').evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth).map(el => el.textContent));
  expect(truncated).toEqual([]);
  const axisX = (await page.locator('.calendar-time-axis').boundingBox())!.x;
  await page.locator('.calendar-scroll').evaluate(el => { el.scrollLeft = 200; });
  await expect(page.locator('.calendar-frame')).toHaveAttribute('data-edge', /middle|end/);
  expect((await page.locator('.calendar-time-axis').boundingBox())!.x).toBeCloseTo(axisX, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.calendar-day-column')).toHaveCount(1);
  await expect(page.locator('.mobile-pro-current')).toHaveAttribute('aria-live', 'polite');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const newButton = page.getByRole('button', { name: 'Novo agendamento', exact: true });
  expect((await newButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await newButton.boundingBox())!.y).toBeGreaterThan((await page.locator('h1').boundingBox())!.y + 20);
  await page.goto('/gestao/agenda?professional=pro-clara');
  await expect(page.locator('.agenda-day-group')).toHaveCount(7);
  await expect(page.locator('.calendar-scroll')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: /^Profissional:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Escolher profissional' })).toHaveAttribute('aria-modal', 'true');
  for (const width of [768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
  }
});

test('(k) os dois temas mantêm contraste nos avatares, rótulos de situação e pílula do horário', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(value => localStorage.setItem('clinia.theme', value), theme);
    await open(page, '/gestao/agenda');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const avatar of await page.locator('.calendar-professional-header .pro-avatar').all()) {
      const [color, background] = await avatar.evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
      expect(contrastRatio(hex(color), hex(background)), `${theme} avatar`).toBeGreaterThanOrEqual(4.5);
    }
    for (const status of ['agendada', 'confirmada', 'realizada', 'falta', 'cancelada']) {
      const card = page.locator(`.calendar-event[data-status="${status}"]`).first();
      if (!(await card.count())) continue;
      const [ink, background] = await card.evaluate(el => [getComputedStyle(el.querySelector('.event-status')!).color, getComputedStyle(el).backgroundColor]);
      expect(contrastRatio(hex(ink), hex(background)), `${theme} ${status}`).toBeGreaterThanOrEqual(4.5);
    }
    const [pillInk, pillBg] = await page.locator('.calendar-now').evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
    expect(contrastRatio(hex(pillInk), hex(pillBg)), `${theme} pill`).toBeGreaterThanOrEqual(4.5);
    const [slotInk, surface] = await page.locator('.calendar-free-slot').first().evaluate(el => [getComputedStyle(el).color, getComputedStyle(el.closest('.calendar-day-column')!).backgroundColor]);
    expect(contrastRatio(hex(slotInk), hex(surface)), `${theme} livre`).toBeGreaterThanOrEqual(4.5);
    await page.evaluate(() => sessionStorage.removeItem('redesign-seeded'));
  }
});

test('(l) consultas fora do expediente: aviso âmbar, "Revisar" abre a seção e nada some', async ({ page }) => {
  const late: DemoState = structuredClone(seed);
  late.appointments.push({ id: 'late-one', patientId: 'patient-2', professionalId: 'pro-lucas', specialty: 'Dermatologia', date: '2026-11-10', start: '19:00', duration: 30, status: 'confirmada', events: [] });
  await open(page, '/gestao/agenda?date=2026-11-10', late);
  const notice = page.locator('.calendar-outside-notice');
  await expect(notice).toContainText('1 consulta fora do horário');
  const section = page.locator('details.outside-hours');
  await expect(section).not.toHaveAttribute('open', '');
  await notice.getByRole('button', { name: 'Revisar' }).click();
  await expect(section).toHaveAttribute('open', '');
  await section.locator('[data-appointment-id="late-one"]').click();
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta' })).toBeVisible();
});
