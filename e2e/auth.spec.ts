/**
 * PR P: authenticated user smoke tests. Gated behind the
 * E2E_AUTH_EMULATOR env var — when unset, the entire describe
 * block skips. Mirrors the firestore.rules.test.ts pattern: the
 * spec ships in CI, but the operator decides when the emulator
 * is wired up enough to run it.
 *
 * To run locally:
 *   firebase emulators:start --only auth,firestore
 *   # seed test user via scripts/seed-e2e-user.ts (TBD)
 *   E2E_AUTH_EMULATOR=1 npm run test:e2e -- auth.spec.ts
 */

import { test, expect } from "@playwright/test";
import { signInAsTestUser, signOut } from "./helpers/auth";
import {
  emulatorActive,
  EXPECTED_AUTH_HOST,
  EXPECTED_FIRESTORE_HOST,
} from "./helpers/emulator";

test.describe("authenticated user flows", () => {
  // Expected hosts are read from firebase.json so the gate stays in
  // lockstep with the emulator config — no magic literals to drift.
  test.skip(
    !emulatorActive,
    `Requires E2E_AUTH_EMULATOR=1 with FIREBASE_AUTH_EMULATOR_HOST=${EXPECTED_AUTH_HOST} and FIRESTORE_EMULATOR_HOST=${EXPECTED_FIRESTORE_HOST}`,
  );

  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test("signed-in user lands on Home with main nav visible", async ({ page }) => {
    await expect(page).toHaveURL(/\/$|\/home/);
    // Layout component renders a bottom-nav with at least 4 tabs.
    // Anonymously rendered Login has no such nav; this asserts the
    // authenticated route shell rendered.
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
  });

  test("can navigate to Food page from nav", async ({ page }) => {
    await page.goto("food");
    // Food page renders an h1 "Food" header.
    await expect(page.locator("h1", { hasText: "Food" })).toBeVisible();
  });

  test("can navigate to Settings page from nav", async ({ page }) => {
    await page.goto("settings");
    await expect(page.locator("h1", { hasText: "Settings" })).toBeVisible();
  });

  test("Diagnostics route renders authenticated UID", async ({ page }) => {
    // PR N hidden operator route — accessible only when signed in.
    // The page shows the current UID, which only resolves to a
    // non-anonymous value when auth has succeeded.
    await page.goto("diagnostics");
    await expect(page.locator("h1", { hasText: "Diagnostics" })).toBeVisible();
    // The UID row should NOT show the not-signed-in placeholder.
    await expect(
      page.locator('text="<not signed in>"'),
    ).toHaveCount(0);
  });
});
