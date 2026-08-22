/**
 * Circle Weekly Focus capture (SOCIAL-FOCUS-01 — the 393px light+dark
 * visual QA the handout requires).
 *
 * Signs in as the DEDICATED circles-capture user (seed-circles-capture.ts)
 * — not the shared e2e user, whose circle-less state the "circles
 * cold-start" capture depends on. The seeded circle carries a partner
 * member's current-week focus check-in, so the detail sheet shows the
 * focus timeline copy, the chosen-focus pulse line, and a live
 * "Back this focus" button; the focus sheet shows the six-option radio
 * list ordered for a strength_block circle.
 *
 * Same rig conventions as home.screens.capture.spec.ts: mobile
 * viewport, best-effort triggers with SHORT timeouts, one spec file =
 * fresh browser context (avoids the drained-webchannel starvation).
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

test.describe("circle weekly focus screenshots", () => {
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
    await shoot(page, `${name}-light`);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(350);
    await shoot(page, `${name}-dark`);
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  }

  test("circle detail + weekly focus sheet — light + dark", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("social?tab=crews");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });

    // The seeded circle renders as the FEATURED hero card
    // (SOCIAL-HOME-01) after the journeys+space reads settle — its
    // card body is the tap target and its accessible name includes
    // the circle title.
    await page
      .getByRole("button", { name: /autumn strength crew/i })
      .waitFor({ state: "visible", timeout: 15000 });
    await page
      .getByRole("button", { name: /autumn strength crew/i })
      .click({ timeout: 4000 });

    // Detail sheet ready once the primary action + the partner's focus
    // timeline row are in — that's the surface under review (pulse line,
    // focus copy, Back this focus). The featured card carries its OWN
    // "Set weekly focus" button, so sheet assertions are scoped to the
    // dialog to stay unambiguous.
    const detailSheet = page.getByRole("dialog");
    await detailSheet
      .getByRole("button", { name: /set weekly focus/i })
      .waitFor({ state: "visible", timeout: 15000 });
    await page
      .getByText(/is focusing on running this week/i)
      .first()
      .waitFor({ state: "visible", timeout: 10000 })
      .catch(() =>
        console.log(
          "[capture] partner focus row not visible — capturing the sheet as-is"
        )
      );
    await page.waitForTimeout(900);
    await shootLightDark(page, "circles-detail-focus");

    // The weekly focus sheet — six radio options + primary action.
    // Same dialog scoping: the page-level locator would also match the
    // featured card's button behind the sheet.
    await detailSheet
      .getByRole("button", { name: /set weekly focus/i })
      .click({ timeout: 4000 });
    await page
      .getByRole("radiogroup", { name: /weekly focus/i })
      .waitFor({ state: "visible", timeout: 8000 });
    // Select one option so the capture shows the selected state too.
    await page
      .getByRole("radio", { name: /lift with intention/i })
      .click({ timeout: 4000 })
      .catch(() => {
        /* option copy changed — capture the unselected sheet */
      });
    await page.waitForTimeout(700);
    await shootLightDark(page, "circles-focus-sheet");
  });
});
