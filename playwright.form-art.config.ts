import { defineConfig } from "@playwright/test";

// Account-free fixture; no Firebase credentials, sign-in or production deployment.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "form-art-review.pw.ts",
  outputDir: "test-results/form-art",
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/form-art-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4176",
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 1,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 4176 --strictPort",
    url: "http://127.0.0.1:4176/e2e/fixtures/form-art.html",
    env: { HOSTING_TARGET: "firebase" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
