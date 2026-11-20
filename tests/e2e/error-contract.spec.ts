import { expect, test, type Page } from '@playwright/test';
import { createDemoState } from '../../src/lib/demo-data';

const key = 'clinia.demo.v1';
const seed = createDemoState('2026-11-09');
test.use({ reducedMotion: 'reduce' });

async function open(page: Page, url: string, data: unknown = seed) {
  await page.addInitScript(({ value, storageKey }) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem(storageKey, JSON.stringify(value)); sessionStorage.setItem('seeded', '1'); }
  }, { value: data, storageKey: key });
  await page.goto(url);
  await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false');
}

test('o erro de validação marca o campo que o causou e aparece uma única vez', async ({ page }) => {
  await open(page, '/gestao/pacientes');
  await page.getByRole('button', { name: 'Cadastrar paciente', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cadastrar paciente', exact: true });
  await dialog.getByLabel('Nome completo', { exact: true }).fill('Pessoa Fictícia');
  await dialog.getByLabel('Telefone', { exact: true }).fill('123');
  await dialog.getByRole('button', { name: 'Cadastrar paciente', exact: true }).click();
  const phone = dialog.getByLabel('Telefone', { exact: true });
  await expect(phone).toHaveAttribute('aria-invalid', 'true');
  await expect(phone).toHaveAccessibleDescription(/10 ou 11 dígitos/);
  await expect(dialog.getByLabel('Nome completo', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
  // Shown next to the form only: the shell no longer repeats command errors globally.
  await expect(page.getByText('Informe um telefone com DDD e 10 ou 11 dígitos.', { exact: true })).toHaveCount(1);
  await phone.fill('(81) 98888-7777');
  await dialog.getByRole('button', { name: 'Cadastrar paciente', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('anotações clínicas salvas por versões antigas são apagadas ao abrir a aplicação', async ({ page }) => {
  const old = structuredClone(seed) as typeof seed & { appointments: (typeof seed.appointments[number] & { notes?: unknown[] })[] };
  const done = old.appointments.find(a => a.status === 'realizada')! as typeof old.appointments[number] & { notes?: unknown[] };
  done.notes = [{ id: 'n1', text: 'Texto clínico antigo', professionalId: done.professionalId, recordedByUserId: old.currentUserId, at: old.now }];
  await open(page, `/gestao/agenda?appointment=${done.id}`, old);
  await expect(page.getByRole('dialog', { name: 'Detalhes da consulta', exact: true })).toBeVisible();
  await expect(page.getByText('Texto clínico antigo')).toHaveCount(0);
  const stored = await page.evaluate(storageKey => localStorage.getItem(storageKey)!, key);
  expect(stored).not.toContain('Texto clínico antigo');
  expect(stored).not.toContain('"notes":[');
});
