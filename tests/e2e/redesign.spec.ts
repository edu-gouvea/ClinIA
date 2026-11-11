import { test, expect, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => {
    if (!sessionStorage.getItem('redesign-seeded')) {
      localStorage.setItem('clinia.demo.v1', JSON.stringify(data));
      sessionStorage.setItem('redesign-seeded', 'yes');
    }
  }, createDemoState('2026-11-09'));
});
async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.app-loading')).toHaveCount(0);
}

test('conversa compacta mantém o paciente à direita em desktop/tablet e abre painel lateral no celular', async ({ page }) => {
  for (const width of [1440, 1280, 1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await open(page, '/conversas?id=conversation-1');
    const chat = page.getByRole('region', { name: 'Conversa com Ana Beatriz Santos' });
    const patient = page.getByRole('complementary', { name: 'Dados do paciente' });
    await expect(patient).toBeVisible();
    const chatBox = (await chat.boundingBox())!;
    const patientBox = (await patient.boundingBox())!;
    expect(patientBox.x).toBeGreaterThanOrEqual(chatBox.x + chatBox.width - 1);
    expect(patientBox.y).toBeCloseTo(chatBox.y, 0);
    expect(chatBox.width).toBeLessThan(700);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    if (width === 1280) await page.screenshot({ path: 'docs/qa/conversa-paciente-direita.png', fullPage: true });
    await page.getByRole('button', { name: 'Fechar dados do paciente', exact: true }).click();
    await expect(patient).toHaveCount(0);
    await page.getByRole('button', { name: 'Mostrar dados do paciente', exact: true }).click();
    await expect(patient).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('complementary', { name: 'Dados do paciente' })).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'Mostrar dados do paciente', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Dados do paciente', exact: true });
  await expect(drawer).toBeVisible();
  const drawerBox = (await drawer.boundingBox())!;
  expect(drawerBox.x + drawerBox.width).toBeCloseTo(390, 0);
  await expect(drawer.getByRole('link', { name: 'Ver cadastro', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('tema acompanha o sistema inicialmente, permite teclado e preserva preferência e dados', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, '/inicio');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const original = await page.evaluate(() => localStorage.getItem('clinia.demo.v1'));
  const toggle = page.getByRole('button', { name: 'Ativar modo claro', exact: true });
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Ativar modo noturno' })).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Ativar modo noturno' }).click();
  await page.getByRole('link', { name: 'Gestão', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ativar modo claro' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('clinia.theme'))).toBe('dark');
  expect(await page.evaluate(() => localStorage.getItem('clinia.demo.v1'))).toBe(original);
});

test('tema noturno cobre todas as áreas, formulários e assistente; layout compacto e móvel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => localStorage.setItem('clinia.theme', 'dark'));
  const routes = ['/inicio', '/conversas?id=conversation-1', '/gestao/visao-gerencial', '/gestao/agenda?view=week&professional=pro-clara', '/gestao/equipe', '/gestao/pacientes', '/gestao/configuracoes'];
  for (const route of routes) {
    await open(page, route);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(16, 24, 21)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1441);
    if (route === '/inicio') {
      expect((await page.locator('.metric-card').first().boundingBox())!.height).toBeLessThan(190);
      await page.screenshot({ path: 'docs/qa/inicio-noturno-desktop.png', fullPage: true });
    }
    if (route.startsWith('/gestao/agenda')) {
      await page.screenshot({ path: 'docs/qa/agenda-noturna-desktop.png', fullPage: true });
      await page.getByRole('button', { name: 'Novo agendamento', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Novo agendamento', exact: true });
      expect(await dialog.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(23, 35, 29)');
      expect(await dialog.getByLabel('Data', { exact: true }).evaluate(el => getComputedStyle(el).color)).toBe('rgb(228, 237, 231)');
      await page.keyboard.press('Escape');
    }
    if (route.startsWith('/conversas')) await page.screenshot({ path: 'docs/qa/conversas-noturno-desktop.png', fullPage: true });
  }
  await page.getByRole('button', { name: 'Assistente IA', exact: true }).click();
  const assistant = page.getByRole('dialog', { name: 'Assistente da sua clínica', exact: true });
  await expect(assistant).toBeVisible();
  expect(await assistant.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(23, 35, 29)');
  await page.keyboard.press('Escape');
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await open(page, route);
      await expect(page.getByRole('button', { name: 'Ativar modo claro', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    }
  }
  await open(page, '/gestao/agenda?view=week&professional=pro-clara');
  await page.screenshot({ path: 'docs/qa/agenda-noturna-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
