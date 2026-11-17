import { expect, test } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';
import { getPeriod } from '../../src/lib/metrics';
import { serviceMetrics } from '../../src/lib/service-analysis';

const seed = createDemoState('2026-11-09');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('clinia.demo.v1', JSON.stringify(data)); sessionStorage.setItem('seeded', '1'); } }, seed);
});

test('Visão gerencial mostra o atendimento no WhatsApp com os números do período', async ({ page }) => {
  await page.goto('/gestao/visao-gerencial');
  const section = page.getByRole('region', { name: 'Atendimento no WhatsApp' });
  const metrics = serviceMetrics(seed, getPeriod(seed.referenceDate, 7));
  await expect(section.locator('dt')).toHaveText(['Sessões no WhatsApp', 'Resolvidas pela IA', 'Encaminhadas à recepção', 'Tempo até assumir']);
  await expect(section.locator('dd.tabular')).toHaveText([String(metrics.sessions), '25,0%', String(metrics.handoffs), '3 min']);
  // The channel ignores the professional filter, and says so.
  await page.goto('/gestao/visao-gerencial?professional=pro-clara');
  await expect(section.locator('dd.tabular').first()).toHaveText(String(metrics.sessions));
  await expect(section).toContainText('não depende dos filtros');
  await section.getByRole('link', { name: /aguardando agora/ }).click();
  await expect(page).toHaveURL(/\/conversas\?view=pendentes/);
});
