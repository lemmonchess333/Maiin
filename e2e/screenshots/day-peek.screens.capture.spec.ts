/**
 * Calendar day-peek capture (Cal-A). Shows the week strip with its new
 * lift/run legend, then a day-peek opened on a NON-today day rendering
 * the planned session by name (lift dayName + run template name) rather
 * than a generic "Lift + Run day / Run scheduled". Light + dark.
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("calendar day peek", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await suppressCoachmarks(page);
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          ".firebase-emulator-warning{display:none !important}";
        document.head.appendChild(style);
      });
    });
    await signInAsTestUser(page);
  });

  async function shootLightDark(page: Page, name: string) {
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
    await page.waitForTimeout(300);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-dark.png`,
      fullPage: true,
    });
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  }

  test("week strip legend + day peek — light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1000);
    // Badge-earned seal (not role=dialog): backdrop tap breaks the seal
    // → reveal; the reveal has a "Nice" button. Tap backdrop to break,
    // click Nice to dismiss, then a couple more backdrop taps as belt +
    // braces. Top-left corner never holds an interactive element.
    const nice = page.getByRole("button", { name: /^nice$/i });
    for (let i = 0; i < 10; i++) {
      if (await nice.isVisible().catch(() => false)) break;
      await page.mouse.click(8, 8);
      await page.waitForTimeout(500);
    }
    await nice.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);

    // Strip with legend (no peek open yet).
    await shootLightDark(page, "day-peek-strip");

    // Open a peek on a weekday cell (aria-label "Weekday D Month, …" —
    // en-GB day-before-month since 2026-08-22). This regex is read out of
    // this file and pinned against WeekStrip's real render by
    // weekStripCaptureSelector.test.tsx: the previous shape ("Weekday,
    // Month D") went stale when the label order changed, matched ZERO
    // cells, and the count-guard below silently skipped the click — the
    // frame filmed a bare strip labelled as an open peek.
    const dayCells = page.getByRole("button", { name: /\w+day \d+ \w+,/i });
    const count = await dayCells.count().catch(() => 0);
    /* Pick a cell that is NOT today, by its label rather than by index.
       The strip is the calendar week, so a fixed `nth(4)` is Thursday —
       and one day in seven that IS today, which makes the frame's
       SUBJECT depend on the day CI happens to run. Every cell opens a
       peek, so this is a choice of subject rather than a correctness
       guard: today's session content is already filmed by the home
       frames, and a day that is not today is what shows this card's own
       contribution. Today's cell is the one whose name ends "(today)";
       WeekStrip appends it. */
    let target = -1;
    for (let i = 0; i < count; i += 1) {
      const name = (await dayCells.nth(i).getAttribute("aria-label")) ?? "";
      if (!/\(today\)/.test(name)) {
        target = i;
        break;
      }
    }
    if (target >= 0) {
      await dayCells
        .nth(target)
        .click({ timeout: 4000 })
        .catch(() => {});
    }
    await page.waitForTimeout(600);
    await shootLightDark(page, "day-peek-open");
  });

  /* NO "today" frame here — a choice, not an impossibility, and the
     note it replaces was wrong on both of its facts. It said tapping
     today "never opens a peek at all" (Home's handleDayTap has no
     today branch) and that every date the card can show is "strictly in
     the FUTURE" (WeekStrip resolves the calendar week, so most of the
     cells are in the past). Whoever adds a today frame should add it,
     not conclude from here that it cannot exist. */
});
