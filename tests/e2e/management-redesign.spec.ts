import { test, expect, type Locator, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import { getMetrics, getPeriod } from '../../src/lib/metrics';
import { previousDailyTotals, previousRange, professionalActivity } from '../../src/lib/management-analysis';

const seed = createDemoState('2026-11-09');
const week = getPeriod(seed.referenceDate, 7);
const lastWeek = previousRange(week);
const url = '/gestao/visao-gerencial';
test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => {
    if (!sessionStorage.getItem('mgmt-seeded')) { localStorage.setItem('clinia.demo.v1', JSON.stringify(data)); sessionStorage.setItem('mgmt-seeded', '1'); }
  }, seed);
});
async function open(page: Page, path = url) {
  await page.goto(path);
  await expect(page.locator('.app-loading')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Visão gerencial', level: 1 })).toBeVisible();
}
const kpi = (page: Page, title: string) => page.locator('.metric-card').filter({ hasText: title });
const ratio = (value: number | null) => value === null ? 'Sem dados' : `${value.toFixed(1).replace('.', ',')}%`;
const contrast = (fg: string, bg: string) => {
  const lum = (c: string) => c.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const [a, b] = [lum(fg), lum(bg)].sort((m, n) => n - m); return (a + .05) / (b + .05);
};
const colors = (el: Locator) => el.evaluate(node => { let bg = 'rgba(0, 0, 0, 0)'; for (let n: Element | null = node; n && /rgba\(0, 0, 0, 0\)|transparent/.test(bg); n = n.parentElement) bg = getComputedStyle(n).backgroundColor; return { fg: getComputedStyle(node).color, bg }; });

test('(a) barra: período por menu, "comparado a" por opção, chips aplicam, removem pelo × e por "Limpar filtros"', async ({ page }) => {
  await open(page);
  const bar = page.getByRole('toolbar', { name: 'Recorte da análise' });
  await expect(page.locator('.page-heading .eyebrow')).toHaveCount(0);
  await expect(bar.locator('.management-interval')).toHaveText('03–09 nov. · comparado a 27 out.–02 nov.');
  const expected: Record<string, string> = { Hoje: '09 nov. · comparado a 08 nov.', 'Últimos 30 dias': '11 out.–09 nov. · comparado a 11 set.–10 out.', 'Últimos 7 dias': '03–09 nov. · comparado a 27 out.–02 nov.' };
  for (const [option, text] of Object.entries(expected)) {
    await bar.getByRole('button', { name: /^Período dos indicadores/ }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toContainText('Sempre comparado ao período anterior de mesma duração.');
    await menu.getByRole('menuitemradio', { name: option }).click();
    await expect(page).toHaveURL(option === 'Hoje' ? /period=1/ : option === 'Últimos 30 dias' ? /period=30/ : /period=7/);
    await expect(bar.locator('.management-interval')).toHaveText(text);
    await expect(bar.getByRole('button', { name: `Período dos indicadores: ${option}`, exact: true })).toBeVisible();
  }
  const add = bar.getByRole('button', { name: 'Filtrar por profissional', exact: true });
  await expect(add).toHaveCSS('border-top-style', 'dashed');
  await add.click();
  const options = page.getByRole('listbox', { name: 'Profissional' });
  await expect(options.getByRole('option', { name: 'Todos os profissionais' })).toHaveAttribute('aria-selected', 'true');
  await options.getByRole('option', { name: /Dra\. Clara Mendes/ }).click();
  await expect(page).toHaveURL(/professional=pro-clara/);
  const applied = bar.getByRole('button', { name: 'Profissional: Dra. Clara Mendes', exact: true });
  await expect(applied).toHaveCSS('border-top-style', 'solid');
  await applied.click();
  await expect(page.getByRole('listbox', { name: 'Profissional' }).getByRole('option', { name: /Dra\. Clara Mendes/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Remover filtro de profissional', exact: true }).click();
  await expect(page).not.toHaveURL(/professional=/);
  await expect(bar.getByRole('button', { name: 'Limpar filtros' })).toHaveCount(0);
  await bar.getByRole('button', { name: 'Filtrar por especialidade', exact: true }).click();
  await page.getByRole('listbox', { name: 'Especialidade' }).getByRole('option', { name: 'Cardiologia', exact: true }).click();
  await bar.getByRole('button', { name: 'Filtrar por profissional', exact: true }).click();
  await page.getByRole('option', { name: /Bianca Torres/ }).click();
  await expect(page).toHaveURL(/specialty=Cardiologia/);
  await bar.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page).not.toHaveURL(/professional=|specialty=/);
  await expect(page).toHaveURL(/period=7/);
  // Info opens the definitions and moves focus to their summary.
  await bar.getByRole('button', { name: 'Como calculamos estes indicadores' }).click();
  await expect(page.locator('details.management-definitions')).toHaveAttribute('open', '');
  await expect(page.locator('details.management-definitions summary')).toBeFocused();
});

test('(b) aviso de resultados pendentes: contagem, "Registrar resultados" e ausência sem pendências', async ({ page }) => {
  await open(page, `${url}?professional=pro-lucas`);
  const pending = getMetrics(seed, week, 'pro-lucas').pending;
  expect(pending).toBeGreaterThan(0);
  const notice = page.getByRole('status').filter({ hasText: 'sem resultado' });
  await expect(notice).toContainText(`${pending} ${pending === 1 ? 'consulta' : 'consultas'}`);
  const before = await notice.boundingBox();
  expect(before!.y).toBeLessThan((await page.locator('.kpi-strip').boundingBox())!.y);
  await notice.getByRole('link', { name: 'Registrar resultados' }).click();
  await expect(page).toHaveURL(new RegExp(`/gestao/agenda\\?from=${week.start}&to=${week.end}&status=pendente&professional=pro-lucas`));
  await expect(page.locator('.agenda-range-context')).toBeVisible();

  const clean = structuredClone(seed);
  const now = Date.parse(clean.now);
  for (const a of clean.appointments) if ((a.status === 'agendada' || a.status === 'confirmada') && Date.parse(`${a.date}T${a.start}:00-03:00`) + a.duration * 60000 <= now) a.status = 'realizada';
  await page.addInitScript(data => localStorage.setItem('clinia.demo.v1', JSON.stringify(data)), clean);
  await open(page);
  await expect(page.getByRole('status').filter({ hasText: 'sem resultado' })).toHaveCount(0);
  await expect(page.locator('tr[data-outcome="emAberto"] small')).toHaveCount(0);
});

test('(c) KPIs: ordem, Canceladas com %, contagens absolutas, taxas em p.p., tons, Sem dados e Sem base', async ({ page }) => {
  await open(page);
  const m = getMetrics(seed, week); const b = getMetrics(seed, lastWeek);
  await expect(page.locator('.management-kpis .metric-label')).toHaveText(['Consultas realizadas', 'Ocupação da agenda', 'Taxa de faltas', 'Canceladas']);
  await expect(kpi(page, 'Canceladas').locator('.metric-detail')).toHaveText(`${(m.cancelled / m.total * 100).toFixed(1).replace('.', ',')}% das consultas previstas`);
  await expect(kpi(page, 'Canceladas')).toHaveAttribute('href', `/gestao/agenda?from=${week.start}&to=${week.end}&status=cancelada`);
  const done = kpi(page, 'Consultas realizadas').locator('.metric-change');
  await expect(done.locator('strong')).toHaveText(String(Math.abs(m.completed - b.completed)));
  await expect(done.locator('.metric-ref')).toHaveText(`vs. ${b.completed}`);
  await expect(done).toHaveAttribute('data-tone', m.completed < b.completed ? 'negative' : 'positive');
  await expect(done).toContainText(m.completed < b.completed ? 'Variação desfavorável' : 'Variação favorável');
  await expect(done).not.toContainText('%');
  const absence = kpi(page, 'Taxa de faltas').locator('.metric-change');
  await expect(absence.locator('strong')).toHaveText(`${Math.abs(m.absenceRate! - b.absenceRate!).toFixed(1).replace('.', ',')} p.p.`);
  await expect(absence).toHaveAttribute('data-tone', m.absenceRate! > b.absenceRate! ? 'negative' : 'positive');
  await expect(kpi(page, 'Ocupação da agenda').locator('.metric-change')).toHaveAttribute('data-tone', 'neutral');
  // Início uses the same strip and the same absolute format for counts.
  await page.goto('/inicio?period=7');
  await expect(page.locator('.app-loading')).toHaveCount(0);
  await expect(page.locator('.home-kpis')).toHaveClass(/kpi-strip/);
  await expect(page.locator('.metric-card').filter({ hasText: 'Consultas realizadas' }).locator('.metric-change strong')).toHaveText(String(Math.abs(m.completed - b.completed)));

  await open(page, `${url}?professional=missing&period=1`);
  await expect(kpi(page, 'Taxa de faltas').locator('.metric-value')).toHaveText('Sem dados');
  await expect(kpi(page, 'Taxa de faltas').locator('.metric-value')).toHaveClass(/no-data/);
  await expect(kpi(page, 'Canceladas').locator('.metric-detail')).toHaveText('Sem dados');
  const today = getPeriod(seed.referenceDate, 1);
  const noBase = seed.professionals.find(p => getMetrics(seed, previousRange(today), p.id).completed === 0 && getMetrics(seed, today, p.id).completed > 0)!;
  await open(page, `${url}?professional=${noBase.id}&period=1`);
  await expect(kpi(page, 'Consultas realizadas').locator('.metric-change')).toHaveText('Sem base de comparação · anterior: 0');
  await expect(kpi(page, 'Consultas realizadas').locator('.metric-change')).toHaveAttribute('data-tone', 'neutral');
});

test('(d) gráfico: totais batem com a tabela, marcador do período anterior, legenda alterna compare=0', async ({ page }) => {
  await open(page);
  const chart = page.locator('.management-chart');
  const previous = previousDailyTotals(seed, {}, week);
  const slots = chart.locator('.stacked-slot');
  await expect(slots).toHaveCount(7);
  await expect(chart.locator('.stacked-reference')).toHaveCount(7);
  for (let i = 0; i < 7; i++) await expect(slots.nth(i)).toHaveAttribute('aria-label', new RegExp(`Período anterior: ${previous[i].total}$`));
  await chart.getByText('Ver dados do gráfico').click();
  const table = chart.locator('.chart-data table');
  await expect(table.locator('thead th').last()).toHaveText('Período anterior');
  const rows = await table.locator('tbody tr').evaluateAll(trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => Number(td.textContent))));
  for (const [i, cells] of rows.entries()) {
    expect(cells.at(-2)).toBe(cells.slice(0, 4).reduce((s, v) => s + v, 0));
    expect(cells.at(-1)).toBe(previous[i].total);
    await expect(slots.nth(i)).toHaveAttribute('aria-label', new RegExp(`total ${cells.at(-2)}\\.`));
  }
  expect(rows.reduce((s, r) => s + r.at(-2)!, 0)).toBe(getMetrics(seed, week).total);
  await slots.nth(1).hover();
  await expect(chart.locator('.stacked-tooltip')).toContainText(`Mesmo dia do período anterior (qua., 28 out.)${previous[1].total}`);
  const toggle = chart.getByRole('button', { name: 'Total do período anterior' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(page).toHaveURL(/compare=0/);
  await expect(chart.getByRole('button', { name: 'Total do período anterior' })).toHaveAttribute('aria-pressed', 'false');
  await expect(chart.locator('.stacked-reference').first()).toHaveCSS('opacity', '0');
  await chart.getByRole('button', { name: 'Total do período anterior' }).click();
  await expect(page).not.toHaveURL(/compare=/);
  // One day: horizontal bar with "Ontem: n" in the legend.
  await open(page, `${url}?period=1`);
  await expect(page.locator('.management-chart .stacked-hbar')).toBeVisible();
  await expect(page.locator('.management-chart .stacked-legend')).toContainText(`Ontem: ${getMetrics(seed, { start: '2026-11-08', end: '2026-11-08' }).total}`);
});

test('(e) desfecho: atual, anterior e diferença batem com KPIs e gráfico; "já passaram do horário"', async ({ page }) => {
  await open(page);
  const m = getMetrics(seed, week); const b = getMetrics(seed, lastWeek);
  const card = page.locator('.management-outcomes');
  const expectRow = async (key: string, current: number, previous: number) => {
    const cells = card.locator(`tr[data-outcome="${key}"] td`);
    await expect(cells.nth(0)).toHaveText(String(current));
    await expect(cells.nth(1)).toHaveText(String(previous));
    const d = current - previous;
    await expect(cells.nth(2)).toContainText(d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0');
  };
  await expectRow('realizadas', m.completed, b.completed);
  await expectRow('faltas', m.missed, b.missed);
  await expectRow('canceladas', m.cancelled, b.cancelled);
  await expectRow('emAberto', m.planned, b.planned);
  await expectRow('total', m.total, b.total);
  await expect(card.locator('tr[data-outcome="realizadas"] .outcome-delta')).toHaveAttribute('data-tone', m.completed < b.completed ? 'negative' : 'positive');
  await expect(card.locator('tr[data-outcome="emAberto"] .outcome-delta')).toHaveAttribute('data-tone', 'neutral');
  await expect(card.locator('tr[data-outcome="emAberto"] small')).toHaveText(`${m.pending} já passaram do horário`);
  await expect(kpi(page, 'Consultas realizadas').locator('.metric-value')).toHaveText(String(m.completed));
  await expect(page.locator('.management-chart .management-link')).toContainText(`${m.total} consultas`);
  await expect(card).toContainText(`${m.total} consultas previstas no período`);
  await expect(card.getByRole('img')).toHaveAttribute('aria-label', `Desfecho: Realizadas ${Math.round(m.completed / m.total * 100)}%, Faltas ${Math.round(m.missed / m.total * 100)}%, Canceladas ${Math.round(m.cancelled / m.total * 100)}%, Em aberto ${Math.round(m.planned / m.total * 100)}%`);
});

test('(f) tabela: colunas, aria-sort, chaves antigas, delta por profissional, total agregado e linha → Equipe', async ({ page }) => {
  await open(page);
  const table = page.getByRole('region', { name: 'Tabela de atividade por profissional' });
  await expect(table.locator('thead th')).toHaveText(['Profissional', 'Realizadas', 'Ocupação da agenda', 'Faltas', 'Canceladas', 'Em aberto', 'Abrir']);
  const header = (name: string) => table.getByRole('columnheader').filter({ has: page.getByRole('button', { name: `Ordenar por ${name}`, exact: true }) });
  await expect(header('Realizadas')).toHaveAttribute('aria-sort', 'descending');
  await expect(header('Faltas')).toHaveAttribute('aria-sort', 'none');
  // The sort icon shows only on the active column (or on hover/focus).
  expect(await header('Faltas').locator('svg').evaluate(el => getComputedStyle(el).opacity)).toBe('0');
  expect(await header('Realizadas').locator('svg').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  const { rows, total } = professionalActivity(seed, {}, week, lastWeek);
  const clara = rows.find(r => r.professional.id === 'pro-clara')!;
  const delta = clara.realizadas - clara.realizadasAnterior;
  await expect(table.locator('tr[data-professional-id="pro-clara"] .activity-delta')).toHaveText(`${delta === 0 ? 'Sem variação' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}`} vs. ${clara.realizadasAnterior}${delta === 0 ? '' : ` · Variação ${delta > 0 ? 'favorável' : 'desfavorável'}`}`);
  const foot = table.locator('tfoot tr');
  await expect(foot.locator('th')).toHaveText('Total do recorte');
  await expect(foot.locator('td').nth(2)).toContainText(ratio(total.taxaFaltas));
  await expect(foot.locator('td').nth(0).locator('.cell-strong')).toHaveText(String(total.realizadas));
  for (const [legacy, column] of [['availableMinutes', 'Ocupação da agenda'], ['absenceRate', 'Faltas'], ['planned', 'Em aberto']]) {
    await open(page, `${url}?sort=${legacy}&order=asc`);
    await expect(header(column)).toHaveAttribute('aria-sort', 'ascending');
  }
  await header('Em aberto').getByRole('button').click();
  await expect(page).toHaveURL(/sort=planned&order=desc/);
  await open(page);
  // The whole row opens the professional in Equipe (click away from the name).
  await table.locator('tr[data-professional-id="pro-lucas"] td').nth(3).click({ force: true });
  await expect(page).toHaveURL(/\/gestao\/equipe\?id=pro-lucas$/);
});

test('(g) filtro de profissional reflete em aviso, KPIs, gráfico, desfecho e tabela', async ({ page }) => {
  await open(page, `${url}?professional=pro-clara`);
  const m = getMetrics(seed, week, 'pro-clara');
  await expect(kpi(page, 'Consultas realizadas').locator('.metric-value')).toHaveText(String(m.completed));
  await expect(kpi(page, 'Taxa de faltas').locator('.metric-value')).toHaveText(ratio(m.absenceRate));
  await expect(page.locator('.management-chart .management-link')).toContainText(`${m.total} consultas`);
  await expect(page.locator('.management-outcomes tr[data-outcome="total"] td').first()).toHaveText(String(m.total));
  await expect(page.locator('.activity-table tbody tr')).toHaveCount(1);
  if (m.pending) await expect(page.getByRole('status').filter({ hasText: 'sem resultado' })).toContainText(`${m.pending} consulta`);
  else await expect(page.getByRole('status').filter({ hasText: 'sem resultado' })).toHaveCount(0);
  const previous = previousDailyTotals(seed, { professionalId: 'pro-clara' }, week);
  await expect(page.locator('.management-chart .stacked-slot').first()).toHaveAttribute('aria-label', new RegExp(`Período anterior: ${previous[0].total}$`));
});

for (const width of [1024, 768, 390]) {
  test(`(h) ${width}px sem transbordamento global`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [url, `${url}?period=30&professional=pro-clara`, `${url}?period=1`]) {
      await open(page, path);
      const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(size.document, path).toBeLessThanOrEqual(size.viewport + 1);
    }
    if (width === 390) {
      const bar = page.getByRole('toolbar', { name: 'Recorte da análise' });
      expect((await bar.getByRole('button', { name: 'Filtrar por profissional' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.locator('.management-kpis').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
      await bar.getByRole('button', { name: 'Filtrar por profissional' }).click();
      await expect(page.getByRole('dialog', { name: 'Filtrar por profissional' })).toHaveAttribute('aria-modal', 'true');
    }
    if (width === 768) {
      const chart = (await page.locator('.management-chart').boundingBox())!; const outcomes = (await page.locator('.management-outcomes').boundingBox())!;
      expect(outcomes.y).toBeGreaterThan(chart.y + chart.height - 1);
    }
  });
}

test('(i) dois temas: aviso, deltas, sutis do cabeçalho/total, iniciais e marcador legíveis', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await open(page, `${url}?professional=pro-lucas`);
    if (theme === 'dark') {
      await page.getByRole('button', { name: 'Tema escuro', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await open(page);
    } else await open(page);
    const checks: [string, Locator][] = [
      ['aviso', page.locator('.management-pending p')],
      ['delta KPI', page.locator('.metric-card .metric-change[data-tone="negative"], .metric-card .metric-change[data-tone="positive"]').first()],
      ['delta desfecho', page.locator('.outcome-delta[data-tone="negative"], .outcome-delta[data-tone="positive"]').first()],
      ['cabeçalho', page.locator('.activity-table thead th').first()],
      ['total', page.locator('.activity-table tfoot td small').first()],
      ['iniciais', page.locator('.activity-row .pro-avatar').first()],
    ];
    for (const [name, el] of checks) { const c = await colors(el); expect(contrast(c.fg, c.bg), `${theme} ${name}`).toBeGreaterThanOrEqual(4.5); }
    // Marker: spaced dashes in --chart-marker. ≥3:1 on the plot surface in both themes and,
    // in the light theme, on the segments it usually crosses (realizadas, canceladas, em aberto).
    const marker = await page.locator('.stacked-reference').first().evaluate(el => {
      const probe = document.createElement('div'); el.parentElement!.append(probe);
      const resolve = (token: string) => { probe.style.color = `var(${token})`; return getComputedStyle(probe).color; };
      const result = { ink: resolve('--chart-marker'), surface: resolve('--surface'), bars: ['--data-realizadas', '--data-canceladas', '--data-em-aberto'].map(resolve) };
      probe.remove(); return result;
    });
    expect(contrast(marker.ink, marker.surface), `${theme} marcador/superfície`).toBeGreaterThanOrEqual(3);
    if (theme === 'light') for (const bar of marker.bars) expect(contrast(marker.ink, bar), `marcador/${bar}`).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: `test-results/visao-gerencial-${theme}.png`, fullPage: true });
  }
});
