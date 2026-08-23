/**
 * ExperienceSuggestionCard capture (design-review channel).
 *
 * The card renders NULL without classifier evidence, so no ordinary seed
 * ever shows it — which is how it shipped without the light/dark
 * screenshot pass the design rules require. `seed-experience-capture.ts`
 * builds the evidence (a beginner with six stalled weekly sessions on two
 * mains); this walks to the Programme lift tab and captures the card in
 * both themes.
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

const CAPTURE_USER = {
  email: "experience-capture@tropos.test",
  password: "test-password-123",
};

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("experience suggestion screenshots", () => {
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

  test("programme lift tab with the suggestion card — light + dark", async ({
    page,
  }) => {
    await page.goto("program");
    // The card's title is the render proof — if the classifier or the seed
    // regresses, this times out rather than capturing a null render.
    await page
      .getByText("Ready for intermediate programming?")
      .waitFor({ state: "visible", timeout: 20000 });

    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(350);
    await shoot(page, "experience-suggestion-light");

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(350);
    await shoot(page, "experience-suggestion-dark");

    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  });
});
