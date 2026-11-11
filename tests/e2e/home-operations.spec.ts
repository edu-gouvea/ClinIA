import { expect, test } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import { getMetrics, getPeriod } from '../../src/lib/metrics';

const seed = createDemoState('2026-11-09');
test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => {
    if (!sessionStorage.getItem('home-seeded')) {
      localStorage.setItem('clinia.demo.v1', JSON.stringify(data));
      sessionStorage.setItem('home-seeded', 'yes');
    }
  }, seed);
});

test('Início prioriza operações atuais, preserva métricas por período e abre os recortes corretos', async ({ page }) => {
  await page.goto('/inicio');
  const priorities = page.getByRole('region', { name: 'Precisa de atenção' });
  await expect(priorities).toBeVisible();
  await expect(priorities.getByRole('link', { name: /Solicitações de atendimento/ })).toContainText(String(seed.conversations.filter(c => c.status === 'aguardando').length));
  await expect(priorities.getByRole('link', { name: /Confirmações de hoje/ })).toHaveAttribute('href', `/gestao/agenda?date=${seed.referenceDate}&status=agendada`);
  await expect(priorities.getByRole('link', { name: /Pedidos de remarcação/ })).toHaveAttribute('href', '/conversas?reason=remarcacao');
  expect((await priorities.boundingBox())!.y).toBeLessThan((await page.locator('.home-trend').boundingBox())!.y);
  for (const days of [1, 30, 7]) {
    await page.getByLabel('Período dos indicadores').selectOption(String(days));
    await expect(page).toHaveURL(new RegExp(`period=${days}`));
    const metrics = getMetrics(seed, getPeriod(seed.referenceDate, days));
    await expect(page.locator('.metric-card').filter({ hasText: 'Consultas previstas' }).locator('.metric-value')).toHaveText(String(metrics.planned));
    await expect(page.locator('.metric-card').filter({ hasText: 'Consultas realizadas' }).locator('.metric-value')).toHaveText(String(metrics.completed));
    await expect(priorities.getByRole('link', { name: /Confirmações de hoje/ })).toHaveAttribute('href', `/gestao/agenda?date=${seed.referenceDate}&status=agendada`);
  }
  for (const card of await page.locator('.metric-card').all()) expect((await card.boundingBox())!.height).toBeLessThan(155);
  expect(new Set(await page.locator('.metric-card').evaluateAll(cards => cards.map(card => getComputedStyle(card).backgroundColor))).size).toBe(1);
  const pending = seed.appointments.filter(a => a.date === seed.referenceDate && ['agendada', 'confirmada'].includes(a.status)).length;
  await expect(page.locator('.home-preview')).toHaveText(`Exibindo ${Math.min(5, pending)} de ${pending} consultas pendentes hoje.`);
  await page.screenshot({ path: 'docs/qa/inicio-operacional-desktop.png', fullPage: true });
  await priorities.getByRole('link', { name: /Solicitações de atendimento/ }).click();
  await expect(page).toHaveURL(/conversas\?status=aguardando/);
  await expect(page.getByLabel('Situação da conversa')).toHaveValue('aguardando');
  await expect(page.getByText('Enter para enviar · Shift + Enter para nova linha', { exact: true })).toHaveCount(0);
});

test('prévia mantém consultas anteriores sem resultado e o layout comporta nomes longos e temas', async ({ page }) => {
  const state = structuredClone(seed);
  const appointment = state.appointments.find(a => a.date === state.referenceDate)!;
  appointment.status = 'agendada'; appointment.start = '07:00'; appointment.duration = 30;
  state.patients.find(p => p.id === appointment.patientId)!.name = 'Paciente fictício com nome muito extenso para verificar leitura e quebra de linha';
  await page.addInitScript(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), state);
  for (const [width, height] of [[1440, 900], [768, 844], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/inicio');
    await expect(page.locator('.home-today-row').first()).toContainText('07:00');
    await expect(page.locator('.home-today-row').first()).toContainText('Aguardando resultado');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  }
  await page.screenshot({ path: 'docs/qa/inicio-operacional-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Ativar modo noturno', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'docs/qa/inicio-operacional-noturno.png', fullPage: true });
  await page.getByRole('button', { name: /Novo agendamento/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('ausência de registros mostra estados vazios e não inventa tendências', async ({ page }) => {
  const empty = structuredClone(seed);
  empty.appointments = []; empty.conversations = []; empty.clinic.hours = []; empty.availabilityHistory = {};
  await page.addInitScript(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), empty);
  await page.goto('/inicio?period=1');
  await expect(page.getByText('Agenda em dia', { exact: true })).toBeVisible();
  await expect(page.getByText('Nenhuma pendência nessas filas.', { exact: true })).toBeVisible();
  await expect(page.locator('.metric-value').filter({ hasText: 'Sem dados' })).toHaveCount(2);
  await expect(page.locator('.metric-change svg')).toHaveCount(0);
  await expect(page.getByText('0 em andamento', { exact: true })).toBeVisible();
});

test('consulta do Início abre detalhes e remarcação sem sair da tela; X mantém período e foco', async ({ page }) => {
  await page.goto('/inicio?period=30');
  const row = page.locator('.home-today-row').first();
  const href = (await row.getAttribute('href'))!;
  expect(href).toMatch(/^\/inicio\?/);
  await row.click();
  const details = page.getByRole('dialog', { name: 'Detalhes da consulta', exact: true });
  await expect(details).toBeVisible();
  await expect(page).toHaveURL(/\/inicio\?.*appointment=/);
  for (const action of ['Remarcar', 'Marcar realizada', 'Registrar falta', 'Cancelar consulta']) {
    await expect(details.getByRole('button', { name: action, exact: true })).toBeVisible();
  }
  await details.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(details).toHaveCount(0);
  await expect(page).toHaveURL('/inicio?period=30');
  await expect(row).toBeFocused();
  await row.click();
  await details.getByRole('button', { name: 'Remarcar', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Remarcar consulta', exact: true });
  await expect(form.getByLabel('Paciente', { exact: true })).toHaveAttribute('readonly', '');
  await expect(page).toHaveURL(/\/inicio\?.*edit=/);
  await form.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(details).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/inicio?period=30');
  await page.goto(href);
  await expect(details).toBeVisible();
  await details.getByRole('button', { name: 'Marcar realizada', exact: true }).click();
  await expect(details.getByRole('status')).toContainText('Consulta realizada.');
  await expect(details.getByLabel('Anotações da consulta', { exact: true })).toBeVisible();
  await details.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page).toHaveURL('/inicio?period=30');
  expect(await page.locator('.home-today-row').first().getAttribute('href')).not.toBe(href);
});

test('cancelamento pelo detalhe no celular mantém o Início e persiste o motivo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/inicio?period=7');
  const row = page.locator('.home-today-row').first();
  const id = new URL((await row.getAttribute('href'))!, 'http://localhost').searchParams.get('appointment')!;
  await row.click();
  const details = page.getByRole('dialog', { name: 'Detalhes da consulta', exact: true });
  await expect(details).toBeVisible();
  await details.getByRole('button', { name: 'Cancelar consulta', exact: true }).click();
  await details.getByLabel('Motivo do cancelamento', { exact: true }).fill('Motivo fictício informado pelo paciente.');
  await details.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(details.getByRole('status')).toContainText('Consulta cancelada.');
  await expect(details).toContainText('Motivo fictício informado pelo paciente.');
  await details.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page).toHaveURL('/inicio?period=7');
  await page.reload();
  await expect(page.locator('h1')).toContainText('Bom dia, Marina');
  const saved = await page.evaluate(id => JSON.parse(localStorage.getItem('clinia.demo.v1')!).appointments.find((appointment: { id: string }) => appointment.id === id), id);
  expect(saved.status).toBe('cancelada');
  expect(saved.cancelReason).toBe('Motivo fictício informado pelo paciente.');
});
