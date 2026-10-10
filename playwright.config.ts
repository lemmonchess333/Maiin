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
    // Local browser override. The agent sandbox ships a Chromium build
    // that does not match the revision Playwright expects, so a spec run
    // there dies at launch with "Executable doesn't exist". Twenty-eight
    // of the capture specs carry their own copy of this block in a
    // `test.use`; seven do not, and reproducing a capture failure in one
    // of those seven meant hand-writing a throwaway config first. Setting
    // it once here covers every spec and every project. Unset in CI, where
    // the runner installs the matching browser, so this is a no-op there.
    ...(process.env.PW_CHROMIUM
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
      : {}),
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
      // The journeys have their own project, below.
      testIgnore: /journeys\//,
      /* Every spec in this project signs in as the SAME seeded account, so
         its tests share one Firestore document space. `fullyParallel` at
         the top level would run two of them against that space at once,
         and they do interfere: `bodyweightUpsert.auth.spec.ts` asserts
         that a REFUSED save left zero bodyweight rows, while its
         neighbour in the same file is busy writing one. Measured on a
         4-CPU machine (2 workers): 4 of 10 repeats failed at the default,
         0 of 12 at `--workers=1`.
         CI never saw it because `workers: 1` above is gated on
         `process.env.CI`, so the only people who meet this are the ones
         following the documented local command — and the failure reads as
         a product bug ("a rejected save wrote a row") rather than as a
         race.
         Scoped to this project rather than made global: the capture specs
         share it, but the cost is bounded, whereas a global `workers: 1`
         would serialise the whole 64-spec capture loop for a problem that
         only the shared account creates.
         NOT closed by this: files still run in parallel with each other,
         and they share the account too — this file's own header records a
         sweep where a read under parallel-suite load found 0 docs. Any
         spec that asserts an ABSENCE across the shared account needs data
         only it touches. */
      fullyParallel: false,
      use: {
        ...devices["Desktop Chrome"],
        bypassCSP: true,
      },
    },
    {
      /* A person through weeks of the app, against the emulators
         (e2e/helpers/journey.ts). Each journey makes and deletes its own
         account, so they could run side by side; they run one at a time
         because each holds one of the runner's cores busy for minutes.
         No retries anywhere: a journey that fails on a retry has failed. */
      name: "journeys",
      testMatch: /journeys\/.*\.auth\.spec\.ts/,
      fullyParallel: false,
      retries: 0,
      use: {
        ...devices["Desktop Chrome"],
        bypassCSP: true,
        viewport: { width: 393, height: 852 },
        timezoneId: "UTC",
        // A control that never comes fails the step in half a minute,
        // not at the journey's own budget.
        actionTimeout: 30_000,
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
