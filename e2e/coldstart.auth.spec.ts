/**
 * Cold-start / first-session E2E — the single most-seen state across a
 * growing user base (every new user lives here, per the design-for-the-
 * user-base rule in CLAUDE.md), and nothing automated guarded it.
 *
 * The seeded E2E user has a hydrated profile but ZERO logged data
 * (no meals, workouts, runs, weigh-ins) — i.e. a genuine cold-start
 * account. This spec walks every main surface as that user and asserts:
 *   1. each renders its heading/shell (didn't crash on an empty data
 *      shape — the classic cold-start failure: a chart/reduce/`[0]`
 *      blowing up on an empty array), and
 *   2. ZERO uncaught page errors fired across the whole walk.
 *
 * It's a regression net, not a pixel check: empty-state COPY drifts and
 * is brittle to assert, but "a brand-new user can open Home, Food,
 * Programme, Analytics and Social and nothing throws" is the contract
 * that actually matters and is stable to pin.
 *
 * Routed into the gated auth-emulator project via the *.auth.spec.ts
 * name (see playwright.config.ts); skips without the emulator env.
 */

import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser, signOut } from "./helpers/auth";
import {
  emulatorActive,
  EXPECTED_AUTH_HOST,
  EXPECTED_FIRESTORE_HOST,
} from "./helpers/emulator";

test.describe("cold-start: a brand-new user can open every surface", () => {
  test.skip(
    !emulatorActive,
    `Requires E2E_AUTH_EMULATOR=1 with FIREBASE_AUTH_EMULATOR_HOST=${EXPECTED_AUTH_HOST} and FIRESTORE_EMULATOR_HOST=${EXPECTED_FIRESTORE_HOST}`,
  );

  // Collect uncaught page errors for the whole test; asserted at the end.
  // Ignore ResizeObserver loop noise (a benign browser warning Recharts /
  // layout libs commonly emit, not an app crash).
  function trackPageErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on("pageerror", (err) => {
      if (/ResizeObserver loop/i.test(err.message)) return;
      errors.push(err.message);
    });
    return errors;
  }

  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test("Home, Food, Programme, Analytics, Social all render cleanly with no logged data", async ({
    page,
  }) => {
    const pageErrors = trackPageErrors(page);

    // Home — no h1; the authed shell is proven by the bottom nav, and
    // the cold-start Performance hero + empty energy must render without
    // a chart/reduce blowing up on empty arrays.
    await expect(page.locator("nav").first()).toBeVisible();

    const surfaces: { path: string; heading: string }[] = [
      { path: "food", heading: "Food" },
      { path: "program", heading: "Train" },
      { path: "history", heading: "Analytics" },
      { path: "social", heading: "Social" },
    ];

    for (const { path, heading } of surfaces) {
      await page.goto(path);
      await expect(
        page.locator("h1", { hasText: heading }),
      ).toBeVisible({ timeout: 15_000 });
      // Bottom nav persists → the authed Layout shell survived this
      // route's cold-start render.
      await expect(page.locator("nav").first()).toBeVisible();
    }

    // Back to Home to catch any late async (subscription hydration) throw.
    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible();
    await page.waitForTimeout(1000);

    expect(
      pageErrors,
      `Uncaught page errors during cold-start walk:\n${pageErrors.join("\n")}`,
    ).toEqual([]);
  });
});
