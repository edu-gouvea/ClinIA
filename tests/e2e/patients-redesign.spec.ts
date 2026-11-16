import { test, expect, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import { filterPatients, patientAppointmentsSplit, sortPatients, viewCounts } from '../../src/lib/patient-presentation';
import type { DemoState } from '../../src/lib/types';

const seed = createDemoState('2026-11-09');
const key = 'clinia.demo.v1';
test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ data, storageKey }) => {
    if (!sessionStorage.getItem('patients-seeded')) {
      localStorage.setItem(storageKey, JSON.stringify(data));
      sessionStorage.setItem('patients-seeded', '1');
    }
  }, { data: seed, storageKey: key });
});
async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('.app-loading')).toHaveCount(0);
  await expect(page.locator('h1')).toBeVisible();
}
const snapshot = (page: Page) => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)!) as DemoState, key);
const row = (page: Page, name: string) => page.locator('tr', { has: page.getByRole('link', { name: `Abrir cadastro de ${name}`, exact: true }) });
const confirmPatient = filterPatients(seed, { view: 'pendencias' }).find(r => r.pendencies[0]?.kind === 'confirmar')!.patient;

test('(a) lista mostra as pendências: pedido de remarcação e consulta a confirmar', async ({ page }) => {
  await open(page, '/gestao/pacientes');
  await expect(page.locator('h1')).toHaveText('Pacientes');
  await expect(page.getByRole('navigation', { name: 'Trilha de navegação' })).toContainText('Gestão');
  await expect(page.getByText('Pessoas no centro. Informações sempre à mão.')).toHaveCount(0);
  const ana = row(page, 'Ana Beatriz Santos');
  await expect(ana.locator('.pendency-cell .badge').first()).toHaveText('Pediu remarcação');
  // Ana also has her next appointment to confirm: "+1" lists it in the title.
  await expect(ana.locator('.pendency-more')).toHaveAttribute('title', 'A confirmar');
  await expect(ana.locator('.next-cell')).toContainText('Hoje · 11:30');
  // Insurance is plain text, never a coloured badge.
  await expect(ana.locator('.insurance-cell .badge')).toHaveCount(0);
  await page.getByLabel('Buscar paciente', { exact: true }).fill(confirmPatient.name);
  await expect(row(page, confirmPatient.name).locator('.pendency-cell .badge').first()).toHaveText('A confirmar');
});

test('(b) visões "Com pendência" e "Sem próxima consulta" com contagens, aria-pressed e view na URL', async ({ page }) => {
  await open(page, '/gestao/pacientes');
  const counts = viewCounts(seed, {});
  const views = page.getByRole('group', { name: 'Visões' });
  const all = views.getByRole('button', { name: /^Todos/ });
  const pending = views.getByRole('button', { name: /^Com pendência/ });
  const noNext = views.getByRole('button', { name: /^Sem próxima consulta/ });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(all).toContainText(String(counts.todos));
  await expect(pending).toContainText(String(counts.pendencias));
  await expect(noNext).toContainText(String(counts['sem-proxima']));
  await pending.click();
  await expect(page).toHaveURL(/view=pendencias/);
  await expect(pending).toHaveAttribute('aria-pressed', 'true');
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.patient-row')).toHaveCount(Math.min(12, counts.pendencias));
  await noNext.click();
  await expect(page).toHaveURL(/view=sem-proxima/);
  await expect(page.locator('.patient-row')).toHaveCount(counts['sem-proxima']);
  await expect(page.locator('.patient-row .next-cell').first()).toContainText('Sem consulta marcada');
  await all.click();
  await expect(page).not.toHaveURL(/view=/);
  // Counts follow the search.
  await page.getByLabel('Buscar paciente', { exact: true }).fill('Ana Beatriz');
  await expect(pending).toContainText('1');
});

test('(c) busca, convênio, ordenação com aria-sort e paginação de 12', async ({ page }) => {
  await open(page, '/gestao/pacientes');
  const footer = page.locator('.patient-list-footer');
  await expect(footer).toContainText('1–12 de 24 pacientes');
  await page.getByRole('button', { name: 'Página 2', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(footer).toContainText('13–24 de 24 pacientes');
  await expect(page.getByRole('button', { name: 'Página 2', exact: true })).toHaveAttribute('aria-current', 'page');

  const trigger = page.getByRole('button', { name: 'Convênio', exact: true });
  await expect(trigger).toHaveCSS('border-top-style', 'dashed');
  await trigger.click();
  await page.getByLabel('Filtrar convênio').selectOption('Viva Saúde');
  await expect(page).toHaveURL(/insurance=Viva/);
  await expect(page).not.toHaveURL(/page=2/);
  const active = page.getByRole('button', { name: 'Convênio: Viva Saúde', exact: true });
  await expect(active).toHaveCSS('border-top-style', 'solid');
  const viva = filterPatients(seed, { insurance: 'Viva Saúde' });
  await expect(page.locator('.patient-row')).toHaveCount(viva.length);
  for (const cell of await page.locator('.insurance-cell').allTextContents()) expect(cell).toBe('Viva Saúde');

  const name = page.getByRole('columnheader', { name: 'Paciente' });
  await expect(page.getByRole('columnheader', { name: 'Próxima consulta' })).toHaveAttribute('aria-sort', 'ascending');
  await expect(name).toHaveAttribute('aria-sort', 'none');
  await name.getByRole('button').click();
  await expect(page).toHaveURL(/sort=nome&order=asc/);
  await expect(name).toHaveAttribute('aria-sort', 'ascending');
  const sorted = sortPatients(viva, 'nome', 'asc').map(r => r.patient.name);
  await expect(page.locator('.patient-name').first()).toHaveText(sorted[0]);
  await name.getByRole('button').click();
  await expect(page).toHaveURL(/order=desc/);
  await expect(name).toHaveAttribute('aria-sort', 'descending');
  await expect(page.locator('.patient-name').first()).toHaveText(sorted.at(-1)!);
  // The sort button reflects the criterion and its menu offers the three plus direction.
  await page.getByRole('button', { name: 'Ordenar por: Nome', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Última consulta' }).click();
  await expect(page).toHaveURL(/sort=ultima/);

  await page.getByLabel('Buscar paciente', { exact: true }).fill('Ana');
  await expect(page).toHaveURL(/q=Ana/);
  await page.getByRole('button', { name: 'Limpar filtro de convênio', exact: true }).click();
  await expect(page).not.toHaveURL(/insurance=/);
  await page.getByLabel('Buscar paciente', { exact: true }).fill('Ninguém com este nome');
  await expect(page.getByRole('heading', { name: 'Nenhum paciente encontrado' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page.locator('.patient-row')).toHaveCount(12);
});

test('(d) a linha inteira abre o cadastro; a trilha e o voltar do navegador restauram filtros e página', async ({ page }) => {
  await open(page, '/gestao/pacientes?sort=nome&order=asc&page=2');
  const target = sortPatients(filterPatients(seed, {}), 'nome', 'asc')[12].patient;
  // Click on the insurance cell, not on the name: the whole row is the link. The row
  // link's stretched overlay is what receives the click there, so actionability checks
  // (which see the overlay "intercepting") are skipped and a real click is dispatched.
  await row(page, target.name).locator('.insurance-cell').click({ force: true });
  await expect(page.locator('h1')).toHaveText(target.name);
  await expect(page).toHaveURL(new RegExp(`id=${target.id}.*listPage=2`));
  await expect(page.getByRole('navigation', { name: 'Trilha de navegação' }).getByRole('link', { name: 'Pacientes' })).toHaveAttribute('href', /sort=nome.*page=2/);
  await page.goBack();
  await expect(page).toHaveURL(/sort=nome&order=asc&page=2/);
  await expect(page.locator('.patient-list-footer')).toContainText('13–24 de 24');
  // Keyboard: the row link is focusable and shows the focus ring on the row.
  const link = page.getByRole('link', { name: `Abrir cadastro de ${target.name}`, exact: true });
  await link.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  await expect(row(page, target.name)).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.locator('h1')).toHaveText(target.name);
  await page.getByRole('navigation', { name: 'Trilha de navegação' }).getByRole('link', { name: 'Pacientes' }).click();
  await expect(page).toHaveURL(/sort=nome&order=asc&page=2/);
});

test('(e) cadastro: coluna fixa ao rolar, aviso com Remarcar e Confirmar, Voltar à conversa', async ({ page }) => {
  await open(page, '/gestao/pacientes?id=patient-1&context=conversation-1');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ana Beatriz Santos');
  await expect(page.getByRole('link', { name: 'Voltar à conversa', exact: true })).toHaveAttribute('href', '/conversas?id=conversation-1');
  const aside = page.getByRole('complementary', { name: 'Dados do paciente' });
  await page.evaluate(() => window.scrollTo(0, 1600));
  await expect.poll(async () => Math.round((await aside.boundingBox())!.y)).toBe(24);
  await page.evaluate(() => window.scrollTo(0, 0));
  const alert = page.locator('[data-pendency="remarcacao"]');
  await expect(alert).toContainText('Pediu remarcação da consulta de hoje, 11:30, com Dra. Clara Mendes.');
  await expect(alert).toContainText('+1 pendência');
  await expect(alert.getByRole('link', { name: 'Ver conversa' })).toHaveAttribute('href', '/conversas?id=conversation-1');
  await alert.getByRole('link', { name: 'Remarcar', exact: true }).click();
  await expect(page).toHaveURL(/gestao\/agenda\?.*edit=appt-ana.*context=conversation-1/);
  await expect(page.getByRole('dialog', { name: 'Remarcar consulta', exact: true })).toBeVisible();

  await open(page, `/gestao/pacientes?id=${confirmPatient.id}`);
  const confirm = page.locator('[data-pendency="confirmar"]');
  await expect(confirm).toContainText('Consulta a confirmar');
  const appointmentId = filterPatients(seed, { q: confirmPatient.name })[0].next!.id;
  await confirm.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Consulta confirmada.' })).toBeVisible();
  await expect(page.locator('[data-pendency="confirmar"]')).toHaveCount(0);
  expect((await snapshot(page)).appointments.find(a => a.id === appointmentId)?.status).toBe('confirmada');
});

test('(f) abas por teclado e na URL; Atividade agrupada com a sessão da Ana e "Carregar mês"', async ({ page }) => {
  await open(page, '/gestao/pacientes?id=patient-1');
  const tabs = page.getByRole('tablist', { name: 'Histórico do paciente' });
  const activity = tabs.getByRole('tab', { name: /^Atividade/ });
  await expect(activity).toHaveAttribute('aria-selected', 'true');
  await activity.focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: /^Consultas/ })).toBeFocused();
  await expect(page).toHaveURL(/tab=consultas/);
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: /^Anotações/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab=anotacoes/);
  await expect(page.getByRole('tabpanel')).toContainText('As anotações aparecem aqui depois que uma consulta é realizada.');
  await page.keyboard.press('Home');
  await expect(activity).toBeFocused();
  await expect(page).not.toHaveURL(/tab=/);

  const panel = page.getByRole('tabpanel', { name: /Atividade/ });
  for (const title of ['Próximas', 'Esta semana', 'Novembro', 'Outubro']) await expect(panel.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const week = panel.getByRole('region', { name: 'Esta semana' });
  await expect(week).toContainText('Conversa aguardando atendimento');
  await expect(week).toContainText('Aguardando atendente');
  await expect(week.getByRole('link', { name: 'Abrir conversa' })).toHaveAttribute('href', '/conversas?id=conversation-1');
  await expect(panel.locator('.featured-appointment')).toContainText('Segunda, 9 de nov. · 11:30–12:00');
  await expect(panel.locator('.featured-appointment')).toContainText('Pediu remarcação');
  await panel.getByRole('button', { name: /^Mais \d+ consultas marcadas$/ }).click();
  await expect(panel.getByRole('button', { name: /^Mais \d+ consultas marcadas$/ })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Carregar Setembro', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Setembro', exact: true })).toBeVisible();
  // Filter menu: only conversations.
  await panel.getByRole('button', { name: 'Filtrar atividade: Tudo' }).click();
  await page.getByRole('menuitemradio', { name: 'Conversas' }).click();
  await expect(panel.locator('.timeline-entry')).toHaveCount(1);
  // A timeline appointment line opens the details modal.
  await panel.getByRole('button', { name: 'Filtrar atividade: Conversas' }).click();
  await page.getByRole('menuitemradio', { name: 'Tudo' }).click();
  await panel.locator('.timeline-line.is-link').first().click();
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta' })).toBeVisible();
  await expect(page).toHaveURL(/appointment=/);
});

test('(g) Consultas: próximas/anteriores, filtro de profissional, linha abre detalhes e Remarcar só nas próximas', async ({ page }) => {
  await open(page, '/gestao/pacientes?id=patient-1&tab=consultas');
  const split = patientAppointmentsSplit(seed, 'patient-1');
  const period = page.getByRole('group', { name: 'Período das consultas' });
  const upcoming = period.getByRole('button', { name: /^Próximas/ });
  const earlier = period.getByRole('button', { name: /^Anteriores/ });
  await expect(upcoming).toHaveAttribute('aria-pressed', 'true');
  await expect(upcoming).toContainText(String(split.proximas.length));
  await expect(earlier).toContainText(String(split.anteriores.length));
  const rows = page.locator('.appointment-row');
  await expect(rows).toHaveCount(Math.min(12, split.proximas.length));
  await expect(rows.getByRole('link', { name: 'Remarcar', exact: true })).toHaveCount(Math.min(12, split.proximas.length));
  await expect(page.locator('.patient-list-footer')).toContainText(`${split.proximas.length} consultas`);
  await earlier.click();
  await expect(page).toHaveURL(/when=anteriores/);
  await expect(earlier).toHaveAttribute('aria-pressed', 'true');
  await expect(rows.getByRole('link', { name: 'Remarcar', exact: true })).toHaveCount(0);
  await expect(rows.first()).toHaveAttribute('data-appointment-id', split.anteriores[0].id);

  await page.getByRole('button', { name: 'Todos os profissionais' }).click();
  await page.getByLabel('Filtrar profissional').selectOption('pro-clara');
  await expect(page).toHaveURL(/professional=pro-clara/);
  const clara = patientAppointmentsSplit(seed, 'patient-1', 'pro-clara');
  await expect(earlier).toContainText(String(clara.anteriores.length));
  await expect(page.getByRole('button', { name: 'Dra. Clara Mendes' })).toBeVisible();
  await rows.first().locator('td').nth(2).click({ force: true });
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`appointment=${clara.anteriores[0].id}`));
});

test('(h) modal: campos opcionais por "+", Remover limpa, edição mostra os preenchidos, telefone compartilhado', async ({ page }) => {
  await open(page, '/gestao/pacientes');
  await page.getByRole('button', { name: 'Cadastrar paciente', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cadastrar paciente', exact: true });
  await expect(dialog.getByLabel('Nome completo', { exact: true })).toBeFocused();
  await expect(dialog).not.toContainText('Todos os contatos desta demonstração são fictícios.');
  await expect(dialog).toContainText('Somente dados administrativos.');
  await expect(dialog.getByLabel('Convênio', { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('Observação administrativa')).toHaveCount(0);
  const addInsurance = dialog.getByRole('button', { name: 'Convênio', exact: true });
  await expect(addInsurance).toHaveCSS('border-top-style', 'dashed');
  await addInsurance.click();
  await expect(dialog.getByLabel('Convênio', { exact: true })).toBeFocused();
  await expect(addInsurance).toHaveCount(0);
  await dialog.getByLabel('Convênio', { exact: true }).selectOption('Viva Saúde');
  await dialog.getByRole('button', { name: 'Remover campo Convênio', exact: true }).click();
  await expect(dialog.getByLabel('Convênio', { exact: true })).toHaveCount(0);
  await expect(addInsurance).toBeFocused();
  await addInsurance.click();
  await expect(dialog.getByLabel('Convênio', { exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Observação', exact: true }).click();
  await expect(dialog.getByLabel('Observação administrativa')).toBeFocused();

  await dialog.getByLabel('Nome completo', { exact: true }).fill('Pessoa Compartilhada');
  await dialog.getByLabel('Telefone', { exact: true }).fill(seed.patients[0].phone);
  await expect(dialog.locator('.warning-banner')).toContainText(`Este telefone já está vinculado a ${seed.patients[0].name}.`);
  const save = dialog.getByRole('button', { name: 'Cadastrar paciente', exact: true });
  await expect(save).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await expect(save).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await open(page, '/gestao/pacientes?id=patient-1');
  await page.getByRole('button', { name: 'Editar cadastro', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Editar cadastro', exact: true });
  await expect(edit.getByLabel('Convênio', { exact: true })).toHaveValue('Viva Saúde');
  await expect(edit.getByLabel('Observação administrativa')).toHaveValue(seed.patients[0].notes);
  await expect(edit.getByRole('button', { name: 'Salvar alterações', exact: true })).toBeVisible();
  await edit.getByRole('button', { name: 'Remover campo Observação', exact: true }).click();
  await edit.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(edit).toHaveCount(0);
  expect((await snapshot(page)).patients.find(p => p.id === 'patient-1')?.notes).toBe('');
  await expect(page.locator('.attribute-list')).toContainText('Sem observações');
});

for (const width of [1024, 768, 390]) {
  test(`(i) ${width}px: lista, cadastro e abas sem transbordamento global`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const url of ['/gestao/pacientes', '/gestao/pacientes?view=pendencias', '/gestao/pacientes?id=patient-1', '/gestao/pacientes?id=patient-1&tab=consultas', '/gestao/pacientes?id=patient-1&tab=conversas']) {
      await open(page, url);
      const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(size.document, url).toBeLessThanOrEqual(size.viewport + 1);
    }
    if (width === 390) {
      // Cadastro and Resumo collapse into closed <details>; touch targets reach 44 px.
      await expect(page.locator('details.attribute-section')).toHaveCount(2);
      for (const details of await page.locator('details.attribute-section').all()) expect(await details.evaluate(el => (el as HTMLDetailsElement).open)).toBeFalsy();
      expect((await page.getByRole('link', { name: 'Agendar consulta', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await open(page, '/gestao/pacientes');
      expect((await page.getByRole('link', { name: 'Abrir cadastro de Ana Beatriz Santos' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    } else if (width === 768) {
      // Attributes stack above the content, not sticky, with a four-column summary.
      const aside = page.getByRole('complementary', { name: 'Dados do paciente' });
      await expect(aside).toHaveCSS('position', 'static');
      expect(await page.locator('.summary-stats').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(4);
    }
  });
}

test('(j) temas claro e escuro: badges de pendência, textos sutis e iniciais com contraste ≥ 4,5', async ({ page }) => {
  await open(page, '/gestao/pacientes');
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      await page.getByRole('button', { name: 'Tema escuro', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    }
    const ratios = await page.evaluate(() => {
      const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const lum = (c: number[]) => c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const ratio = (a: string, b: string) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m); return (x + .05) / (y + .05); };
      const resolve = (token: string) => { const probe = document.createElement('div'); probe.style.background = `var(${token})`; document.body.append(probe); const color = getComputedStyle(probe).backgroundColor; probe.remove(); return color; };
      const result: Record<string, number> = {};
      document.querySelectorAll<HTMLElement>('.pendency-cell .badge').forEach((el, i) => { const s = getComputedStyle(el); result[`badge-${i}`] = ratio(s.color, s.backgroundColor); });
      const phone = getComputedStyle(document.querySelector('.patient-phone')!).color;
      result.subtleOnSurface = ratio(phone, resolve('--surface'));
      result.subtleOnHover = ratio(phone, resolve('--surface-hover'));
      const avatar = getComputedStyle(document.querySelector('.patient-row .avatar')!);
      result.avatar = ratio(avatar.color, avatar.backgroundColor);
      return result;
    });
    for (const [name, value] of Object.entries(ratios)) expect(value, `${theme} ${name}`).toBeGreaterThanOrEqual(4.5);
    await open(page, '/gestao/pacientes?id=patient-1');
    const alert = page.locator('[data-pendency="remarcacao"]');
    const alertRatio = await alert.evaluate(el => {
      const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const lum = (c: number[]) => c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const s = getComputedStyle(el); const [x, y] = [lum(rgb(s.color)), lum(rgb(s.backgroundColor))].sort((m, n) => n - m);
      return (x + .05) / (y + .05);
    });
    expect(alertRatio, theme).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `test-results/pacientes-${theme}.png`, fullPage: true });
    await open(page, '/gestao/pacientes');
  }
});
