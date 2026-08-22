/**
 * Onboarding capture — the first-run flow, filmed step by step.
 *
 * Onboarding had NO capture spec despite being the one surface EVERY new
 * user sees (CLAUDE.md's cold-start rule: across a user base, the
 * cold-start states are among the most-seen in the app). This walks the
 * real flow as a brand-new account and shoots each step light + dark,
 * including the race-runway advisory (Run15 voice packet): a marathon
 * dated a few weeks out must show the engine's mostly-easy/compressed
 * line at DATE ENTRY, not after onboarding commits the plan.
 *
 * A fresh account is minted through the real signup form on every run
 * (unique email against the auth emulator), so no seed script is
 * involved and the captured state is exactly what a new user gets.
 * The walk stops at the confirmation step WITHOUT submitting — the
 * final save calls the completeOnboarding Cloud Function, which the
 * capture rig's emulator set doesn't run.
 *
 * Rig conventions: fresh context, short best-effort clicks, emulator
 * banner hidden, 393px viewport.
 */
import { test, expect, type Page } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("onboarding screenshots", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          ".firebase-emulator-warning{display:none !important}";
        document.head.appendChild(style);
      });
    });
  });

  async function shootBoth(page: Page, name: string) {
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(250);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-light.png`,
      fullPage: true,
    });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(250);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-dark.png`,
      fullPage: true,
    });
  }

  /** Best-effort tap — a missed optional control costs seconds, not 30s. */
  async function tap(page: Page, name: RegExp, timeout = 4000) {
    try {
      await page.getByRole("button", { name }).first().click({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  async function next(page: Page) {
    await page
      .getByRole("button", { name: /continue/i })
      .first()
      .click({ timeout: 8000 });
    await page.waitForTimeout(400);
  }

  test("full first-run walk incl. race-runway advisory", async ({ page }) => {
    test.setTimeout(300_000);

    // ── Mint a brand-new account through the real signup form.
    const email = `e2e-onboarding-${Date.now()}@tropos.test`;
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", { name: /sign up/i })
      .click({ timeout: 20_000 });
    await page.fill("#login-email", email);
    await page.fill("#login-password", "test-password-123");
    await page
      .getByRole("button", { name: /create account/i })
      .click({ timeout: 8000 });

    // Onboarding step 0 (goal) is the signed-in fallback route.
    await page
      .getByRole("button", { name: /build muscle/i })
      .waitFor({ state: "visible", timeout: 30_000 });
    await shootBoth(page, "onboarding-0-goal");
    await tap(page, /build muscle/i);
    await next(page);

    // Step 1 — days per week (a default may already be selected).
    await shootBoth(page, "onboarding-1-days");
    await next(page);

    // Step 2 — equipment.
    await tap(page, /full gym/i);
    await shootBoth(page, "onboarding-2-equipment");
    await next(page);

    // Step 3 — run frequency + mode → Race Prep → distance + date.
    await tap(page, /regular runner/i);
    await tap(page, /race prep/i);
    await tap(page, /full/i);

    // The Run15 advisory: a marathon two weeks out is under the taper
    // floor → the ENGINE's mostly-easy line must appear at date entry.
    // (The status is the engine's own belowFloor boolean, not raw
    // weeks-vs-floor arithmetic — 25 days still reads as compressed.)
    const soon = new Date(Date.now() + 14 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const dateInput = page.getByLabel(/race target date/i);
    await dateInput.fill(soon);
    // "mostly-easy plan", NOT "finish-safely". RUN-EV-05 (owner decision,
    // 2026-08-09) renamed the below-floor label the day after this spec was
    // written: "finish-safely implied a safety promise the product cannot
    // make". The internal `finish_safely` state keys are unchanged, which is
    // why the phrase still appears in comments and persisted vocabulary —
    // but it is no longer USER-VISIBLE copy, so this locator matched
    // nothing. See raceGoalPlanner.ts's statusDescription.
    await expect(page.getByText(/mostly-easy plan/i)).toBeVisible({
      timeout: 5000,
    });
    // The 3-line advisory sits at the step's bottom edge — scroll it fully
    // clear of the footer row before shooting.
    await page.getByText(/mostly-easy plan/i).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shootBoth(page, "onboarding-3-race-advisory-tight");

    // Same step, ~9 weeks out → the compressed-runway line.
    const nearer = new Date(Date.now() + 63 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await dateInput.fill(nearer);
    await expect(page.getByText(/compress/i).first()).toBeVisible({
      timeout: 5000,
    });
    await shootBoth(page, "onboarding-3-race-advisory-compressed");
    await next(page);

    // Step 4 — injuries (skippable).
    await shootBoth(page, "onboarding-4-injuries");
    await next(page);

    // Step 5 — about you (has sensible defaults; shoot as-is).
    await shootBoth(page, "onboarding-5-about-you");
    await next(page);

    // Step 6 — weekly preview.
    await shootBoth(page, "onboarding-6-preview");
    await next(page);

    // Step 7 — confirmation. Shot but NOT submitted (completeOnboarding
    // is a Cloud Function the capture emulators don't run).
    await shootBoth(page, "onboarding-7-confirm");
  });
});
