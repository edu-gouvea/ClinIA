import { test, expect, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import { getPeriod } from '../../src/lib/metrics';

const seed = createDemoState('2026-11-09');
test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => {
    if (!sessionStorage.getItem('fixes-seeded')) { localStorage.setItem('clinia.demo.v1', JSON.stringify(data)); sessionStorage.setItem('fixes-seeded', '1'); }
  }, seed);
});
async function ready(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('.app-loading')).toHaveCount(0);
  await expect(page.locator('h1')).toBeVisible();
}
const inPeriod = (days: number, id: string) => { const p = getPeriod(seed.referenceDate, days); return seed.appointments.filter(a => a.professionalId === id && a.date >= p.start && a.date <= p.end).sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`)); };

test('detalhe do profissional: consultas correspondentes em páginas de 10, voltando à 1ª ao trocar o período', async ({ page }) => {
  const week = inPeriod(7, 'pro-clara'); const month = inPeriod(30, 'pro-clara');
  expect(week.length).toBeGreaterThan(20);
  await ready(page, '/gestao/equipe?id=pro-clara');
  const card = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Consultas correspondentes' }) });
  const rows = card.locator('tbody tr');
  const footer = card.getByRole('navigation', { name: 'Paginação das consultas' });
  await expect(rows).toHaveCount(10);
  await expect(footer).toContainText(`Mostrando 1–10 de ${week.length}`);
  const previous = footer.getByRole('button', { name: 'Página anterior de consultas' });
  const next = footer.getByRole('button', { name: 'Próxima página de consultas' });
  await expect(previous).toBeDisabled();
  await expect(rows.first()).toContainText(seed.patients.find(p => p.id === week[0].patientId)!.name);
  await next.click();
  await expect(footer).toContainText(`Mostrando 11–20 de ${week.length}`);
  await expect(rows.first()).toContainText(seed.patients.find(p => p.id === week[10].patientId)!.name);
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(footer).toContainText(`Mostrando 1–10 de ${week.length}`);
  // Last page: "Próxima" disabled and the count ends at the total.
  const pages = Math.ceil(week.length / 10);
  for (let i = 1; i < pages; i++) await next.click();
  await expect(next).toBeDisabled();
  await expect(rows).toHaveCount(week.length - (pages - 1) * 10);
  await expect(footer).toContainText(`–${week.length} de ${week.length}`);
  const range = getPeriod(seed.referenceDate, 7);
  await expect(footer.getByRole('link', { name: 'Ver todas na agenda' })).toHaveAttribute('href', `/gestao/agenda?professional=pro-clara&from=${range.start}&to=${range.end}`);
  // Changing the period starts again at page 1 (no new query param).
  await page.getByLabel('Período da equipe').selectOption('30');
  await expect(page).toHaveURL(/days=30/);
  await expect(page).not.toHaveURL(/page=/);
  await expect(footer).toContainText(`Mostrando 1–10 de ${month.length}`);
  await expect(card.getByRole('button', { name: 'Página anterior de consultas' })).toBeDisabled();
  // "Inativar profissional" is no longer pushed far below.
  const toggle = (await page.getByRole('button', { name: 'Inativar profissional' }).boundingBox())!;
  expect(toggle.y - (await card.boundingBox())!.y).toBeLessThan(900);
});

test('detalhe do profissional: 10 consultas ou menos não mostram o rodapé', async ({ page }) => {
  const small = structuredClone(seed);
  const keep = new Set(inPeriod(7, 'pro-clara').slice(0, 8).map(a => a.id));
  small.appointments = small.appointments.filter(a => a.professionalId !== 'pro-clara' || keep.has(a.id));
  await page.addInitScript(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), small);
  await ready(page, '/gestao/equipe?id=pro-clara');
  const card = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Consultas correspondentes' }) });
  await expect(card.locator('tbody tr')).toHaveCount(8);
  await expect(card.getByRole('navigation', { name: 'Paginação das consultas' })).toHaveCount(0);
});

test('Início: faixa de KPIs em um contêiner de 4 colunas (2×2 abaixo de 1024)', async ({ page }) => {
  for (const [width, columns] of [[1440, 4], [900, 2]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await ready(page, '/inicio');
    const strip = page.locator('.home-kpis');
    const style = await strip.evaluate(el => { const s = getComputedStyle(el); return { display: s.display, columns: s.gridTemplateColumns.split(' ').length, gap: s.columnGap, border: s.borderTopWidth, radius: s.borderTopLeftRadius, overflow: s.overflow }; });
    expect(style).toEqual({ display: 'grid', columns, gap: '1px', border: '1px', radius: '12px', overflow: 'hidden' });
    await expect(strip.locator('.metric-card .metric-label')).toHaveText(['Consultas realizadas', 'Ocupação da agenda', 'Taxa de faltas', 'Em aberto']);
    const tops = await strip.locator('.metric-card').evaluateAll(cards => cards.map(c => Math.round(c.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(4 / columns);
  }
});
