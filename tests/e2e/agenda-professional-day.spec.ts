import { test, expect, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import { getAvailability, getFreeSlots } from '../../src/lib/metrics';
import { contrastRatio } from '../../src/lib/agenda-presentation';
import type { DemoState } from '../../src/lib/types';

const seed = createDemoState('2026-11-09');
const url = '/gestao/agenda?view=dia&professional=pro-clara';
const hex = (rgb: string) => `#${(rgb.match(/\d+/g) ?? []).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('')}`;
async function open(page: Page, path = url, data: DemoState = seed) {
  await page.addInitScript(({ value }) => { if (!sessionStorage.getItem('pro-day-seeded')) { localStorage.setItem('clinia.demo.v1', JSON.stringify(value)); sessionStorage.setItem('pro-day-seeded', '1'); } }, { value: data });
  await page.goto(path);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.app-loading')).toHaveCount(0);
}
const panel = (page: Page) => page.getByRole('complementary', { name: 'Painel do dia' });
const details = (page: Page) => page.getByRole('dialog', { name: 'Detalhes da consulta' });

test('(a) sem cabeçalho de coluna; painel com mini-calendário e resumo do dia', async ({ page }) => {
  await open(page);
  await expect(page.locator('.calendar-day-headers')).toHaveCount(0);
  await expect(page.locator('.calendar-professional-header')).toHaveCount(0);
  await expect(page.locator('.calendar-day-column')).toHaveCount(1);
  // Off-hours are plain; only the lunch gap is labelled, aligned left.
  await expect(page.locator('.calendar-off-hours.is-plain')).not.toHaveCount(0);
  await expect(page.locator('.calendar-off-hours.is-plain span')).toHaveText(['Intervalo']);
  await expect(page.locator('.calendar-off-hours').first()).toHaveCSS('background-image', 'none');
  const free = getFreeSlots(seed, 'pro-clara', '2026-11-09');
  await expect(page.locator('.calendar-free-slot').first()).toContainText(`Livre · ${free[0]}`);
  await expect(page.locator('.calendar-day-column [class*="now"]')).toHaveCount(0);
  await expect(page.locator('.calendar-time-axis .calendar-now')).toHaveText('Agora: 10:15');
  const side = panel(page);
  await expect(side.getByRole('grid', { name: 'Novembro 2026' })).toBeVisible();
  await expect(side.getByRole('button', { name: /^Segunda-feira, 9 de novembro de 2026/ })).toHaveAttribute('aria-current', 'date');
  await expect(side.getByRole('heading', { name: 'Resumo do dia' })).toBeVisible();
  const windows = getAvailability(seed, 'pro-clara', '2026-11-09').map(w => `${w.start}–${w.end}`).join(' · ');
  await expect(side).toContainText(`Atendimento: ${windows}`);
  await expect(side.locator('.day-panel-next button')).not.toHaveCount(0);
  expect(await side.locator('.day-panel-next button').count()).toBeLessThanOrEqual(3);
  await expect(side.locator('.day-panel-slots .calendar-free-chip')).toHaveCount(Math.min(8, free.length));
  await expect(side).toContainText('Nenhum bloqueio');
  await expect(side.getByRole('link', { name: 'Ver semana' })).toBeVisible();
  await expect(side.getByRole('link', { name: 'Gerenciar disponibilidade' })).toHaveAttribute('href', '/gestao/configuracoes?tab=availability&professional=pro-clara');
  await side.getByRole('button', { name: 'Bloquear horário' }).click();
  await expect(page.getByRole('dialog', { name: 'Novo bloqueio' }).getByLabel('Profissional do bloqueio')).toHaveValue('pro-clara');
});

test('(b) clicar numa consulta seleciona no painel (selected), sem modal; detalhes completos e Esc', async ({ page }) => {
  await open(page);
  const card = page.locator('.calendar-scroll [data-appointment-id="appt-ana"]');
  await card.click();
  await expect(page).toHaveURL(/selected=appt-ana/);
  await expect(details(page)).toHaveCount(0);
  await expect(card).toHaveClass(/is-selected/);
  const side = panel(page);
  await expect(side.getByRole('heading', { name: 'Ana Beatriz Santos' })).toBeVisible();
  await expect(side).toContainText('Segunda-feira, 9 de novembro');
  await expect(side).toContainText('11:30–12:00');
  await expect(side).toContainText('Dra. Clara Mendes · Cardiologia');
  await expect(side).toContainText('Pediu remarcação');
  await expect(side.locator('a[href^="tel:"]')).toBeVisible();
  for (const action of ['Confirmar', 'Remarcar', 'Marcar realizada', 'Registrar falta', 'Cancelar consulta']) await expect(side.getByRole('button', { name: action, exact: true })).toBeVisible();
  await expect(side.getByRole('link', { name: 'Ver cadastro do paciente' })).toHaveAttribute('href', '/gestao/pacientes?id=patient-1');
  await side.getByRole('button', { name: 'Abrir detalhes completos' }).click();
  await expect(details(page)).toContainText('Ana Beatriz Santos');
  await page.keyboard.press('Escape');
  await expect(details(page)).toHaveCount(0);
  await expect(page).toHaveURL(/selected=appt-ana/);
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/selected=/);
  await expect(card).toBeFocused();
  await expect(side.getByRole('heading', { name: 'Resumo do dia' })).toBeVisible();
  // "Próximos pacientes" also selects, and the browser back clears it.
  await side.locator('.day-panel-next [data-appointment-id="appt-ana"]').click();
  await expect(page).toHaveURL(/selected=appt-ana/);
  await page.goBack();
  await expect(page).not.toHaveURL(/selected=/);
  // `appointment=ID` keeps opening the modal in any view.
  await page.goto(`${url}&appointment=appt-ana`);
  await expect(details(page)).toBeVisible();
});

test('(c) Confirmar no painel atualiza o card na grade e as contagens', async ({ page }) => {
  await open(page, `${url}&selected=appt-ana`);
  const day = seed.appointments.filter(a => a.date === '2026-11-09' && a.professionalId === 'pro-clara');
  const count = (status: string) => day.filter(a => a.status === status).length;
  const chips = page.getByRole('group', { name: 'Filtrar por situação' });
  await expect(chips.getByRole('button', { name: `A confirmar ${count('agendada')}`, exact: true })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(panel(page).getByRole('status')).toHaveText('Consulta confirmada.');
  await expect(page.locator('.calendar-scroll [data-appointment-id="appt-ana"]')).toHaveAttribute('data-status', 'confirmada');
  await expect(chips.getByRole('button', { name: `A confirmar ${count('agendada') - 1}`, exact: true })).toBeVisible();
  await expect(chips.getByRole('button', { name: `Confirmadas ${count('confirmada') + 1}`, exact: true })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Confirmar', exact: true })).toHaveCount(0);
});

test('(d) o mini-calendário do painel troca a data', async ({ page }) => {
  await open(page, `${url}&selected=appt-ana`);
  await panel(page).getByRole('button', { name: /^Terça-feira, 10 de novembro de 2026/ }).click();
  await expect(page).toHaveURL(/date=2026-11-10/);
  await expect(page).not.toHaveURL(/selected=/);
  await expect(panel(page).getByRole('button', { name: /^Terça-feira, 10 de novembro de 2026/ })).toHaveClass(/is-selected/);
  await expect(panel(page)).toContainText('Reunião de equipe');
  await panel(page).locator('[data-block-id="block-1"]').click();
  await expect(page).toHaveURL(/tab=availability&professional=pro-clara&block=block-1/);
});

test('(e) chips de horário livre abrem o novo agendamento pré-preenchido', async ({ page }) => {
  await open(page, `${url}&date=2026-11-10`);
  const start = getFreeSlots(seed, 'pro-clara', '2026-11-10')[1];
  await panel(page).getByRole('button', { name: `Agendar às ${start} com Dra. Clara Mendes` }).click();
  const form = page.getByRole('dialog', { name: 'Novo agendamento', exact: true });
  await expect(form.getByLabel('Profissional', { exact: true })).toHaveValue('pro-clara');
  // Date and time are no longer text fields: the day is selected in the month grid
  // and the time in the free-times list.
  await expect(form.locator('[data-date="2026-11-10"]')).toHaveClass(/is-selected/);
  await expect(form.getByRole('option', { name: start, exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('(f) em 900 px a seleção abre um drawer e o resumo fica num botão', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await open(page);
  await expect(panel(page)).toHaveCount(0);
  await page.locator('.calendar-scroll [data-appointment-id="appt-ana"]').click();
  const drawer = page.getByRole('dialog', { name: 'Consulta de Ana Beatriz Santos' });
  await expect(drawer).toHaveAttribute('aria-modal', 'true');
  await expect(drawer.getByRole('button', { name: 'Confirmar', exact: true })).toBeVisible();
  expect((await drawer.boundingBox())!.width).toBeCloseTo(360, 0);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page).not.toHaveURL(/selected=/);
  await expect(page.locator('.calendar-scroll [data-appointment-id="appt-ana"]')).toBeFocused();
  await page.getByRole('button', { name: 'Resumo do dia' }).click();
  const summary = page.getByRole('dialog', { name: 'Resumo do dia' });
  await expect(summary).toContainText('Próximos pacientes');
  await summary.locator('.day-panel-next [data-appointment-id="appt-ana"]').click();
  await expect(summary).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Consulta de Ana Beatriz Santos' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(900);
});

test('(g) os dois temas: textos do painel com contraste ≥ 4,5:1', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(value => localStorage.setItem('clinia.theme', value), theme);
    await open(page, `${url}&selected=appt-ana`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const side = panel(page);
    const background = hex(await side.evaluate(el => getComputedStyle(el).backgroundColor));
    for (const selector of ['.day-panel-facts li', '.day-panel-phone', '.mini-calendar-heading strong', '.mini-calendar th', '.text-link']) {
      const color = hex(await side.locator(selector).first().evaluate(el => getComputedStyle(el).color));
      expect(contrastRatio(color, background), `${theme} ${selector}`).toBeGreaterThanOrEqual(4.5);
    }
    await side.getByRole('button', { name: 'Fechar' }).click();
    for (const selector of ['.day-panel-hours', '.day-panel-subtitle', '.day-panel-time', '.day-panel-empty', '.day-panel-links .text-link']) {
      const color = hex(await side.locator(selector).first().evaluate(el => getComputedStyle(el).color));
      expect(contrastRatio(color, background), `${theme} ${selector}`).toBeGreaterThanOrEqual(4.5);
    }
    const label = page.locator('.calendar-off-hours.is-plain span').first();
    const [ink, plain] = await label.evaluate(el => [getComputedStyle(el).color, getComputedStyle(el.parentElement!).backgroundColor]);
    expect(contrastRatio(hex(ink), hex(plain)), `${theme} intervalo`).toBeGreaterThanOrEqual(4.5);
    await page.evaluate(() => sessionStorage.removeItem('pro-day-seeded'));
  }
});
