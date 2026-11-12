/**
 * Analytics for a user sixteen weeks in: every page, light and dark.
 *
 * Every other Analytics capture is of a thin account: a fresh sign-up
 * with one run, one workout and one meal, or the shared rich user, who
 * has five days of food, no weigh-ins, runs with no splits, and
 * performance documents keyed by week where production writes one a day.
 * On those, a chart has nothing to draw and a comparison nothing to
 * compare, so a defect in either is invisible: the Performance card
 * compared today with yesterday and called it last week, and the Body
 * page drew a goal nobody set, and no frame showed it.
 *
 * `seed:season` stages the account (scripts/seed-season-athlete.ts):
 * three lifts and three runs a week with splits, a race, most mornings
 * weighed, most days logged, and a performance document a day.
 *
 * Each page is anchored on something only real data renders, so a frame
 * cannot be taken of a loading or empty state and pass for the page.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import { signInAsTestUser } from "../helpers/auth";
import { settleFullPageHeight } from "../helpers/settleHeight";
import { settleImages } from "../helpers/settleImages";

const SEASON = {
  email: "season-athlete@tropos.test",
  password: "test-password-123",
};

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

async function shootBoth(page: Page, name: string) {
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.waitForTimeout(300);
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
}

/** A page, and the element that only its data can render. */
const PAGES: {
  name: string;
  path: string;
  anchor: (page: Page) => Locator;
}[] = [
  {
    name: "overview",
    path: "/Maiin/history",
    // The month card's kilograms: sessions alone would render for a
    // one-session account.
    anchor: (page) => page.getByText("kg lifted").first(),
  },
  {
    // The overview with the score's details open: the page Performance
    // had until Trim1 call 5. Its old address is used on purpose, so
    // this also holds that a saved link still lands on the details.
    name: "performance",
    path: "/Maiin/history?view=performance",
    anchor: (page) => page.getByRole("heading", { name: "Performance Index" }),
  },
  {
    name: "lifting",
    path: "/Maiin/history?view=lifting",
    // Each lift's progress needs a lift trained twice in the range, and
    // sets per muscle a whole week: neither renders for a thin account.
    // The summary line's forms (MuscleVolumeCard, `muscleRangeReading`):
    // "2 of 14 muscles below their range: abs", "All 14 muscles in their
    // range", "Both muscles in their range", "Your 1 muscle is in its
    // range".
    anchor: (page) =>
      page
        .getByText(
          /^\d+ of \d+ muscles? below their range|muscles in their range$|^Your 1 muscle is in its range$/
        )
        .first(),
  },
  {
    name: "running",
    path: "/Maiin/history?view=running",
    // Fastest kilometres need a run with km splits.
    anchor: (page) => page.getByRole("heading", { name: "Fastest kilometres" }),
  },
  {
    name: "body",
    path: "/Maiin/history?view=body",
    // The rate needs a month of weigh-ins.
    anchor: (page) => page.getByRole("heading", { name: "Your rate" }),
  },
  {
    name: "food",
    path: "/Maiin/history?view=food",
    // Days against their own targets need the daily target snapshots.
    anchor: (page) => page.getByRole("heading", { name: "How the days went" }),
  },
];

test.describe("analytics — a season of training", () => {
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

  test("every page, with sixteen weeks behind it", async ({ page }) => {
    test.setTimeout(300_000);
    await signInAsTestUser(page, SEASON);

    for (const { name, path, anchor } of PAGES) {
      await page.goto(path);
      await expect(anchor(page)).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[class*="animate-pulse"]')).toHaveCount(0, {
        timeout: 30_000,
      });
      await settleImages(page);
      await settleFullPageHeight(page);
      await shootBoth(page, `season-${name}`);
    }

    /* The PRs tab: all-time records drawn from every run, which a range-
       scoped pool left as "--" for anything older than the range. The
       race is weeks old, so its row only fills from the lifetime read. */
    await page.goto("/Maiin/history?tab=prs");
    await expect(page.getByText("Lifting bests")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Longest run").first()).toBeVisible();
    await settleImages(page);
    await settleFullPageHeight(page);
    await shootBoth(page, "season-prs");

    /* Home's week card, which says a season's week once: the count, the
       seven days and what the count is made of. (The Performance row
       closed this capture until Trim1 call 1 took the score off Home.) */
    await page.goto("/Maiin/");
    await expect(
      page.getByRole("list", { name: "This week so far" })
    ).toBeVisible({ timeout: 30_000 });
    await settleImages(page);
    await settleFullPageHeight(page);
    await shootBoth(page, "season-home");
  });
});
