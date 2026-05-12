import { defineConfig, devices } from '@playwright/test';

const authEmulatorE2E = process.env.E2E_AUTH_EMULATOR === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173/Maiin/',
    // Auth-emulator E2E is the only suite that needs to talk to
    // http://127.0.0.1:9099 from a built app whose production CSP
    // intentionally allows only HTTPS Firebase origins. Keep the
    // application artifact unchanged and let Playwright bypass CSP
    // for this test-only browser context instead of mutating or
    // stripping index.html during the Vite build.
    bypassCSP: authEmulatorE2E,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173/Maiin/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
