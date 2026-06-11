import { defineConfig, devices } from "@playwright/test";

/**
 * bypassCSP is scoped to the `auth-emulator` project only — the
 * sole suite that talks to http://127.0.0.1:9099 from a built app
 * whose production CSP allows only HTTPS Firebase origins. The
 * default and mobile projects run against the unmodified built
 * artifact so the production CSP is exercised end-to-end (any CSP
 * regression in the SPA fails those suites loudly).
 *
 * Hostname / env strictness is enforced inside auth.spec.ts and
 * scripts/seed-e2e-user.ts via e2e/helpers/emulator so a stray
 * truthy env var can't accidentally point Playwright at a
 * non-local Firebase target.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:4173/Maiin/",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      // Design-QA capture specs drive authed surfaces + use CDP screencast,
      // so they run only in the auth-emulator project (below), not here.
      testIgnore: [/auth\.spec\.ts/, /\.capture\.spec\.ts/],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testIgnore: [/auth\.spec\.ts/, /\.capture\.spec\.ts/],
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "auth-emulator",
      testMatch: [/auth\.spec\.ts/, /\.capture\.spec\.ts/],
      use: {
        ...devices["Desktop Chrome"],
        bypassCSP: true,
      },
    },
  ],
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173/Maiin/",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
