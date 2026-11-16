import { expect, test, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import { suggestSlots } from '../../src/lib/conversation-assistant';

const seed = createDemoState('2026-11-09');
test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => {
    if (!sessionStorage.getItem('conversas-seeded')) {
      localStorage.setItem('clinia.demo.v1', JSON.stringify(data));
      sessionStorage.setItem('conversas-seeded', 'yes');
    }
  }, seed);
});
async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false');
}
const count = (status: string) => seed.conversations.filter(c => c.status === status).length;

test('(a) abas com contagens certas e sempre dentro da coluna em 1440, 1024 e 390', async ({ page }) => {
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await open(page, '/conversas');
    const tablist = page.getByRole('tablist', { name: 'Situação das conversas' });
    await expect(tablist.getByRole('tab', { name: `Pendentes, ${count('aguardando')}`, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(tablist.getByRole('tab', { name: `Em atendimento, ${count('humano') + count('ia')}`, exact: true })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: `Finalizadas, ${count('encerrada')}`, exact: true })).toBeVisible();
    const column = (await page.getByRole('complementary', { name: 'Lista de conversas' }).boundingBox())!;
    const tabs = (await tablist.boundingBox())!;
    expect(tabs.x).toBeGreaterThanOrEqual(column.x);
    expect(tabs.x + tabs.width).toBeLessThanOrEqual(column.x + column.width + 0.5);
    for (const tab of await tablist.getByRole('tab').all()) {
      const box = (await tab.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(column.x + column.width + 0.5);
      expect(await tab.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(901);
  }
});

test('(b) links antigos abrem a aba e o filtro equivalentes', async ({ page }) => {
  await open(page, '/conversas?status=aguardando');
  await expect(page.getByRole('tab', { name: /^Pendentes/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.conversation-list-item')).toHaveCount(count('aguardando'));

  await open(page, '/conversas?reason=remarcacao');
  await expect(page.getByRole('tab', { name: /^Pendentes/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.conversation-list-item')).toHaveCount(1);
  const applied = page.getByRole('button', { name: 'Remover filtro Remarcação', exact: true });
  await expect(applied).toBeVisible();
  await applied.click();
  await expect(page).not.toHaveURL(/reason=/);
  await expect(page.locator('.conversation-list-item')).toHaveCount(count('aguardando'));

  await open(page, '/conversas?assignee=me');
  await expect(page.getByRole('tab', { name: /^Em atendimento/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /^Comigo/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.conversation-list-item')).toHaveCount(seed.conversations.filter(c => c.assigneeId === seed.currentUserId).length);

  // Tabs and filter panel write to the URL; browser back restores the previous tab.
  await page.getByRole('tab', { name: /^Finalizadas/ }).click();
  await expect(page).toHaveURL(/view=finalizadas/);
  await page.goBack();
  await expect(page.getByRole('tab', { name: /^Em atendimento/ })).toHaveAttribute('aria-selected', 'true');
  const toggle = page.getByRole('button', { name: 'Filtros: motivo e responsável', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Responsável pela conversa').selectOption('user-rafael');
  await expect(page).toHaveURL(/assignee=user-rafael/);
  await expect(page.locator('.conversation-list-item')).toHaveCount(1);
});

test('(c) assumir a Ana leva a conversa para Em atendimento, atualiza contadores e troca o compositor', async ({ page }) => {
  await open(page, '/conversas?id=conversation-1');
  const sidebar = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(sidebar.getByRole('link', { name: `Conversas, ${count('aguardando')} conversas aguardando atendente` })).toBeVisible();
  await expect(page.getByLabel('Mensagem para Ana Beatriz Santos')).toHaveCount(0);
  await expect(page.getByText('Esta conversa aguarda um atendente', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Assumir conversa', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^Em atendimento/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: `Pendentes, ${count('aguardando') - 1}`, exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: `Conversas, ${count('aguardando') - 1} conversa aguardando atendente` })).toBeVisible();
  const composer = page.getByLabel('Mensagem para Ana Beatriz Santos');
  await expect(composer).toBeFocused();
  await expect(composer).toHaveAttribute('placeholder', 'Escreva para Ana…');
  await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeDisabled();
  await expect(page.locator('.conversation-ownership')).toContainText('com você');
  await expect(page.locator('.conversation-list-item[aria-current="true"]')).toHaveAttribute('data-conversation-id', 'conversation-1');
});

test('(d) assistente começa vazio; horários sem conflito; horário escolhido muda o rascunho; inserir não envia', async ({ page }) => {
  await open(page, '/conversas?id=conversation-1');
  const panel = page.getByRole('complementary', { name: 'Paciente e assistente' });
  await panel.getByRole('tab', { name: 'Assistente' }).click();
  const input = panel.getByLabel('Pergunte sobre esta conversa');
  await expect(input).toBeFocused();
  await expect(panel.getByRole('heading', { name: 'Pergunte sobre esta conversa' })).toBeVisible();
  await expect(panel.locator('.ca-exchange')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Horários livres', exact: true }).click();
  const expected = suggestSlots(seed, seed.appointments.find(a => a.id === 'appt-ana')!);
  const slots = panel.getByRole('group', { name: 'Horários sugeridos' }).getByRole('button');
  await expect(slots).toHaveText(expected.map(slot => `${slot.label}${slot.duration} min`));
  await expect(slots.first()).toHaveAttribute('aria-pressed', 'true');
  const draft = panel.locator('.ca-draft > p');
  await expect(draft).toContainText(`às ${expected[0].start}`);
  await slots.nth(1).click();
  await expect(slots.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(draft).toContainText(`às ${expected[1].start}`);
  await expect(panel.getByRole('link', { name: 'Abrir remarcação na agenda' })).toHaveAttribute('href', /edit=appt-ana&context=conversation-1/);
  const insert = panel.getByRole('button', { name: 'Inserir na resposta', exact: true });
  await expect(insert).toBeDisabled();
  await expect(panel.getByText('Assuma a conversa para inserir o rascunho na resposta.', { exact: true })).toBeVisible();
  await expect(panel.locator('.chip-static')).toHaveText(['Conversa', 'Agenda']);
  await page.getByRole('button', { name: 'Assumir conversa', exact: true }).click();
  await expect(insert).toBeEnabled();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('clinia.demo.v1')!).conversations[0].messages.length);
  const text = await draft.innerText();
  await insert.click();
  const composer = page.getByLabel('Mensagem para Ana Beatriz Santos');
  await expect(composer).toHaveValue(text);
  await expect(composer).toBeFocused();
  await insert.click();
  await expect(composer).toHaveValue(`${text}\n\n${text}`);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('clinia.demo.v1')!).conversations[0].messages.length)).toBe(before);
  await expect(page.getByRole('log')).not.toContainText('Posso confirmar esse horário para você?');
  await panel.getByRole('button', { name: 'Nova consulta', exact: true }).click();
  await expect(panel.locator('.ca-exchange')).toHaveCount(0);
  await input.fill('Qual a previsão do tempo?');
  await panel.getByRole('button', { name: 'Perguntar', exact: true }).click();
  await expect(panel.locator('.ca-exchange')).toContainText('respondo sobre horários livres, próximas consultas, resumo da conversa e sugestão de resposta');
});

test('(e) menu ⋯ funciona por teclado e fecha com Esc', async ({ page }) => {
  await open(page, '/conversas?id=conversation-1');
  const trigger = page.getByRole('button', { name: 'Mais ações', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Mais ações' });
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('menuitem', { name: 'Devolver à IA' })).toBeDisabled();
  await expect(menu.getByRole('menuitem', { name: 'Ver cadastro do paciente' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Simular mensagem recebida' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Ver cadastro do paciente' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Simular mensagem recebida' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/gestao\/pacientes\?id=patient-1&context=conversation-1/);
});

test('(f) painel vira gaveta em 1024 e tela cheia em 390, com foco preso e devolvido', async ({ page }) => {
  for (const [width, full] of [[1024, false], [390, true]] as const) {
    await page.setViewportSize({ width, height: 800 });
    await open(page, '/conversas?id=conversation-1');
    const toggle = page.getByRole('button', { name: 'Painel do paciente e assistente', exact: true });
    await toggle.click();
    const dialog = page.getByRole('dialog', { name: 'Paciente e assistente', exact: true });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBeTruthy();
    expect(await page.locator('main').evaluate(el => !!el.closest('[inert]'))).toBeTruthy();
    const box = (await dialog.boundingBox())!;
    if (full) expect(box.width).toBeCloseTo(width, 0); else expect(box.width).toBeCloseTo(360, 0);
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBeTruthy(); }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(toggle).toBeFocused();
  }
});

test('(g) dois temas: bolhas, badges e botão da IA usam os tokens', async ({ page }) => {
  await open(page, '/conversas?id=conversation-2');
  for (const [theme, aiBg] of [['light', 'rgb(243, 240, 253)'], ['dark', 'rgb(34, 28, 56)']] as const) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Tema escuro', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.locator('.conversation-message[data-author="ia"] .conversation-bubble').first().evaluate(el => getComputedStyle(el).backgroundColor)).toBe(aiBg);
    await expect(page.locator('.conversation-ownership .badge')).toHaveAttribute('data-tone', 'ai');
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(1001);
    await page.screenshot({ path: `docs/qa/conversas-redesenho-${theme}.png` });
  }
});
