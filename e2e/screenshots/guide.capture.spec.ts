import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { verifySignupEmail } from "../helpers/verifySignupEmail";
import { emulatorActive } from "../helpers/emulator";
import { openSignUpForm } from "../helpers/auth";
import { settleImages } from "../helpers/settleImages";
import { GUIDE_UNDER_AUTOMATION_KEY } from "../../src/lib/firstGuide";

/**
 * The optional guide and first-use hints, on a version 2 account from
 * sign-up: setup lands on Today with no automatic walk, Food's hint works
 * before a walk is played, Settings replays the walk, and the Train,
 * first-set and first-run hints still work at their point of use.
 *
 * The guide never shows under automation, so no other spec meets it; this
 * one turns it on with its localStorage switch before the app loads. The
 * capture rig has no Functions emulator, so "Go to Today" is routed into
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

test("a new account can start training before replaying the guide", async ({
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
    .getByRole("textbox", { name: "Your public display name" })
    .fill("Guide tester");
  await page.getByRole("button", { name: "Go to Today", exact: true }).click();

  // The saved plan opens Today with the training task ready and no tour or
  // offer in the way. Food remains available in the tab bar.
  await expect(
    page.getByRole("heading", { name: "Today", level: 1 })
  ).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/Maiin\/$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your first week" })
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Finish your first workout")).toBeVisible();
  await expect(page.getByText("Log your first meal")).toHaveCount(0);
  await expect(page.getByText("Weigh in on three mornings")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await shoot(page, "first-home");

  // A contextual hint appears even though the automatic walk did not run.
  await page
    .getByRole("navigation", { name: /main navigation/i })
    .getByRole("link", { name: "Food" })
    .click();
  await expect(guideTitle(page, "Logging food")).toBeVisible({
    timeout: 10_000,
  });
  const hint = await page.locator("[data-guide-hint]").boundingBox();
  const tabBar = await page
    .getByRole("navigation", { name: /main navigation/i })
    .boundingBox();
  expect(hint!.y + hint!.height).toBeLessThanOrEqual(tabBar!.y);
  const proLine = page.getByText("Photo logging is part of Pro");
  await expect(proLine).toHaveCount(0);
  await shoot(page, "hint-food");
  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(proLine).toBeVisible();

  // Settings keeps the optional walk available for later replay.
  await page.goto("settings/support-legal");
  await page.getByRole("link", { name: /Show me around/ }).click();
  await expect(page).toHaveURL(/\/Maiin\/$/);

  // The replay still teaches today's session, the first week, and food.
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

  // The run screen before a first run, pointing at what starts one. The
  // position given is too rough to start on, so the run waits at "Acquiring
  // GPS..." with its Cancel rather than starting to record.
  await page.context().grantPermissions(["geolocation"]);
  await page
    .context()
    .setGeolocation({ latitude: 51.5074, longitude: -0.1657, accuracy: 500 });
  await page.goto("run");
  const firstRun = guideTitle(page, "Your first run");
  await expect(firstRun).toBeVisible({ timeout: 15_000 });
  await shoot(page, "hint-first-run");
  // Tapping the thing it points at closes it and starts the run.
  const startsRun = page.locator('[data-guide-anchor="first-run"]');
  const isButton = await startsRun.evaluate((el) => el.tagName === "BUTTON");
  await (isButton ? startsRun : startsRun.getByRole("button").first()).click();
  await expect(firstRun).toHaveCount(0);
  await expect(page.getByText("Acquiring GPS...")).toBeVisible({
    timeout: 10_000,
  });
  await expect(startsRun).toHaveCount(0);
  // Once seen, it is not shown again: back on this screen after Cancel, or
  // on a later visit. The seen mark is read first, so the waits below are
  // waiting on a hint that has been told not to come.
  const seen = await page.evaluate(() =>
    Object.keys(localStorage).some(
      (k) =>
        k.endsWith(":tropos-guide-hint:first-run") &&
        localStorage.getItem(k) === "1"
    )
  );
  expect(seen).toBe(true);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(startsRun).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(3_500);
  await expect(firstRun).toHaveCount(0);
  await page.goto("run");
  await expect(startsRun).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(3_500);
  await expect(firstRun).toHaveCount(0);
});
