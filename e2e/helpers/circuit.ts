import type { Locator, Page } from "@playwright/test";

/**
 * Circuit mode in a capture spec (Circ1): its picker on a clock the spec
 * can move on, and that clock moved the way a screen that stays awake
 * moves it.
 */

/** The standard 10-minute circuit's row on the picker. */
export const TEN_MINUTE_CIRCUIT = /^10-minute circuit\s?10 min/;

/** Seconds the clock moves at a time: under the shortest step (10 s). */
const STEP = 5;

/**
 * Opens circuit mode with Playwright's clock installed. The clock runs as
 * a real one does until a spec moves it on.
 */
export async function openCircuit(page: Page) {
  await page.clock.install();
  await page.goto("circuit");
  await page
    .getByRole("button", { name: TEN_MINUTE_CIRCUIT })
    .waitFor({ state: "visible", timeout: 20_000 });
}

/**
 * Moves the clock on by `seconds`, a few at a time with a render between:
 * never more than one step ends between two of the page's ticks, which
 * the page would read as time away and pause on.
 */
export async function runCircuitClock(page: Page, seconds: number) {
  for (let left = seconds; left > 0; left -= STEP) {
    await page.clock.fastForward(Math.min(STEP, left) * 1000);
    await page.waitForTimeout(50);
  }
}

/** Moves the clock on until `shown` is on screen, for at most `limit` s. */
export async function runCircuitUntil(page: Page, shown: Locator, limit = 120) {
  for (let ran = 0; ran < limit; ran += STEP) {
    if (await shown.isVisible().catch(() => false)) return;
    await runCircuitClock(page, STEP);
  }
  await shown.waitFor({ state: "visible", timeout: 5_000 });
}
