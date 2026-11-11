import { test, expect, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import { getFreeSlots, getMetrics, getPeriod } from '../../src/lib/metrics';
import { minutes } from '../../src/lib/date';
import type { DemoState } from '../../src/lib/types';

const seed = createDemoState('2026-11-09');
const key = 'clinia.demo.v1';
async function snapshot(page: Page): Promise<DemoState> {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key);
}
async function ready(page: Page, url: string) {
  const response = await page.goto(url);
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('.app-loading')).toHaveCount(0);
  await expect(page.locator('h1')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ data, storageKey }) => {
    if (!sessionStorage.getItem('clinia.test.seeded')) {
      localStorage.setItem(storageKey, JSON.stringify(data));
      sessionStorage.setItem('clinia.test.seeded', '1');
    }
  }, { data: seed, storageKey: key });
});

test('assumir conversa → consultar paciente → remarcar → conferir agenda, indicadores e persistência', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page, '/conversas?id=conversation-1');
  await expect(page.getByLabel('Mensagem para o paciente')).toBeDisabled();
  await page.getByRole('button', { name: 'Assumir conversa', exact: true }).click();
  await expect(page.getByLabel('Mensagem para o paciente')).toBeEnabled();
  await page.getByLabel('Mensagem para o paciente').fill('Olá, Ana! Vou ajudar com a remarcação.');
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Olá, Ana! Vou ajudar com a remarcação.');
  await page.getByRole('link', { name: 'Ver cadastro', exact: true }).click();
  await expect(page).toHaveURL(/gestao\/pacientes\?id=patient-1&context=conversation-1/);
  await expect(page.getByRole('heading', { name: 'Ana Beatriz Santos', level: 1 })).toBeVisible();
  await page.locator('a[href*="edit=appt-ana"]').click();
  const dialog = page.getByRole('dialog', { name: 'Remarcar consulta', exact: true });
  await expect(dialog).toBeVisible();
  const targetDate = '2026-11-10';
  const targetStart = getFreeSlots(seed, 'pro-clara', targetDate).find(slot => !seed.appointments.some(a => a.patientId === 'patient-1' && a.date === targetDate && a.status !== 'cancelada' && minutes(slot) < minutes(a.start) + a.duration && minutes(slot) + 30 > minutes(a.start)))!;
  expect(targetStart).toBeTruthy();
  await dialog.getByLabel('Data', { exact: true }).fill(targetDate);
  await dialog.getByLabel('Horário de início', { exact: true }).fill(targetStart);
  await dialog.getByRole('button', { name: 'Salvar remarcação' }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await snapshot(page);
  const appointment = saved.appointments.find(a => a.id === 'appt-ana')!;
  expect(appointment.date).toBe(targetDate);
  expect(appointment.start).toBe(targetStart);
  expect(appointment.events.at(-1)?.type).toBe('appointment.reschedule');
  expect(appointment.events.at(-1)?.previousStart).toContain('2026-11-09');
  expect(saved.conversations.find(c => c.id === 'conversation-1')?.assigneeId).toBe('user-marina');
  await ready(page, `/gestao/agenda?date=${targetDate}&patient=patient-1`);
  const row = page.locator('[data-appointment-id="appt-ana"]');
  await expect(row).toContainText('Ana Beatriz Santos');
  await ready(page, '/inicio?period=7');
  const expected = getMetrics(saved, getPeriod(saved.referenceDate, 7));
  const before = getMetrics(seed, getPeriod(seed.referenceDate, 7));
  expect(expected.planned).toBe(before.planned - 1);
  await expect(page.locator('.metric-card').filter({ hasText: 'Consultas previstas' }).locator('.metric-value')).toHaveText(String(expected.planned));
  await page.reload();
  await expect(page.locator('.metric-card').filter({ hasText: 'Consultas previstas' }).locator('.metric-value')).toHaveText(String(expected.planned));
  expect((await snapshot(page)).appointments.find(a => a.id === 'appt-ana')?.date).toBe(targetDate);
  expect(errors).toEqual([]);
});

test('falha de mensagem, nova tentativa sem duplicação e sessões preservadas', async ({ page }) => {
  await ready(page, '/conversas?id=conversation-1');
  await page.getByRole('button', { name: 'Assumir conversa', exact: true }).click();
  await expect(page.getByLabel('Mensagem para o paciente')).toBeEnabled();
  await page.getByRole('button', { name: 'Simular mensagem recebida', exact: true }).click();
  const simulator = page.getByRole('dialog', { name: 'Simular mensagem recebida', exact: true });
  await simulator.getByRole('checkbox').check();
  await simulator.getByRole('button', { name: 'Receber mensagem', exact: true }).click();
  await expect(simulator).toHaveCount(0);
  const message = 'Mensagem E2E com falha e nova tentativa.';
  await page.getByLabel('Mensagem para o paciente').fill(message);
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Falha no envio');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('log')).not.toContainText('Falha no envio');
  await expect.poll(async () => (await snapshot(page)).conversations.find(c => c.id === 'conversation-1')?.messages.find(m => m.text === message)?.delivery).toBe('enviada');
  const conversation = (await snapshot(page)).conversations.find(c => c.id === 'conversation-1')!;
  expect(conversation.messages.filter(m => m.text === message)).toHaveLength(1);
  expect(conversation.messages.find(m => m.text === message)?.delivery).toBe('enviada');
  await page.getByRole('button', { name: 'Encerrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Encerrar atendimento', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Mensagem para o paciente')).toBeDisabled();
  await page.getByRole('button', { name: 'Simular mensagem recebida', exact: true }).click();
  await simulator.getByLabel('Mensagem do paciente').fill('Olá, preciso de uma nova informação administrativa.');
  await simulator.getByRole('button', { name: 'Receber mensagem', exact: true }).click();
  await expect(simulator).toHaveCount(0);
  const reopened = (await snapshot(page)).conversations.find(c => c.id === 'conversation-1')!;
  expect(reopened.sessionId).not.toBe(conversation.sessionId);
  expect(reopened.messages.some(m => m.text === message && m.sessionId === conversation.sessionId)).toBeTruthy();
  expect(reopened.status).toBe('ia');
});

test('rotas diretas, abas de gestão, filtros e voltar do navegador', async ({ page }) => {
  const routes = [
    ['/inicio', 'Bom dia, Marina'], ['/conversas', 'Conversas'],
    ['/gestao/visao-gerencial', 'Visão gerencial'],
    ['/gestao/agenda', 'Agenda'], ['/gestao/equipe', 'Equipe'],
    ['/gestao/pacientes', 'Pacientes'], ['/gestao/configuracoes', 'Configurações'],
  ];
  for (const [url, heading] of routes) {
    await ready(page, url);
    await expect(page.locator('h1')).toContainText(heading);
  }
  await page.getByRole('navigation', { name: 'Áreas de gestão' }).getByRole('link', { name: 'Pacientes', exact: true }).click();
  await expect(page).toHaveURL(/\/gestao\/pacientes$/);
  await page.getByLabel('Buscar paciente por nome ou telefone').fill('Ana Beatriz');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('link', { name: 'Ana Beatriz Santos', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Ana Beatriz Santos');
  await page.goBack();
  await expect(page.getByLabel('Buscar paciente por nome ou telefone')).toHaveValue('Ana Beatriz');
  await ready(page, '/inicio?period=7');
  await page.locator('.metric-card').filter({ hasText: 'Consultas previstas' }).click();
  await expect(page.getByLabel('Filtrar situação')).toHaveValue('previstas');
  await ready(page, '/conversas?reason=remarcacao');
  const count = seed.conversations.filter(c => c.status !== 'encerrada' && /remarc/i.test(c.reason || '')).length;
  await expect(page.locator('.conversation-list-item')).toHaveCount(count);
});

test('assistente responde às cinco intenções, preserva histórico e controla foco', async ({ page }) => {
  await ready(page, '/conversas?id=conversation-1');
  const trigger = page.getByRole('button', { name: 'Assistente IA', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Assistente da sua clínica', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fechar', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBeTruthy();
  const questions = ['O que ficou pendente hoje?', 'Quais pacientes têm consulta amanhã?', 'Quais profissionais têm horários livres nesta semana?', 'Resuma esta conversa.', 'Como foram os cancelamentos neste período?'];
  for (let index = 0; index < questions.length; index++) {
    await dialog.getByRole('button', { name: questions[index], exact: true }).click();
    await expect(dialog.locator('.assistant-exchange')).toHaveCount(index + 1);
  }
  await expect(dialog.locator('.assistant-answer')).toContainText(['Hoje há', 'amanhã', 'Opções de início', 'Conversa com Ana Beatriz Santos', 'foram canceladas']);
  await dialog.getByLabel('Remover contexto da página').click();
  await dialog.getByLabel('Pergunte sobre sua clínica').fill('Qual é a previsão do tempo?');
  await dialog.getByRole('button', { name: 'Enviar pergunta', exact: true }).click();
  await expect(dialog.locator('.assistant-exchange')).toHaveCount(6);
  await expect(dialog.locator('.assistant-answer').last()).toContainText('reconhece apenas cinco intenções');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Início', exact: true }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.locator('h1')).toContainText('Bom dia, Marina');
  await trigger.click();
  await expect(dialog.locator('.assistant-exchange')).toHaveCount(6);
  const history = (await snapshot(page)).assistantHistory;
  expect(history[0].context).toContain('Conversas');
  expect(history.at(-1)?.context).toBe('Sem contexto da página');
  await dialog.getByRole('link', { name: 'Abrir agenda de amanhã', exact: true }).click();
  await expect(page).toHaveURL(/gestao\/agenda\?date=2026-11-10/);
});

test('cadastro persiste, falha recuperável mantém formulário e restauração recompõe a base', async ({ page }) => {
  await ready(page, '/gestao/configuracoes');
  await page.getByText('Ferramentas da demonstração', { exact: true }).click();
  await page.getByRole('button', { name: 'Testar falha de salvamento' }).click();
  await page.getByRole('navigation', { name: 'Áreas de gestão' }).getByRole('link', { name: 'Pacientes', exact: true }).click();
  await page.getByRole('button', { name: 'Cadastrar paciente', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cadastrar paciente', exact: true });
  await dialog.getByLabel('Nome completo', { exact: true }).fill('Pessoa Fictícia E2E');
  await dialog.getByLabel('Telefone', { exact: true }).fill('(81) 99999-9999');
  await dialog.getByRole('button', { name: 'Salvar paciente' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Falha simulada');
  await expect(dialog.getByLabel('Nome completo', { exact: true })).toHaveValue('Pessoa Fictícia E2E');
  await dialog.getByRole('button', { name: 'Salvar paciente' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Pessoa Fictícia E2E', exact: true })).toBeVisible();
  await ready(page, '/gestao/configuracoes');
  await page.getByText('Ferramentas da demonstração', { exact: true }).click();
  await page.getByRole('button', { name: 'Restaurar demonstração', exact: true }).click();
  const reset = page.getByRole('dialog', { name: 'Restaurar demonstração?', exact: true });
  await reset.getByRole('button', { name: 'Restaurar demonstração', exact: true }).click();
  await expect(reset).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Demonstração restaurada');
  expect((await snapshot(page)).patients.some(p => p.name === 'Pessoa Fictícia E2E')).toBeFalsy();
});

for (const width of [390, 768]) {
  test(`layout ${width}px: rotas utilizáveis, sem transbordamento global e conversa móvel`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const overflows: unknown[] = [];
    for (const url of ['/inicio', '/gestao/visao-gerencial', '/gestao/agenda', '/gestao/agenda?view=week', '/gestao/equipe', '/gestao/equipe?id=pro-clara', '/gestao/pacientes', '/gestao/pacientes?id=patient-1', '/gestao/configuracoes', '/conversas', '/conversas?id=conversation-1']) {
      await ready(page, url);
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      if (dimensions.document > dimensions.viewport + 1) overflows.push({ url, dimensions, elements: await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'absolute').slice(0, 12).map(el => ({ tag: el.tagName, classes: el.className, right: el.getBoundingClientRect().right }))) });
    }
    if (width === 390) {
      await expect(page.getByRole('complementary', { name: 'Lista de conversas' })).not.toBeVisible();
      await page.getByRole('button', { name: 'Voltar para lista de conversas' }).click();
      await expect(page.getByRole('complementary', { name: 'Lista de conversas' })).toBeVisible();
    }
    await ready(page, '/inicio');
    await page.screenshot({ path: `docs/qa/inicio-${width}.png`, fullPage: true });
    expect(overflows).toEqual([]);
  });
}

test('captura desktop e console sem erros de renderização', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await ready(page, '/inicio');
  await page.screenshot({ path: 'docs/qa/inicio-desktop.png', fullPage: true });
  await ready(page, '/conversas?id=conversation-1');
  await page.screenshot({ path: 'docs/qa/conversas-desktop.png', fullPage: true });
  await ready(page, '/gestao/agenda');
  await page.screenshot({ path: 'docs/qa/agenda-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});
