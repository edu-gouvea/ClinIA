import { test, expect, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import type { Message } from '../../src/lib/types';

const seed = createDemoState('2026-11-09');
const conversation = seed.conversations.find(c => c.id === 'conversation-1')!;
conversation.status = 'humano'; conversation.assigneeId = seed.currentUserId;
const start = new Date('2026-11-07T07:00:00-03:00').getTime();
const history: Message[] = Array.from({ length: 120 }, (_, i) => ({
  id: `long-message-${i}`, sessionId: conversation.sessionId, at: new Date(start + i * 25 * 60000).toISOString(),
  author: i % 3 === 0 ? 'humano' : i % 3 === 1 ? 'ia' : 'paciente', authorId: i % 3 === 0 ? seed.currentUserId : undefined,
  text: `Mensagem fictícia ${i}. ` + (i === 40 ? 'textoSemEspaços'.repeat(70) : 'Informação administrativa para testar um histórico extenso.'), delivery: 'enviada',
}));
conversation.messages = [...history, ...conversation.messages];
seed.patients.find(p => p.id === conversation.patientId)!.notes = 'Observação administrativa fictícia.\n'.repeat(100);
const base = seed.conversations.find(c => c.status === 'encerrada')!;
for (let i = 0; i < 30; i++) seed.conversations.push({ ...base, id: `long-thread-${i}`, sessionId: `long-session-${i}`, messages: base.messages.map(m => ({ ...m, id: `${m.id}-${i}`, sessionId: `long-session-${i}` })) });

test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => {
    if (!sessionStorage.getItem('ergonomics-seeded')) {
      localStorage.setItem('clinia.demo.v1', JSON.stringify(data));
      sessionStorage.setItem('ergonomics-seeded', 'yes');
    }
  }, seed);
});
async function open(page: Page, path = '/conversas?id=conversation-1') {
  await page.goto(path); await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.app-loading')).toHaveCount(0);
}
async function expectFits(page: Page, width: number, height: number) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height + 1);
  const composer = (await page.locator('.conversation-composer').boundingBox())!;
  expect(composer.y).toBeGreaterThanOrEqual(0);
  expect(composer.y + composer.height).toBeLessThanOrEqual(height + 1);
}

const composerLabel = 'Mensagem para Ana Beatriz Santos';

test('painéis rolam independentemente e novas mensagens preservam leitura ou acompanham o envio', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  // Ana's conversation is with the current user, so it opens in "Em atendimento", selected in the list.
  await expect(page.getByRole('tab', { name: /^Em atendimento/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.conversation-list-item[aria-current="true"]')).toHaveAttribute('data-conversation-id', 'conversation-1');
  await expect(page.locator('.conversation-ownership')).toContainText('com você');
  // The 30 extra threads are closed: "Finalizadas" (with Ana still open) makes the list overflow.
  await open(page, '/conversas?view=finalizadas&id=conversation-1');
  await expectFits(page, 1440, 900);
  const log = page.getByRole('log');
  // The patient data now lives in the "Paciente" tab of the contextual panel.
  const patient = page.getByRole('tabpanel', { name: 'Paciente' });
  const list = page.getByRole('region', { name: 'Conversas disponíveis' });
  for (const panel of [log, patient, list]) expect(await panel.evaluate(el => el.scrollHeight > el.clientHeight)).toBeTruthy();
  const messagePosition = await log.evaluate(el => el.scrollTop);
  await patient.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await log.evaluate(el => el.scrollTop)).toBeCloseTo(messagePosition, 0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await log.evaluate(el => { el.scrollTop = 0; });
  const latest = page.getByRole('button', { name: 'Últimas mensagens', exact: true });
  await expect(latest).toBeVisible();
  // "Simular mensagem recebida" moved from the composer footer to the ⋯ menu.
  await page.getByRole('button', { name: 'Mais ações', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Simular mensagem recebida', exact: true }).click();
  const simulator = page.getByRole('dialog', { name: 'Simular mensagem recebida' });
  await simulator.getByLabel('Mensagem do paciente').fill('Nova informação fictícia enquanto o histórico é lido.');
  await simulator.getByRole('button', { name: 'Receber mensagem', exact: true }).click();
  await expect(simulator).toHaveCount(0);
  await expect(log).toContainText('Nova informação fictícia enquanto o histórico é lido.');
  expect(await log.evaluate(el => el.scrollTop)).toBe(0);
  await latest.click();
  await expect.poll(() => log.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);
  await expect(latest).toHaveCount(0);
  const input = page.getByLabel(composerLabel);
  await input.fill('Resposta fictícia'); await input.press('Shift+Enter'); await input.pressSequentially('com duas linhas.'); await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(log).toContainText('com duas linhas.');
  await expect.poll(() => log.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);
  await expectFits(page, 1440, 900);
  await page.getByRole('button', { name: 'Tema escuro', exact: true }).click();
  await page.screenshot({ path: 'docs/qa/conversas-ergonomia-noturna.png' });
});

test('viewport reduzido mantém composição acessível e painel; abas e voltar preservam contexto', async ({ page }) => {
  for (const [width, height] of [[1280, 720], [1024, 768], [768, 844], [390, 844], [390, 500], [640, 480]]) {
    await page.setViewportSize({ width, height }); await open(page);
    await expectFits(page, width, height);
    await expect(page.getByLabel(composerLabel)).toBeVisible();
    const toggle = page.getByRole('button', { name: 'Painel do paciente e assistente', exact: true });
    if (width >= 1280) {
      // ≥1280: the panel is a third column, open by default.
      const panel = page.getByRole('complementary', { name: 'Paciente e assistente' });
      await expect(panel).toBeVisible();
      const chat = (await page.locator('.conversation-detail').boundingBox())!;
      expect((await panel.boundingBox())!.x).toBeGreaterThanOrEqual(chat.x + chat.width - 1);
    } else {
      // Below 1280 it is closed by default and opens as a drawer (right) or full screen (<768).
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
      const drawer = page.getByRole('dialog', { name: 'Paciente e assistente', exact: true });
      await expect(drawer.getByRole('link', { name: 'Ver cadastro', exact: true })).toBeVisible();
      const box = (await drawer.boundingBox())!;
      expect(box.x + box.width).toBeCloseTo(width, 0);
      if (width < 768) expect(box.width).toBeCloseTo(width, 0);
      await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0); await expect(toggle).toBeFocused();
    }
    if (width === 390 && height === 844) await page.screenshot({ path: 'docs/qa/conversas-ergonomia-mobile.png' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/conversas?status=aguardando');
  const pending = page.getByRole('tab', { name: /^Pendentes/ });
  await expect(pending).toHaveAttribute('aria-selected', 'true');
  expect((await page.getByRole('tablist', { name: 'Situação das conversas' }).boundingBox())!.width).toBeLessThanOrEqual(390);
  await expect(page.locator('.conversation-list-item')).toHaveCount(seed.conversations.filter(c => c.status === 'aguardando').length);
  await page.locator('.conversation-list-item').first().click();
  await expect(page.locator('.conversation-detail')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar para lista de conversas', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^Pendentes/ })).toHaveAttribute('aria-selected', 'true');
  await expectFitsWithoutComposer(page, 390, 844);
});

async function expectFitsWithoutComposer(page: Page, width: number, height: number) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height + 1);
}
