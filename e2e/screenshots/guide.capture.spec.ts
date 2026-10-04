import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { verifySignupEmail } from "../helpers/verifySignupEmail";
import { emulatorActive } from "../helpers/emulator";
import { openSignUpForm } from "../helpers/auth";
import { settleImages } from "../helpers/settleImages";
import { GUIDE_UNDER_AUTOMATION_KEY } from "../../src/lib/firstGuide";

/**
 * The first-visit guide (FV1), on a brand-new account from sign-up: setup,
 * the offer's "Continue with Free" landing on Home, the three-stop walk,
 * a first-week row opening its step, and the hints on Food, Train and the
 * first set of the first workout.
 *
 * The guide never shows under automation, so no other spec meets it; this
 * one turns it on with its localStorage switch before the app loads. The
 * capture rig has no Functions emulator, so "Start my plan" is routed into
 * the real `completeOnboarding` handler with a verified emulator token,
 * as run-coaching.capture.spec.ts does for its callable: the account and
 * its plan are written by the code that writes them in production.
 */

const require = createRequire(import.meta.url);
test.use({ viewport: { width: 393, height: 852 } });

/** One frame in each theme. */
async function shoot(page: Page, name: string) {
  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark
    );
    await page.waitForTimeout(250);
    await settleImages(page);
    await page.screenshot({
      path: `screenshots/guide-${name}-${dark ? "dark" : "light"}.png`,
      animations: "disabled",
    });
  }
}

/** Routes the setup callable into its real exported handler. */
async function realCompleteOnboarding(page: Page) {
  const admin = require("firebase-admin");
  if (!admin.apps.length) admin.initializeApp({ projectId: "demo-tropos" });
  const { completeOnboarding } = require("../../functions/index.js");
  await page.route(
    "**/demo-tropos/us-central1/completeOnboarding",
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
          },
        });
        return;
      }
      const token = await admin.auth().verifyIdToken(
        route
          .request()
          .headers()
          .authorization.replace(/^Bearer /, "")
      );
      const result = await completeOnboarding.run(
        route.request().postDataJSON().data,
        { auth: { uid: token.uid, token } }
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ result }),
      });
    }
  );
}

/** A walk stop's or a hint's title. The walk's dialog element is a frame
 *  with no box of its own (its shield, spotlight and card are fixed or
 *  floating children), so a check on the title is a check on the card. */
function guideTitle(page: Page, name: string) {
  return page.getByRole("dialog").getByRole("heading", { name, exact: true });
}

/** The walk's main button, once its card is on screen. The button keeps
 *  focus from stop to stop while the card is hidden between them, so the
 *  check is that the card takes taps again (a trial click), which it does
 *  once it is in place. */
async function mainButton(page: Page, name: "Next" | "Done") {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeFocused({ timeout: 10_000 });
  await button.click({ trial: true, timeout: 10_000 });
  return button;
}

test("a new account meets the guide: the walk, a first-week row and the hints", async ({
  page,
}) => {
  test.skip(!emulatorActive, "emulator-only accounts");
  test.setTimeout(240_000);
  // Fades rather than the mark's flight, so a frame is the same each run.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((key: string) => {
    localStorage.setItem(key, "on");
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent =
        ".firebase-emulator-warning { display: none !important; }";
      document.head.append(style);
    });
  }, GUIDE_UNDER_AUTOMATION_KEY);
  await realCompleteOnboarding(page);

  // Sign up, and set up a lifting plan with the defaults.
  await page.goto("/");
  await openSignUpForm(page);
  const email = `guide-${Date.now()}@tropos.test`;
  await page.fill("#login-email", email);
  await page.fill("#login-password", "test-password-123");
  await page.getByRole("button", { name: /create account/i }).click();
  await verifySignupEmail(page, email);
  const next = () =>
    page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: /Build muscle/ }).click();
  await next();
  await next();
  await page.getByRole("button", { name: /Full gym/ }).click();
  await page.getByRole("button", { name: /New to lifting/ }).click();
  await next();
  await page.getByRole("button", { name: "None", exact: true }).click();
  await next();
  await page
    .getByRole("textbox", { name: "Weight (kg)", exact: true })
    .fill("80");
  await page
    .getByRole("textbox", { name: "Height (cm)", exact: true })
    .fill("178");
  await page.getByRole("radio", { name: /^25/ }).click();
  await next();
  await page
    .getByRole("button", { name: "Start my plan", exact: true })
    .click();

  // The offer, then Home: Continue with Free lands there now (FV1).
  await expect(
    page.getByRole("heading", { name: /your plan is ready/i })
  ).toBeVisible({ timeout: 30_000 });
  await page
    .getByRole("button", { name: "Continue with Free", exact: true })
    .click();
  await expect(page).toHaveURL(/\/Maiin\/$/);

  // The walk: today's session, the first week, food.
  await expect(page.getByRole("dialog")).toContainText(
    /Today’s workout|Your first workout/,
    { timeout: 20_000 }
  );
  await mainButton(page, "Next");
  await shoot(page, "walk-today");
  await (await mainButton(page, "Next")).click();
  await expect(guideTitle(page, "Your first week")).toBeVisible();
  await mainButton(page, "Next");
  await shoot(page, "walk-first-week");
  await (await mainButton(page, "Next")).click();
  await expect(guideTitle(page, "Food")).toBeVisible();
  await mainButton(page, "Done");
  await shoot(page, "walk-food");
  await (await mainButton(page, "Done")).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // A first-week row opens its step: Food, with the composer pointed out.
  await page
    .getByRole("button", { name: /Log your first meal/ })
    .click({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/food$/);
  await expect(guideTitle(page, "Logging food")).toBeVisible({
    timeout: 10_000,
  });
  // The composer sits low on the page, and the hint turns above it rather
  // than lie across the tab bar.
  const hint = await page.locator("[data-guide-hint]").boundingBox();
  const tabBar = await page
    .getByRole("navigation", { name: /main navigation/i })
    .boundingBox();
  expect(hint!.y + hint!.height).toBeLessThanOrEqual(tabBar!.y);
  await shoot(page, "hint-food");
  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Train's first visit: the order of the workouts.
  await page
    .getByRole("navigation", { name: /main navigation/i })
    .getByRole("link", { name: "Train" })
    .click();
  await expect(guideTitle(page, "Workouts go in order")).toBeVisible({
    timeout: 10_000,
  });
  await shoot(page, "hint-train");
  await page.getByRole("button", { name: "Got it", exact: true }).click();

  // The first set of the first workout, above the workout screen.
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .first()
    .click();
  await expect(guideTitle(page, "Your first set")).toBeVisible({
    timeout: 10_000,
  });
  await shoot(page, "hint-first-set");
});
