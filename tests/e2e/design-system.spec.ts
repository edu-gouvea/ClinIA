import { test, expect, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';

const seed = createDemoState('2026-11-09');
test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(state => {
    if (!sessionStorage.getItem('design-seeded')) {
      localStorage.setItem('clinia.demo.v1', JSON.stringify(state));
      sessionStorage.setItem('design-seeded', 'yes');
    }
  }, seed);
});
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.app-loading')).toHaveCount(0);
}

test('paletas clara e noturna mantêm contraste de texto, campos e foco', async ({ page }) => {
  await open(page, '/gestao/pacientes');
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Tema escuro', exact: true }).click();
    const failures = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const color = (name: string) => style.getPropertyValue(name).trim();
      const luminance = (hex: string) => {
        const values = hex.replace('#', '').match(/../g)!.map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
        return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
      };
      const problems: string[] = [];
      const check = (foreground: string, background: string, minimum: number) => {
        const [a, b] = [luminance(color(foreground)), luminance(color(background))].sort((a, b) => b - a);
        const ratio = (a + .05) / (b + .05);
        if (ratio < minimum) problems.push(`${foreground}/${background}: ${ratio.toFixed(3)} < ${minimum}`);
      };
      for (const background of ['--bg', '--canvas', '--surface', '--surface-subtle', '--surface-muted', '--surface-hover', '--surface-active', '--surface-selected', '--mint']) {
        for (const foreground of ['--ink', '--muted', '--subtle']) check(foreground, background, 4.5);
        check('--focus-ring', background, 3);
        check('--control-border', background, 3);
      }
      for (const [foreground, background] of [['--success-ink', '--success-bg'], ['--warning-ink', '--warning-bg'], ['--danger-ink', '--danger-bg'], ['--info-ink', '--info-bg'], ['--ai-ink', '--ai-bg'], ['--ai-ink', '--surface'], ['--surface', '--ai'], ['--green-ink', '--mint'], ['--ink', '--mint'], ['--muted', '--surface-hover'], ['--ink', '--ai-bg'], ['--canvas', '--ink'], ['--info-ink', '--surface'], ['--selection-ink', '--selection-bg'], ['--on-green', '--green'], ['--on-green', '--green-deep'], ['--on-green', '--green-active']]) check(foreground, background, 4.5);
      return problems;
    });
    expect(failures, theme).toEqual([]);
    const search = page.getByRole('searchbox', { name: 'Buscar paciente', exact: true });
    await search.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    await expect(search).toBeFocused();
    expect(await search.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
    expect(await search.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
  }
});

test('densidades se aplicam em uso real; busca, seleção, modais e estado indisponível permanecem utilizáveis', async ({ page }) => {
  await open(page, '/gestao/pacientes');
  const search = page.getByRole('searchbox', { name: 'Buscar paciente', exact: true });
  // The insurance select moved into a popover; its trigger sits in the same 32 px bar.
  const filter = page.getByRole('button', { name: 'Convênio', exact: true });
  // Control heights by density: compact 28 · standard 32 · comfortable 40.
  expect((await search.boundingBox())!.height).toBe(32);
  expect((await filter.boundingBox())!.height).toBe(32);
  expect(await page.locator('.data-table td').first().evaluate(el => getComputedStyle(el).paddingTop)).toBe('8px');
  await search.fill('Nenhum cadastro com este nome');
  await expect(page.getByRole('heading', { name: 'Nenhum paciente encontrado' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page.locator('.data-table')).toBeVisible();
  const create = page.getByRole('button', { name: 'Cadastrar paciente', exact: true });
  await create.click();
  const dialog = page.getByRole('dialog', { name: 'Cadastrar paciente', exact: true });
  await expect(dialog).toHaveAttribute('data-density', 'comfortable');
  expect((await dialog.getByLabel('Nome completo', { exact: true }).boundingBox())!.height).toBe(40);
  // Optional fields start hidden behind "+ Convênio"; revealed, they keep the 40 px height.
  await dialog.getByRole('button', { name: 'Convênio', exact: true }).click();
  expect((await dialog.getByLabel('Convênio', { exact: true }).boundingBox())!.height).toBe(40);
  // Header, body and footer carry their own padding now (24 px inline).
  expect(await dialog.locator('.modal-heading').evaluate(el => getComputedStyle(el).paddingLeft)).toBe('24px');
  await dialog.getByLabel('Nome completo', { exact: true }).fill('Pessoa Fictícia');
  await dialog.getByLabel('Telefone', { exact: true }).fill(seed.patients[0].phone);
  const save = dialog.getByRole('button', { name: 'Cadastrar paciente', exact: true });
  await expect(save).toBeDisabled();
  expect(await save.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  await page.screenshot({ path: 'docs/qa/design-system-formulario.png' });
  await page.keyboard.press('Escape');
  await expect(create).toBeFocused();
  await open(page, '/gestao/agenda?view=week&professional=pro-clara');
  await expect(page.locator('.agenda-page')).toHaveAttribute('data-density', 'compact');
  // The control bar uses 32 px controls; the professional select became the picker button.
  expect((await page.getByRole('button', { name: /^Profissional:/ }).boundingBox())!.height).toBe(32);
  expect((await page.getByRole('button', { name: 'Hoje', exact: true }).boundingBox())!.height).toBe(32);
  await expect(page.locator('.calendar-day-column')).toHaveCount(7);
  await page.getByRole('button', { name: 'Voltar para todos os profissionais', exact: true }).click();
  await expect(page.locator('.calendar-canvas')).toHaveAttribute('data-mode', 'professionals');
});
