import { expect, test } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import { getMetrics, getPeriod } from '../../src/lib/metrics';

const seed = createDemoState('2026-11-09');
test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => {
    if (!sessionStorage.getItem('management-seeded')) {
      localStorage.setItem('clinia.demo.v1', JSON.stringify(data));
      sessionStorage.setItem('management-seeded', 'yes');
    }
  }, seed);
});

test('análise compara períodos, ordena indicadores e preserva filtros nos links', async ({ page }) => {
  await page.goto('/gestao/visao-gerencial');
  await expect(page.getByRole('heading', { name: 'Visão gerencial', exact: true })).toBeVisible();
  const table = page.getByRole('region', { name: 'Tabela de atividade por profissional' });
  const completed = table.getByRole('columnheader').filter({ has: page.getByRole('button', { name: 'Ordenar por Realizadas', exact: true }) });
  await expect(completed).toHaveAttribute('aria-sort', 'descending');
  const values = await table.locator('tbody tr').evaluateAll(rows => rows.map(row => Number(row.querySelectorAll('td')[1].textContent)));
  expect(values).toEqual([...values].sort((a, b) => b - a));
  await table.getByRole('button', { name: 'Ordenar por Realizadas', exact: true }).click();
  await expect(completed).toHaveAttribute('aria-sort', 'ascending');
  await page.getByLabel('Período dos indicadores').selectOption('30');
  await expect(page).toHaveURL(/period=30/);
  await page.getByRole('combobox', { name: 'Profissional', exact: true }).selectOption('pro-clara');
  await expect(page).toHaveURL(/professional=pro-clara/);
  await page.getByRole('combobox', { name: 'Especialidade', exact: true }).selectOption('Cardiologia');
  await expect(page).toHaveURL(/specialty=Cardiologia/);
  await expect(table.locator('tbody tr')).toHaveCount(1);
  const expected = getMetrics(seed, getPeriod(seed.referenceDate, 30), 'pro-clara', 'Cardiologia');
  await expect(page.locator('.metric-card').filter({ hasText: 'Consultas realizadas' }).locator('.metric-value')).toHaveText(String(expected.completed));
  await expect(completed).toHaveAttribute('aria-sort', 'ascending');
  const planned = table.locator('tbody tr td').first().getByRole('link');
  const href = new URL((await planned.getAttribute('href'))!, 'http://localhost');
  expect(href.searchParams.get('professional')).toBe('pro-clara');
  expect(href.searchParams.get('specialty')).toBe('Cardiologia');
  expect(href.searchParams.get('from')).toBe(getPeriod(seed.referenceDate, 30).start);
  expect(href.searchParams.get('status')).toBe('previstas');
  await table.getByRole('link', { name: /Clara Mendes/ }).click();
  await expect(page).toHaveURL(/gestao\/equipe\?id=pro-clara/);
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Especialidade', exact: true })).toHaveValue('Cardiologia');
  await expect(table.getByRole('columnheader').filter({ hasText: 'Realizadas' })).toHaveAttribute('aria-sort', 'ascending');
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(seed.professionals.length);
  await expect(page.getByLabel('Período dos indicadores')).toHaveValue('30');
});

test('histórico, taxas sem base e recorte vazio continuam legíveis em telas menores e no tema noturno', async ({ page }) => {
  const state = structuredClone(seed);
  const professional = state.professionals.find(p => p.id === 'pro-clara')!;
  professional.active = false; professional.specialties = ['Dermatologia'];
  professional.name = 'Profissional fictícia com nome extenso para verificar a leitura da tabela';
  await page.addInitScript(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), state);
  await page.goto('/gestao/visao-gerencial?specialty=Cardiologia');
  const table = page.getByRole('region', { name: 'Tabela de atividade por profissional' });
  await expect(table.locator('tbody tr[data-professional-id="pro-clara"]')).toContainText('Histórico: Cardiologia');
  await expect(table.locator('tbody tr[data-professional-id="pro-clara"]')).toContainText('Inativo');
  await page.screenshot({ path: 'docs/qa/gestao-analise-desktop.png', fullPage: true });
  for (const [width, height] of [[768, 844], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await table.scrollIntoViewIfNeeded();
    await table.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    expect(await table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await expect(table.getByRole('button', { name: 'Ordenar por Taxa de faltas', exact: true })).toBeInViewport();
  }
  await table.evaluate(element => { element.scrollLeft = 0; });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/qa/gestao-analise-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Ativar modo noturno', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'docs/qa/gestao-analise-noturna.png', fullPage: true });
  await page.goto('/gestao/visao-gerencial?professional=missing&period=1');
  await expect(page.getByText('Nenhum profissional neste recorte.', { exact: false })).toBeVisible();
  await expect(page.locator('.metric-value').filter({ hasText: 'Sem dados' })).toHaveCount(2);
  await expect(page.locator('.management-change svg')).toHaveCount(0);
});

test('controles de período preservados sem ícones; agendamento disponível apenas no Início', async ({ page }) => {
  await page.goto('/inicio');
  await expect(page.getByLabel('Período dos indicadores')).toBeVisible();
  await expect(page.locator('.period-select svg')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Novo agendamento/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver agenda', exact: true })).toBeVisible();
  await page.goto('/gestao/visao-gerencial');
  await expect(page.locator('.management-period svg')).toHaveCount(0);
  await expect(page.getByLabel('Período dos indicadores')).toBeVisible();
  await expect(page.getByRole('button', { name: /Novo agendamento/ })).toHaveCount(0);
});
