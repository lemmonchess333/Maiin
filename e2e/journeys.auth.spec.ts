/**
 * Core-journey E2E tests — the product loops a real user runs daily.
 *
 * Until now the E2E suite was shell-level (smoke, nav, a11y, PWA,
 * security, responsive, auth) — nothing proved a user can actually log
 * a meal, start a workout, or set a race goal. These specs close that
 * gap with three journeys against the REAL app + Firebase emulators:
 *
 *   1. Log a meal — NL composer → local parseFoodText → Firestore
 *      write → success toast + diary row renders.
 *   2. Set a race goal — Settings → Run plan → Race prep → distance +
 *      date → live planner preview + an armed "Save race plan" CTA (the
 *      focused RunPlanSettings editor is the ONE run-plan surface post
 *      D14 dedupe; the actual save hits a callable this emulator set
 *      lacks, so the journey stops at the armed CTA).
 *   3. Start a workout & log a set — Programme → "Begin Workout" →
 *      session screen renders set inputs → mark one set complete →
 *      progress reflects it. Deliberately scoped to ONE set: driving
 *      every set of every exercise through rest timers is a flake
 *      factory, and the save path's persistence is already covered by
 *      unit + emulator integration tests; what only E2E can prove is
 *      that the entry point, session UI, and set-logging interaction
 *      actually work wired together.
 *
 * File is named *.auth.spec.ts on purpose: playwright.config.ts routes
 * /auth\.spec\.ts/ into the `auth-emulator` project (bypassCSP, gated)
 * and testIgnores it from the chromium/mobile projects — this file
 * inherits both behaviours with zero config changes.
 *
 * Re-run safe by design:
 *   - meal: duplicate logs group by foodName in the diary (assertion
 *     unaffected).
 *   - race goal: handles both the fresh ("Set your race goal" form
 *     auto-open) and already-set ("Edit race goal") states.
 *   - workout: one inline set never completes the day, so "Begin
 *     Workout" persists; localStorage drafts are wiped by signOut.
 *
 * To run locally:
 *   VITE_USE_EMULATORS=true npm run build:e2e   (+ dummy VITE_FIREBASE_* env)
 *   firebase emulators:exec --only auth,firestore --project demo-tropos \
 *     'npm run seed:e2e && E2E_AUTH_EMULATOR=1 npx playwright test --project=auth-emulator'
 */

import { test, expect } from "@playwright/test";
import { signInAsTestUser, signOut } from "./helpers/auth";
import {
  emulatorActive,
  EXPECTED_AUTH_HOST,
  EXPECTED_FIRESTORE_HOST,
} from "./helpers/emulator";

test.describe("core user journeys", () => {
  test.skip(
    !emulatorActive,
    `Requires E2E_AUTH_EMULATOR=1 with FIREBASE_AUTH_EMULATOR_HOST=${EXPECTED_AUTH_HOST} and FIRESTORE_EMULATOR_HOST=${EXPECTED_FIRESTORE_HOST}`
  );

  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test("logs a meal via the NL composer and sees it in the diary", async ({
    page,
  }) => {
    await page.goto("food");
    await expect(page.locator("h1", { hasText: "Food" })).toBeVisible();

    // Free-tier user → handleNLParse takes the local parseFoodText
    // path (no AI call, fully deterministic). "2 eggs, toast" parses
    // to two known foods in the local database.
    const composer = page.getByLabel("What did you eat");
    await composer.fill("2 eggs, toast");
    await page.getByLabel("Log meal").click();

    // Success toast: `${items.length} items logged…` from performNLSave.
    await expect(page.getByText(/2 items logged/i)).toBeVisible({
      timeout: 10_000,
    });

    // The diary row renders the grouped foodName (Firestore write
    // round-tripped back through the useMeals subscription).
    await expect(page.getByText(/eggs/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  // Scope note: the actual SAVE goes through the `configurePlan` Cloud
  // Function, which the auth+firestore-only E2E emulator set (CI included)
  // doesn't run — so this journey verifies the race-planning UX up to the
  // armed save (mode → distance → date → live plan preview + enabled CTA),
  // which is the part only E2E can prove. The configurePlan persistence is
  // covered server-side (functions tests) and the planner derivation by
  // raceGoalPlanner unit tests.
  test("configures a race goal and the planner previews a valid plan", async ({
    page,
  }) => {
    // D14 dedupe: race-goal configuration lives in the focused run-plan
    // editor (/settings/run-plan → RunPlanSettings), the ONE run-plan
    // surface. ProgrammeSettings (/settings/training) now renders a
    // read-only Running summary that links here, so this journey drives
    // the canonical editor directly.
    await page.goto("settings/run-plan");
    await expect(page.getByRole("heading", { name: "Run plan" })).toBeVisible({
      timeout: 15_000,
    });

    // Run mode is a radiogroup (Freeform / Race prep). Selecting Race prep
    // reveals the RaceGoalPlanner.
    await page.getByRole("radio", { name: /Race prep/i }).click();

    // Distance picker is a SegmentedControl (role=radio options); date
    // is #ps-race-date. 70 days out → classifyRaceTiming "healthy".
    await page.getByRole("radio", { name: "Half", exact: true }).click();
    const target = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000);
    const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
    await page.locator("#ps-race-date").fill(iso);

    // The planner derives a live preview for the chosen distance/date —
    // proves getRaceGoalPlannerState ran and the Base→Build→Taper→Race
    // model rendered for a half marathon.
    await expect(page.getByText(/half marathon/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // …and the sticky save CTA is ARMED with a plannerState-driven race
    // label (not the "Fix race date" disabled state) — the save is ready
    // to commit. We stop here: clicking it hits the configurePlan
    // callable, which this emulator set doesn't provide.
    await expect(
      page.getByRole("button", {
        name: /Save race plan|Save compressed plan|Save finish-safely plan/,
      })
    ).toBeEnabled({ timeout: 10_000 });
  });

  test("starts today's workout and logs a set", async ({ page }) => {
    await page.goto("program");

    // Seeded profile has an all-lift weekSchedule (7 days), so today
    // is always a workout day and the command card offers Begin
    // Workout. Generous timeout: first visit bootstraps programState.
    const begin = page.getByRole("button", { name: "Begin Workout" });
    await expect(begin).toBeVisible({ timeout: 20_000 });
    await begin.click();

    // PROGRAM-FLEX-01: on a day whose estimate exceeds the 30-min
    // budget, Begin Workout opens the Express chooser first — take the
    // full session. Best-effort with a short timeout: a short seeded
    // day starts directly and the chooser never renders.
    try {
      await page
        .getByRole("button", { name: /^Full session/ })
        .click({ timeout: 4_000 });
    } catch {
      /* chooser skipped — day fits the shortest budget */
    }

    // In-session screen: close affordance + set rows with weight/reps
    // inputs render.
    await expect(page.getByLabel("Close workout")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel("Set 1 weight").first()).toBeVisible();
    await expect(page.getByLabel("Set 1 reps").first()).toBeVisible();

    // Fill the first set and mark it complete — the DONE circle for a
    // completed set leaves the "Mark set complete" state, so the
    // remaining count drops by exactly one.
    await page.getByLabel("Set 1 weight").first().fill("40");
    await page.getByLabel("Set 1 reps").first().fill("8");
    const doneButtons = page.getByLabel("Mark set complete");
    const before = await doneButtons.count();
    expect(before).toBeGreaterThan(0);
    await doneButtons.first().click();
    await expect(doneButtons).toHaveCount(before - 1, { timeout: 10_000 });

    // Leave the session (day NOT completed — keeps re-runs
    // deterministic; full completion is covered at the unit layer).
    await page.getByLabel("Close workout").click();
  });
});
