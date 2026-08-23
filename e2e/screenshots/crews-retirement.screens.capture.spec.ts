/**
 * Crews-retirement capture — the Together tab after the legacy crew
 * sections were removed (docs/proposals/crews-retirement.md). Proof
 * the tab reads as designed with its three remaining blocks: Circles
 * lead → Spaces directory → Challenges. Also captures the Feed tab's
 * solo state, whose gym-promise row now points at future location-kind
 * Spaces instead of crews.
 *
 * Signs in as the circles-capture user (seed-circles-capture.ts) so
 * the Circles block renders its featured card rather than cold-start.
 * Same rig conventions as home.screens.capture.spec.ts: mobile
 * viewport, best-effort waits with SHORT timeouts, one spec file =
 * fresh browser context.
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

const CAPTURE_USER = {
  email: "circles-capture@tropos.test",
  password: "test-password-123",
};

test.describe("crews retirement screenshots", () => {
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
    await signInAsTestUser(page, CAPTURE_USER);
  });

  async function shoot(page: Page, name: string) {
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}.png`,
      fullPage: true,
    });
  }

  async function shootLightDark(page: Page, name: string) {
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(400);
    await shoot(page, `${name}-light`);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(350);
    await shoot(page, `${name}-dark`);
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  }

  test("Together tab — Circles, Spaces, Challenges (no crews)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // The retired ?tab=crews param must still resolve to Together.
    await page.goto("social?tab=crews");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    // Spaces directory heading proves the middle block rendered.
    await page
      .getByText(/spaces/i)
      .first()
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() =>
        console.log("[capture] spaces heading not visible — capturing as-is")
      );
    await page.waitForTimeout(1200);
    await shootLightDark(page, "crews-retirement-together");
  });

  test("Feed tab — solo state with the gym-space promise row", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("social?tab=feed");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await page
      .getByText("Your gym's space is coming")
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() =>
        console.log(
          "[capture] gym-space row not visible (user may have follows) — capturing as-is"
        )
      );
    await page.waitForTimeout(1000);
    await shootLightDark(page, "crews-retirement-feed-solo");
  });
});
