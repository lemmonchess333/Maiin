/**
 * Every exercise demo the rig animates, at three frames, light + dark.
 *
 * This did not exist, which is the finding. The repo has dozens of
 * capture specs and not one of them touched `bodyRig` -- so the demos
 * were the only surface in the app that had never been looked at
 * through this channel. Eleven of them were corrected in this branch
 * entirely by measurement: elbow angles, grip ratios, contact points.
 * Measurement caught defects eyes would miss (five partial reps, a
 * barbell that stretched, a pull-up that was silently the wide-grip
 * exercise) but it structurally cannot catch "the numbers are right and
 * it still looks wrong" -- which is the class the owner's original
 * report belonged to ("arms look so far apart on the dips"). They found
 * that by looking. Nothing here could.
 *
 * Shot from the dev Form Motion Lab rather than the shipped Form
 * surface, deliberately: the lab force-renders EVERY registered demo
 * including production-gated ones, in one grid, so a single page is the
 * whole set. It survives `build:e2e` because that builds `--mode=test`
 * and the lab is only stripped from `production`.
 *
 * Three frames, not five: the two rep ends carry the form claims
 * (lockout, depth) and the midpoint is where a smooth pose either reads
 * as a body or does not. The lab offers 0.25 and 0.75 too; add them here
 * if a specific demo ever needs the intermediate frames reviewed.
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

test.use({
  /* Wider and taller than the phone viewport the other capture specs
     use. This is a review contact sheet, not a product screen -- at
     393px the lab's grid collapses to one column and 21 demos become an
     unreadably long strip. 1280 gives the three-column layout. */
  viewport: { width: 1280, height: 1400 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("form demos — every exercise, three frames", () => {
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
    for (const [theme, apply] of [
      ["light", () => document.documentElement.classList.remove("dark")],
      ["dark", () => document.documentElement.classList.add("dark")],
    ] as const) {
      await page.evaluate(apply);
      await page.waitForTimeout(250);
      await page.screenshot({
        path: `screenshots/${name}-${theme}.png`,
        fullPage: true,
      });
    }
  }

  test("captures every registered demo at both rep ends and the middle", async ({
    page,
  }) => {
    await page.goto("/Maiin/dev/form-motion-lab");
    await page.getByRole("heading", { name: "Form Motion Lab" }).waitFor();

    /* Every card carries its own frame cursor, so the whole grid has to
       be driven to the same sample before the sheet means anything --
       a mixed-frame contact sheet is worse than none, because it looks
       like the demos disagree. */
    for (const sample of ["0", "0.5", "1"] as const) {
      const steps = await page.getByTestId(`form-lab-sample-${sample}`).all();
      for (const step of steps) await step.click();
      // Poses are pure functions of t; this is the React commit, not an
      // animation settling.
      await page.waitForTimeout(200);
      await shootLightDark(page, `form-demos-t${sample.replace(".", "")}`);
    }
  });
});
