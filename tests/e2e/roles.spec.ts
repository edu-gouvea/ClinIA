import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

test('a recepção não vê nem abre a gestão; voltar ao perfil de administração restaura tudo', async ({ page }) => {
  await page.goto('/inicio');
  await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false');
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(nav.getByRole('link', { name: 'Visão gerencial', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Abrir perfil de Marina Costa', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Seu perfil de demonstração', exact: true });
  await dialog.getByRole('radio', { name: /Rafael Melo/ }).check();
  await expect(dialog.getByRole('heading', { name: 'Rafael Melo' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('h1')).toHaveText('Bom dia, Rafael');
  for (const name of ['Visão gerencial', 'Equipe', 'Configurações']) await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Agenda', exact: true })).toBeVisible();
  await page.goto('/gestao/configuracoes');
  await expect(page.getByRole('heading', { name: 'Área restrita à administração' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Configurações', level: 1 })).toHaveCount(0);
  await page.goto('/gestao/agenda');
  await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible();
  await nav.getByRole('button', { name: 'Abrir perfil de Rafael Melo', exact: true }).click();
  await page.getByRole('radio', { name: /Marina Costa/ }).check();
  await page.keyboard.press('Escape');
  await page.goto('/gestao/configuracoes');
  await expect(page.getByRole('heading', { name: 'Configurações', level: 1 })).toBeVisible();
});

test('na Agenda, a recepção edita o bloqueio no lugar e não recebe atalhos para Configurações', async ({ page }) => {
  const { createDemoState } = await import('../../src/lib/demo-data');
  const seed = createDemoState('2026-11-09');
  seed.currentUserId = 'user-rafael';
  await page.addInitScript(data => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('clinia.demo.v1', JSON.stringify(data)); sessionStorage.setItem('seeded', '1'); } }, seed);
  await page.goto('/gestao/agenda?date=2026-11-10');
  await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Opções de Dra. Clara Mendes', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Bloquear horário' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Gerenciar disponibilidade' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('.calendar-block[data-block-id="block-1"]').click();
  const dialog = page.getByRole('dialog', { name: 'Editar bloqueio', exact: true });
  await expect(dialog.getByLabel('Motivo administrativo')).toHaveValue('Reunião de equipe');
  await expect(page).toHaveURL(/\/gestao\/agenda/);
});
