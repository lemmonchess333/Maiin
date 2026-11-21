import type { Locator, Page } from "@playwright/test";

/**
 * Circuit mode in a capture spec (Circ1): its picker on a clock the spec
 * can move on, and that clock moved the way a screen that stays awake
 * moves it.
 *
 * Only the wall clock jumps. The circuit's timer reads `Date.now()` on a
 * one-second tick, so moving `Date` is all it needs. A fast-forward would
 * also move `performance.now()`, and framer starts each of its browser
 * animations at `performance.now()` on the document's timeline, which no
 * page clock moves: every fade then waits out the whole skip in real
 * time. A dialog closed after a minute's skip stayed on screen a minute,
 * and one opened stayed at opacity 0, unseen by axe.
 */

/** The standard 10-minute circuit's row on the picker. */
export const TEN_MINUTE_CIRCUIT = /^10-minute circuit\s?10 min/;

/** Seconds the wall clock jumps at a time. A tick of the page's own clock
 *  comes between two jumps, so the circuit sees at most this and the
 *  tick's second go by from one tick to the next: under its shortest
 *  step (10 s). */
const STEP = 8;

/** The page's timer ticks each second: a wait a little longer than one,
 *  on the page's clock, holds at least one tick. */
const TICK_MS = 1_100;

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
 * Moves the wall clock on by at least `seconds`, a jump at a time with a
 * tick of the page's timer between: never more than one step ends between
 * two of its ticks, which the page would read as time away and pause on.
 * Animations keep real time throughout.
 */
export async function runCircuitClock(page: Page, seconds: number) {
  for (let left = seconds; left > 0; left -= STEP) {
    const now = await page.evaluate(() => Date.now());
    await page.clock.setSystemTime(now + Math.min(STEP, left) * 1000);
    await page.evaluate(
      (ms) => new Promise<void>((done) => setTimeout(done, ms)),
      TICK_MS
    );
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
