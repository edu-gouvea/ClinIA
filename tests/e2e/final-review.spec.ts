import { expect, test } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';

test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => {
    if (!sessionStorage.getItem('review-seeded')) { localStorage.setItem('clinia.demo.v1', JSON.stringify(data)); sessionStorage.setItem('review-seeded', 'yes'); }
  }, createDemoState('2026-11-09'));
});

for (const [width, height] of [[1920, 1080], [1280, 720], [720, 500], [320, 568]]) {
  test(`revisão transversal de reflow, nomes acessíveis e console em ${width} × ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = []; const overflows: string[] = []; const unnamed: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const routes = ['/inicio', '/conversas?id=conversation-1', '/gestao/visao-gerencial', '/gestao/agenda', '/gestao/agenda?professional=pro-clara', '/gestao/equipe', '/gestao/equipe?view=table', '/gestao/equipe?id=pro-clara', '/gestao/pacientes', '/gestao/pacientes?id=patient-1', '/gestao/configuracoes'];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false');
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      if (scrollWidth > width + 1) overflows.push(`${route}: ${scrollWidth}px`);
      for (const role of ['button', 'combobox', 'textbox', 'searchbox'] as const) {
        const count = await page.getByRole(role, { name: '', exact: true }).count();
        if (count) unnamed.push(`${route}: ${count} ${role}`);
      }
      if (width === 320 && route === '/inicio') await page.screenshot({ path: 'docs/qa/revisao-inicio-320.png', fullPage: true });
      if (width === 320 && route.startsWith('/conversas')) await page.screenshot({ path: 'docs/qa/revisao-conversas-320.png' });
    }
    expect(overflows).toEqual([]); expect(unnamed).toEqual([]); expect(errors).toEqual([]);
  });
}

test('modal isola o fundo, mantém o ciclo de teclado e restaura foco e rolagem', async ({ page }) => {
  await page.goto('/inicio');
  const trigger = page.getByRole('button', { name: 'Novo agendamento', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Novo agendamento', exact: true });
  const close = dialog.getByRole('button', { name: 'Fechar', exact: true });
  await expect(close).toBeFocused();
  expect(await page.locator('main').evaluate(element => !!element.closest('[inert]'))).toBeTruthy();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Criar agendamento', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.locator('main').evaluate(element => !!element.closest('[inert]'))).toBeFalsy();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[inert]'))).toBeNull();
});

test('ação de assumir conversa fica inteira em tela estreita e baixa', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/conversas?id=conversation-1');
  const claim = page.getByRole('button', { name: 'Assumir conversa', exact: true });
  await expect(claim).toBeVisible();
  const action = (await claim.boundingBox())!;
  const context = (await page.locator('.conversation-context').boundingBox())!;
  expect(action.y + action.height).toBeLessThanOrEqual(context.y + context.height + 1);
  await claim.click();
  await expect(page.locator('.conversation-ownership')).toContainText('Responsável: Marina Costa (você)');
  await expect(page.getByLabel('Mensagem para o paciente')).toBeEnabled();
});

test('falha de armazenamento é anunciada sem impedir navegação e busca vazia', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = function(key) { if (key === 'clinia.demo.v1') throw new Error('Falha fictícia de leitura'); return null; };
  });
  await page.goto('/gestao/pacientes');
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível carregar os dados salvos' })).toBeVisible();
  await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('searchbox', { name: 'Buscar paciente por nome ou telefone' }).fill('Busca fictícia sem correspondência');
  await expect(page.getByRole('heading', { name: 'Nenhum paciente encontrado' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page.locator('.data-table')).toBeVisible();
  await page.getByRole('navigation', { name: 'Áreas de gestão' }).getByRole('link', { name: 'Equipe', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Profissionais de saúde', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Atendentes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Atendentes', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('atalho ao conteúdo e abas de configuração funcionam por teclado', async ({ page }) => {
  await page.goto('/gestao/configuracoes');
  await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  const tabs = page.getByRole('tablist', { name: 'Áreas de configuração' });
  await tabs.getByRole('tab', { name: 'Clínica e horários' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Disponibilidade', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByRole('tab', { name: 'Disponibilidade', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: 'Base de conhecimento', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-knowledge');
  await page.keyboard.press('Home');
  await expect(tabs.getByRole('tab', { name: 'Clínica e horários' })).toBeFocused();
});
