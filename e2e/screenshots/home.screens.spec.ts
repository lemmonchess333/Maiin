/**
 * App screenshot capture (design-review channel).
 *
 * Tropos's runtime browser is blocked in the agent sandbox (Playwright's CDN
 * is not on the egress allowlist), so this runs in CI — where chromium IS
 * allowed — and the workflow commits the PNGs to a branch the agent can
 * `git fetch` + view. The point is to actually SEE the app to design against
 * it, not to assert anything (no expectations beyond "Home rendered").
 *
 * Mobile viewport (Tropos is mobile-first); fullPage so the whole scroll is
 * captured. Light + dark (dark = the `.dark` class on <html>).
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";

// iPhone-15-ish portrait. Overrides the auth-emulator project's desktop
// viewport while keeping its bypassCSP (needed for the emulator).
test.use({ viewport: { width: 393, height: 852 } });

test.describe("app screenshots", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
  });

  async function shoot(page: Page, name: string) {
    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  }

  test("home — light + dark", async ({ page }) => {
    await page.goto("");
    // Home is ready once its signature control is interactive.
    await page
      .getByRole("button", { name: /add water/i })
      .first()
      .waitFor({ state: "visible", timeout: 20000 });
    // let count-ups / entry animations settle
    await page.waitForTimeout(1200);

    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await shoot(page, "home-light");

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(400);
    await shoot(page, "home-dark");
  });

  // Main tabs under the DS2 foundation + rich-seeded data — the design
  // uplift is global (token-driven), so every primary surface must be
  // reviewed, not just Home. Captures light + dark for each.
  test("main tabs — light + dark", async ({ page }) => {
    const tabs: [route: string, name: string][] = [
      ["food", "food"],
      ["history", "history"],
      ["program", "program"],
      ["social", "social"],
    ];
    for (const [route, name] of tabs) {
      await page.goto(route);
      // The Layout's bottom nav is present on every main-tab route — use it
      // as the readiness proxy (Firebase listeners never go networkidle).
      await page
        .getByRole("navigation", { name: /main navigation/i })
        .waitFor({ state: "visible", timeout: 20000 });
      // Social's solo-first stack is gated behind an async followingCount
      // read; give it room to resolve (and let the discover query settle)
      // before capturing so we don't shoot a perpetual-skeleton frame.
      if (name === "social") {
        await page
          .getByText(/Crews unlock|Share your training/i)
          .first()
          .waitFor({ state: "visible", timeout: 12000 })
          .catch(() => {
            /* still gated/loading after the wait — capture whatever's there */
          });
      }
      await page.waitForTimeout(1400); // entry animations / count-ups settle

      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
      await shoot(page, `${name}-light`);
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.waitForTimeout(400);
      await shoot(page, `${name}-dark`);
      // reset to light before the next route so each starts clean
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
    }
  });
});
