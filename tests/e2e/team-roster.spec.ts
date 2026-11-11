import { expect, test } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';

const seed = createDemoState('2026-11-09');
seed.professionals[0].name = 'Dra. Clara Mendes com nome extenso para verificar a leitura do cadastro';
for (let i = 0; i < 24; i++) seed.professionals.push({ ...structuredClone(seed.professionals[0]), id: `roster-${i}`, name: `Profissional fictício ${String(i + 1).padStart(2, '0')}` });
test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => {
    if (!sessionStorage.getItem('team-seeded')) { localStorage.setItem('clinia.demo.v1', JSON.stringify(data)); sessionStorage.setItem('team-seeded', 'yes'); }
  }, seed);
});

test('cards e tabela paginam, ordenam e preservam contexto ao abrir atividade e voltar', async ({ page }) => {
  await page.goto('/gestao/equipe?days=30');
  await expect(page.locator('.team-person-card')).toHaveCount(12);
  await expect(page.getByRole('navigation', { name: 'Paginação dos profissionais' })).toContainText('Exibindo 1–12 de 28');
  await page.getByRole('button', { name: 'Tabela', exact: true }).click();
  const table = page.getByRole('region', { name: 'Tabela de profissionais' });
  await expect(table.locator('tbody tr')).toHaveCount(12);
  await page.getByRole('button', { name: 'Próxima página de profissionais', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  const name = await table.locator('tbody tr').first().getByRole('link').first().textContent();
  await table.locator('tbody tr').first().getByRole('link').first().click();
  await expect(page.locator('h1')).toHaveText(name!);
  await page.getByRole('link', { name: 'Todos os profissionais', exact: true }).click();
  await expect(page).toHaveURL(/page=2/); await expect(page).toHaveURL(/view=table/);
  await expect(page.getByLabel('Período da equipe')).toHaveValue('30');
  await table.getByRole('button', { name: 'Realizadas', exact: true }).click();
  await expect(page).not.toHaveURL(/page=2/);
  const values = await table.locator('tbody tr').evaluateAll(rows => rows.map(row => Number(row.querySelectorAll('td')[3].textContent)));
  expect(values).toEqual([...values].sort((a, b) => b - a));
  await page.getByRole('searchbox', { name: 'Buscar profissional' }).fill('Sem correspondência fictícia');
  await expect(page.getByRole('heading', { name: 'Nenhum profissional encontrado' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(12);
  await expect(page.getByRole('button', { name: 'Tabela', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('cadastro editado e inativação preservam histórico, revisão futura e filtro cadastral', async ({ page }) => {
  await page.goto('/gestao/equipe?id=pro-clara&view=table&days=30');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Editar profissional', exact: true });
  await form.getByLabel('Nome do profissional').fill('Dra. Clara Mendes — cadastro fictício atualizado');
  await form.getByRole('button', { name: 'Salvar profissional', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator('h1')).toContainText('cadastro fictício atualizado');
  await page.getByRole('button', { name: 'Inativar profissional', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar inativação', exact: true }).click();
  await expect(page.getByText('Profissional inativo.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Todos os profissionais', exact: true }).click();
  await page.getByLabel('Filtrar profissionais ativos').selectOption('inactive');
  const table = page.getByRole('region', { name: 'Tabela de profissionais' });
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('consulta(s) futura(s) para revisar');
  await page.reload(); await expect(table.locator('tbody tr')).toHaveCount(1);
});

test('equipe extensa e nomes longos permanecem legíveis no celular, tablet e tema noturno', async ({ page }) => {
  await page.goto('/gestao/equipe');
  await expect(page.locator('.team-person-card')).toHaveCount(12);
  await page.screenshot({ path: 'docs/qa/equipe-cards-compactos.png', fullPage: true });
  await page.getByRole('button', { name: 'Tabela', exact: true }).click();
  await page.screenshot({ path: 'docs/qa/equipe-tabela.png', fullPage: true });
  const table = page.getByRole('region', { name: 'Tabela de profissionais' });
  for (const [width, height] of [[768, 844], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await table.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    expect(await table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  }
  await page.getByRole('button', { name: 'Cards', exact: true }).click();
  await expect(page.locator('.team-person-card')).toHaveCount(12);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/qa/equipe-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Ativar modo noturno', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'docs/qa/equipe-noturna.png', fullPage: true });
  await page.getByRole('button', { name: 'Atendentes', exact: true }).click();
  await expect(page.locator('.person-card')).toHaveCount(seed.users.length);
  await page.getByRole('button', { name: 'Cadastrar profissional', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Cadastrar profissional', exact: true })).toBeVisible();
});
