/**
 * The five Settings sections restored in #1923, filmed.
 *
 * They had never rendered in the app — built, then dropped by the Set1.2
 * nested-settings IA migration — so the unit tests prove they mount and
 * write correctly, and prove nothing at all about how they look. This is
 * the only thing that can, per CLAUDE.md's D15 lesson: no visual churn
 * without screenshots.
 *
 * Three pages:
 *   run-plan      RunFitnessSection + HeartRateZonesSection, the two
 *                 running-fitness inputs, below the plan they feed.
 *   account       DataExportSection, above the delete block.
 *   subscription  AiUsageSection, under the plan row.
 *
 * 375px rather than the 393 the other capture specs use. Narrow is the
 * stress case for these: the HR editor puts a label, a mono value and a
 * Button on one row, and the export rows are full-width buttons with long
 * labels. If they hold at 375 they hold everywhere.
 *
 * Light AND dark, because two of the three lean on `bg-card` + border
 * treatments that read very differently between themes, and dark is the
 * default new users see.
 */
import { test } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";

test.use({
  viewport: { width: 375, height: 812 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

/** Pages under capture: route slug, heading to settle on, file stem. */
const PAGES = [
  { slug: "settings/run-plan", heading: /run plan/i, stem: "run-plan" },
  { slug: "settings/account", heading: /account/i, stem: "account" },
  {
    slug: "settings/subscription",
    heading: /subscription/i,
    stem: "subscription",
  },
] as const;

test.describe("restored settings sections", () => {
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
    await signInAsTestUser(page);
  });

  for (const { slug, heading, stem } of PAGES) {
    for (const theme of ["light", "dark"] as const) {
      test(`${stem} — ${theme}`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.goto(slug);

        // Best-effort with a SHORT explicit timeout: a missed locator
        // should cost seconds and still produce a frame, not burn the
        // default 30s and then fail with no image to look at.
        await page
          .getByRole("heading", { name: heading })
          .first()
          .waitFor({ state: "visible", timeout: 15000 })
          .catch(() => console.log(`[capture] ${stem} heading not found`));

        // Applied AFTER navigation — a client-side route change re-runs
        // the theme boot script and would drop a class set before goto.
        await page.evaluate((t) => {
          document.documentElement.classList.toggle("dark", t === "dark");
        }, theme);
        await page.waitForTimeout(600);

        await page.screenshot({
          animations: "disabled",
          path: `screenshots/settings-${stem}-${theme}.png`,
          fullPage: true,
        });
      });
    }
  }
});
