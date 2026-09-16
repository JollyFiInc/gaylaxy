import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4177/gaylaxy-maker/';
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
    actionTimeout: 20_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath, args: ['--no-sandbox'] },
  },
  // With BASE_URL, test an already-running production deployment. By default,
  // build and serve a nested GitHub Pages path for a reproducible local run.
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run prepare:assets && npm run build && npm run preview -- --port 4177',
    env: { VITE_BASE_PATH: '/gaylaxy-maker/' },
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
