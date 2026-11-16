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

test('painel contextual: coluna à direita ≥1280, gaveta à direita em tablet e tela cheia no celular', async ({ page }) => {
  for (const width of [1440, 1280, 1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await open(page, '/conversas?id=conversation-1');
    const chat = page.getByRole('region', { name: 'Conversa com Ana Beatriz Santos' });
    const toggle = page.getByRole('button', { name: 'Painel do paciente e assistente', exact: true });
    const chatBox = (await chat.boundingBox())!;
    expect(chatBox.width).toBeLessThan(width >= 1280 ? 760 : 700);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    if (width >= 1280) {
      const panel = page.getByRole('complementary', { name: 'Paciente e assistente' });
      await expect(panel).toBeVisible();
      const panelBox = (await panel.boundingBox())!;
      expect(panelBox.x).toBeGreaterThanOrEqual(chatBox.x + chatBox.width - 1);
      expect(panelBox.y).toBeCloseTo(chatBox.y, 0);
      if (width === 1280) await page.screenshot({ path: 'docs/qa/conversa-paciente-direita.png', fullPage: true });
      await page.getByRole('button', { name: 'Fechar painel', exact: true }).click();
      await expect(panel).toHaveCount(0);
      await expect(toggle).toBeFocused();
      await toggle.click();
      await expect(panel).toBeVisible();
    } else {
      await toggle.click();
      const drawer = page.getByRole('dialog', { name: 'Paciente e assistente', exact: true });
      // Measured after the 200 ms slide-in finishes.
      await expect.poll(async () => { const box = (await drawer.boundingBox())!; return Math.round(box.x + box.width); }).toBe(width);
      expect((await drawer.boundingBox())!.width).toBeLessThanOrEqual(361);
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
      await expect(toggle).toBeFocused();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole('button', { name: 'Painel do paciente e assistente', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Paciente e assistente', exact: true });
  await expect(drawer).toBeVisible();
  const drawerBox = (await drawer.boundingBox())!;
  expect(drawerBox.x).toBeCloseTo(0, 0);
  expect(drawerBox.width).toBeCloseTo(390, 0);
  await expect(drawer.getByRole('link', { name: 'Ver cadastro', exact: true })).toBeVisible();
  await drawer.getByRole('tab', { name: 'Assistente' }).click();
  await expect(drawer.getByLabel('Pergunte sobre esta conversa')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('tema acompanha o sistema inicialmente, permite teclado e preserva preferência e dados', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, '/inicio');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const original = await page.evaluate(() => localStorage.getItem('clinia.demo.v1'));
  // One stable name ("Tema escuro"); aria-pressed carries the state.
  const toggle = page.getByRole('button', { name: 'Tema escuro', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // Wait for hydration before interacting; a click on server HTML has no handler yet.
  await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // Management areas now live in the sidebar; the routes are unchanged.
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Visão gerencial', exact: true }).click();
  await expect(page).toHaveURL(/\/gestao\/visao-gerencial$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
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
    expect(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(16, 16, 18)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1441);
    if (route === '/inicio') {
      expect((await page.locator('.metric-card').first().boundingBox())!.height).toBeLessThan(190);
      await page.screenshot({ path: 'docs/qa/inicio-noturno-desktop.png', fullPage: true });
    }
    if (route.startsWith('/gestao/agenda')) {
      await page.screenshot({ path: 'docs/qa/agenda-noturna-desktop.png', fullPage: true });
      await page.getByRole('button', { name: 'Novo agendamento', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Novo agendamento', exact: true });
      expect(await dialog.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(26, 26, 30)');
      // The separate date field became the month calendar; the patient select carries the field ink.
      expect(await dialog.getByLabel('Paciente', { exact: true }).evaluate(el => getComputedStyle(el).color)).toBe('rgb(244, 244, 245)');
      await page.keyboard.press('Escape');
    }
    if (route.startsWith('/conversas')) await page.screenshot({ path: 'docs/qa/conversas-noturno-desktop.png', fullPage: true });
  }
  await page.getByRole('button', { name: 'Assistente IA', exact: true }).click();
  const assistant = page.getByRole('dialog', { name: 'Assistente da sua clínica', exact: true });
  await expect(assistant).toBeVisible();
  expect(await assistant.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(26, 26, 30)');
  await page.keyboard.press('Escape');
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await open(page, route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      // Below 768 px the sidebar (and the theme switch) lives in the menu drawer.
      const menu = page.getByRole('button', { name: 'Abrir menu', exact: true });
      if (width < 768) await menu.click();
      await expect(page.getByRole('button', { name: 'Tema escuro', exact: true })).toHaveAttribute('aria-pressed', 'true');
      if (width < 768) { await page.keyboard.press('Escape'); await expect(menu).toBeFocused(); }
    }
  }
  await open(page, '/gestao/agenda?view=week&professional=pro-clara');
  await page.screenshot({ path: 'docs/qa/agenda-noturna-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('barra lateral fixa em todas as páginas: sem rolagem própria e parada ao rolar o conteúdo', async ({ page }) => {
  const routes = ['/inicio', '/conversas?id=conversation-1', '/gestao/visao-gerencial', '/gestao/agenda', '/gestao/equipe', '/gestao/pacientes', '/gestao/configuracoes'];
  for (const [width, height] of [[1440, 900], [1280, 600], [1024, 600], [768, 500]]) {
    await page.setViewportSize({ width, height });
    for (const route of routes) {
      await open(page, route);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const rail = await page.getByRole('navigation', { name: 'Navegação principal' }).evaluate(nav => ({
        // Rounded: scrolling to a fractional bottom can leave a sub-pixel offset.
        top: Math.round(Math.abs(nav.getBoundingClientRect().top)), overflow: getComputedStyle(nav).overflowY, hidden: nav.scrollHeight - nav.clientHeight,
      }));
      expect(rail, `${route} ${width}×${height}`).toEqual({ top: 0, overflow: 'hidden', hidden: 0 });
      await expect(page.getByRole('button', { name: 'Abrir perfil de Marina Costa', exact: true })).toBeInViewport();
    }
  }
});
