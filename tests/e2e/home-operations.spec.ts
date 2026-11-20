import { expect, test } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import { getMetrics, getPeriod } from '../../src/lib/metrics';
import type { Page } from '@playwright/test';

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
  await expect(priorities.getByRole('link', { name: /Solicitações na fila/ })).toContainText(String(seed.conversations.filter(c => c.status === 'aguardando').length));
  await expect(priorities.getByRole('link', { name: /Confirmações de hoje/ })).toHaveAttribute('href', `/gestao/agenda?date=${seed.referenceDate}&status=agendada`);
  await expect(priorities.getByRole('link', { name: /Pedidos de remarcação/ })).toHaveAttribute('href', '/conversas?reason=remarcacao');
  expect((await priorities.boundingBox())!.y).toBeLessThan((await page.locator('.home-chart').boundingBox())!.y);
  for (const days of [1, 30, 7]) {
    await page.getByLabel('Período dos indicadores').selectOption(String(days));
    await expect(page).toHaveURL(new RegExp(`period=${days}`));
    const metrics = getMetrics(seed, getPeriod(seed.referenceDate, days));
    await expect(page.locator('.metric-card').filter({ hasText: 'Em aberto' }).locator('.metric-value')).toHaveText(String(metrics.planned));
    await expect(page.locator('.metric-card').filter({ hasText: 'Consultas realizadas' }).locator('.metric-value')).toHaveText(String(metrics.completed));
    await expect(priorities.getByRole('link', { name: /Confirmações de hoje/ })).toHaveAttribute('href', `/gestao/agenda?date=${seed.referenceDate}&status=agendada`);
  }
  // KPI anatomy is label · value · variation · detail; the "Em aberto" detail may wrap to two lines.
  for (const card of await page.locator('.metric-card').all()) expect((await card.boundingBox())!.height).toBeLessThan(170);
  expect(new Set(await page.locator('.metric-card').evaluateAll(cards => cards.map(card => getComputedStyle(card).backgroundColor))).size).toBe(1);
  const pending = seed.appointments.filter(a => a.date === seed.referenceDate && ['agendada', 'confirmada'].includes(a.status)).length;
  await expect(page.locator('.home-today-row')).toHaveCount(Math.min(6, pending));
  await expect(page.getByRole('button', { name: `Ver mais ${pending - 6}`, exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/qa/inicio-operacional-desktop.png', fullPage: true });
  await priorities.getByRole('link', { name: /Solicitações na fila/ }).click();
  await expect(page).toHaveURL(/conversas\?status=aguardando/);
  // The status select became tabs: the legacy link opens "Pendentes".
  await expect(page.getByRole('tab', { name: /^Pendentes/ })).toHaveAttribute('aria-selected', 'true');
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
  // The theme switch sits in the sidebar, which is a drawer below 768 px: widen first.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Tema escuro', exact: true }).click();
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
  await expect(page.getByText('Tudo em dia', { exact: true })).toBeVisible();
  await expect(page.locator('.metric-value').filter({ hasText: 'Sem dados' })).toHaveCount(2);
  await expect(page.locator('.metric-change svg')).toHaveCount(0);
  await expect(page.locator('.metric-arrow')).toHaveCount(0);
  await expect(page.getByText('Nenhuma conversa em atendimento', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ver mais/ })).toHaveCount(0);
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
  // Footer: primary + "Remarcar" + ⋯ menu; each outcome is either the primary button
  // or a menu item, depending on the situation.
  await expect(details.getByRole('button', { name: 'Remarcar', exact: true })).toBeVisible();
  await details.getByRole('button', { name: 'Mais ações', exact: true }).click();
  for (const action of ['Marcar como realizada', 'Registrar falta', 'Cancelar consulta']) {
    await expect(details.getByRole('button', { name: action, exact: true }).or(page.getByRole('menuitem', { name: action, exact: true }))).toBeVisible();
  }
  await page.keyboard.press('Escape');
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
  const done = details.getByRole('button', { name: 'Marcar como realizada', exact: true });
  if (await done.count()) await done.click();
  else { await details.getByRole('button', { name: 'Mais ações', exact: true }).click(); await page.getByRole('menuitem', { name: 'Marcar como realizada', exact: true }).click(); }
  await expect(details.getByRole('status')).toContainText('Consulta realizada.');
  await expect(details.getByRole('textbox')).toHaveCount(0);
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
  // "Cancelar consulta" now lives in the ⋯ menu; the confirmation with reason is unchanged.
  await details.getByRole('button', { name: 'Mais ações', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Cancelar consulta', exact: true }).click();
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

const pendingToday = seed.appointments.filter(a => a.date === seed.referenceDate && ['agendada', 'confirmada'].includes(a.status)).length;
async function ready(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false');
}

test('"Ver mais" expande e recolhe a própria lista e informa o estado', async ({ page }) => {
  await ready(page, '/inicio');
  const upcoming = page.getByRole('region', { name: 'Próximas consultas' });
  const more = upcoming.getByRole('button', { name: `Ver mais ${pendingToday - 6}`, exact: true });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  const list = page.locator(`[id="${await more.getAttribute('aria-controls')}"]`);
  await expect(list.locator('.home-today-row')).toHaveCount(6);
  await more.click();
  const less = upcoming.getByRole('button', { name: 'Mostrar menos', exact: true });
  await expect(less).toHaveAttribute('aria-expanded', 'true');
  await expect(list.locator('.home-today-row')).toHaveCount(pendingToday);
  await less.click();
  await expect(list.locator('.home-today-row')).toHaveCount(6);
  await expect(upcoming.getByRole('button', { name: `Ver mais ${pendingToday - 6}`, exact: true })).toHaveAttribute('aria-expanded', 'false');
});

test('gráfico por dia navega por teclado, descreve cada dia e soma o mesmo que os KPIs', async ({ page }) => {
  await ready(page, '/inicio?period=7');
  const metrics = getMetrics(seed, getPeriod(seed.referenceDate, 7));
  const chart = page.getByRole('group', { name: /Consultas por dia e resultado/ });
  const slots = chart.getByRole('button');
  await expect(slots).toHaveCount(7);
  await expect(chart.locator('[tabindex="0"]')).toHaveCount(1);
  const labels = await slots.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label') ?? ''));
  const sum = (pattern: RegExp) => labels.reduce((total, label) => total + Number(label.match(pattern)?.[1] ?? 0), 0);
  expect(sum(/(\d+) realizadas/)).toBe(metrics.completed);
  expect(sum(/(\d+) faltas/)).toBe(metrics.missed);
  expect(sum(/(\d+) canceladas/)).toBe(metrics.cancelled);
  expect(sum(/(\d+) em aberto/)).toBe(metrics.planned);
  expect(sum(/total (\d+)/)).toBe(metrics.total);
  await expect(page.getByRole('region', { name: 'Consultas por dia' })).toContainText(`${metrics.total} consultas`);
  expect(labels[0]).toMatch(/^Terça, 03 nov\.: \d+ realizadas, \d+ faltas, \d+ canceladas, \d+ em aberto, total \d+$/);
  // Roving tabindex: one tab stop that starts on "Hoje"; arrows/Home/End move it.
  await slots.last().focus();
  await expect(page.locator('.stacked-tooltip')).toContainText('Segunda, 09 nov.');
  await page.keyboard.press('Home');
  await expect(slots.first()).toBeFocused();
  await expect(slots.first()).toHaveAttribute('tabindex', '0');
  await expect(page.locator('.stacked-tooltip')).toContainText('Terça, 03 nov.');
  await page.keyboard.press('ArrowRight');
  await expect(slots.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(slots.last()).toBeFocused();
  await expect(chart.locator('[tabindex="0"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Como calculamos estes indicadores', exact: true }).click();
  await expect(page.locator('details.metric-definitions')).toHaveAttribute('open', '');
  await expect(page.locator('details.metric-definitions summary')).toBeFocused();
});

test('trocar o período muda KPIs, gráfico e intervalo, mas não a operação do dia', async ({ page }) => {
  await ready(page, '/inicio');
  const upcoming = page.getByRole('region', { name: 'Próximas consultas' });
  const attention = page.getByRole('region', { name: 'Precisa de atenção' });
  const before = [await upcoming.innerText(), await attention.innerText()];
  const interval = page.locator('.home-interval');
  await expect(interval).toHaveText('03–09 nov. · comparado a 27 out.–02 nov.');
  await page.getByLabel('Período dos indicadores').selectOption('30');
  await expect(page).toHaveURL(/period=30/);
  await expect(interval).toHaveText('11 out.–09 nov. · comparado a 11 set.–10 out.');
  const metrics = getMetrics(seed, getPeriod(seed.referenceDate, 30));
  await expect(page.locator('.metric-card').filter({ hasText: 'Consultas realizadas' }).locator('.metric-value')).toHaveText(String(metrics.completed));
  await expect(page.getByRole('group', { name: /Consultas por dia e resultado/ }).getByRole('button')).toHaveCount(30);
  expect([await upcoming.innerText(), await attention.innerText()]).toEqual(before);
  await page.getByLabel('Período dos indicadores').selectOption('1');
  await expect(interval).toHaveText('09 nov. · comparado a 08 nov.');
  await expect(page.getByRole('img', { name: /Consultas por dia e resultado/ })).toBeVisible();
  expect([await upcoming.innerText(), await attention.innerText()]).toEqual(before);
});

test('itens sem pendência colapsam numa linha "em dia"', async ({ page }) => {
  const state = structuredClone(seed);
  for (const conversation of state.conversations) {
    if (conversation.status === 'aguardando') { conversation.status = 'humano'; conversation.assigneeId = state.currentUserId; }
    conversation.reason = undefined;
  }
  await page.addInitScript(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), state);
  await ready(page, '/inicio');
  const attention = page.getByRole('region', { name: 'Precisa de atenção' });
  await expect(attention.getByRole('link', { name: /Solicitações na fila/ })).toHaveCount(0);
  await expect(attention.getByRole('link', { name: /Pedidos de remarcação/ })).toHaveCount(0);
  await expect(attention.getByText('Solicitações na fila em dia', { exact: true })).toBeVisible();
  await expect(attention.getByText('Pedidos de remarcação em dia', { exact: true })).toBeVisible();
  await expect(attention.getByRole('link', { name: /Confirmações de hoje/ })).toBeVisible();
  const confirmations = state.appointments.filter(a => a.date === state.referenceDate && a.status === 'agendada').length;
  await expect(attention.getByLabel(`${confirmations} pendências`)).toBeVisible();
  await expect(page.locator('.home-summary')).toContainText('nenhuma conversa aguardando');
});

test('em 390 px a ordem é cabeçalho, atenção, consultas e desempenho, sem transbordar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, '/inicio');
  const y = async (selector: string) => (await page.locator(selector).first().boundingBox())!.y;
  const order = [await y('.home-header'), await y('.home-attention'), await y('.home-upcoming'), await y('.home-kpis'), await y('.home-chart'), await y('.home-insight'), await y('details.metric-definitions')];
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect((await page.getByRole('button', { name: 'Novo agendamento' }).boundingBox())!.height).toBe(40);
  await expect(page.locator('.stacked-tooltip')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test('Início nos dois temas: tokens de status, IA e tooltip aplicados', async ({ page }) => {
  await ready(page, '/inicio');
  for (const [theme, ink] of [['light', 'rgb(24, 24, 27)'], ['dark', 'rgb(244, 244, 245)']] as const) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Tema escuro', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const confirmed = page.locator('.home-today-row .badge-info').first();
    await expect(confirmed).toContainText('Confirmada');
    await page.getByRole('group', { name: /Consultas por dia e resultado/ }).getByRole('button').last().focus();
    expect(await page.locator('.stacked-tooltip').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(ink);
    await page.screenshot({ path: `docs/qa/inicio-redesenho-${theme}.png`, fullPage: true });
  }
});

test('período responde na hora sem voltar ao topo e a barra lateral fica fixa ao rolar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page, '/inicio');
  const select = page.getByLabel('Período dos indicadores');
  await select.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(0);
  await select.selectOption('30');
  await expect(page).toHaveURL(/period=30/);
  const metrics = getMetrics(seed, getPeriod(seed.referenceDate, 30));
  await expect(page.locator('.metric-card').filter({ hasText: 'Consultas realizadas' }).locator('.metric-value')).toHaveText(String(metrics.completed));
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  // The sidebar is sticky: after scrolling it still starts at the top and its actions stay in view.
  const sidebar = page.getByRole('navigation', { name: 'Navegação principal' });
  expect((await sidebar.boundingBox())!.y).toBe(0);
  await expect(sidebar.getByRole('button', { name: 'Assistente IA', exact: true })).toBeInViewport();
  await expect(sidebar.getByRole('button', { name: 'Abrir perfil de Marina Costa', exact: true })).toBeInViewport();
  await page.goBack();
  await expect(select).toHaveValue('7');
});
