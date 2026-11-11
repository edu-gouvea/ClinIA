import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const localChrome = process.env.CLINIA_CHROME_PATH || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.CLINIA_BASE_URL || 'http://localhost:3000',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    locale: 'pt-BR',
    timezoneId: 'America/Recife',
    colorScheme: 'light',
    launchOptions: localChrome ? { executablePath: localChrome } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Tests use isolated browser contexts. The development or production server
  // is started separately, so an existing application process is never killed.
});
