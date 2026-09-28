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
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
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
    name: "performance",
    path: "/Maiin/history?view=performance",
    anchor: (page) => page.getByRole("heading", { name: "Performance Index" }),
  },
  {
    name: "lifting",
    path: "/Maiin/history?view=lifting",
    // Each lift's progress needs a lift trained twice in the range, and
    // sets per muscle a whole week: neither renders for a thin account.
    // The summary line's three forms (MuscleVolumeCard).
    anchor: (page) =>
      page
        .getByText(
          /^Below range: |muscles below their range$|^Every muscle is in its range$/
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
    anchor: (page) => page.getByText(/Trending at/i).first(),
  },
  {
    name: "food",
    path: "/Maiin/history?view=food",
    anchor: (page) => page.getByText(/Macro distribution/i).first(),
  },
];

test.describe("analytics — a season of training", () => {
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
    await expect(page.getByText("Lift PRs")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Longest run").first()).toBeVisible();
    await settleImages(page);
    await settleFullPageHeight(page);
    await shootBoth(page, "season-prs");

    /* Home's Performance row, whose change is now against last week. */
    await page.goto("/Maiin/");
    await expect(
      page.getByRole("link", { name: /Performance Index \d+/ })
    ).toBeVisible({ timeout: 30_000 });
    await settleImages(page);
    await settleFullPageHeight(page);
    await shootBoth(page, "season-home");
  });
});
