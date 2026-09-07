import { test, expect, type Page } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import { signInAsTestUser } from "../helpers/auth";
import { settleImages } from "../helpers/settleImages";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

test.use({ viewport: { width: 375, height: 852 } });
async function capture(page: Page, name: string) {
  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark
    );
    await settleImages(page);
    await page.screenshot({
      path: `screenshots/designer-${name}-${dark ? "dark" : "light"}.png`,
      animations: "disabled",
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  if (!name.startsWith("home")) {
    const undersized = await page.getByRole("button").evaluateAll((buttons) =>
      buttons
        .filter((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && (rect.width < 43.5 || rect.height < 43.5);
        })
        .map((button) => button.textContent)
    );
    expect(undersized).toEqual([]);
    const narrowUnits = await page.getByRole("radio").evaluateAll((buttons) =>
      buttons
        .filter((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && (rect.width < 43.5 || rect.height < 43.5);
        })
        .map((button) => button.textContent)
    );
    expect(narrowUnits).toEqual([]);
  }
}
test.beforeEach(async ({ page }) => {
  test.skip(!emulatorActive, "emulator-only accounts");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() =>
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent =
        ".firebase-emulator-warning { display: none !important; }";
      document.head.append(style);
    })
  );
});
test("free running, typed metrics, editable review and recoverable commit", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.fill("#login-email", `designer-${Date.now()}@tropos.test`);
  await page.fill("#login-password", "test-password-123");
  await page.getByRole("button", { name: /create account/i }).click();
  const next = () =>
    page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true })
  ).toBeDisabled();
  await capture(page, "aim");
  await page.getByRole("button", { name: /Build muscle/ }).click();
  await next();
  await page.getByRole("radio", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: /Mon:/ }).click();
  await capture(page, "draft-week");
  await next();
  await page.getByRole("button", { name: /Regular runner/ }).click();
  await expect(
    page.getByText("Run when it suits you. Tropos won’t schedule your runs.")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /: (run|lift and run)$/ })
  ).toHaveCount(0);
  await next();
  await page.getByRole("button", { name: /New to lifting/ }).click();
  await next();
  await page.getByRole("button", { name: "None", exact: true }).click();
  await next();
  await page.getByRole("radio", { name: "lb", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Weight (lb)", exact: true })
    .fill("180.0");
  await page.getByRole("radio", { name: "st", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Weight (st)", exact: true })
  ).toHaveValue("12");
  await capture(page, "body-scale");
  await next();
  await expect(
    page.getByText("Free running · no scheduled runs")
  ).toBeVisible();
  await capture(page, "review");
  await page
    .getByRole("button", { name: "Edit lift sessions", exact: true })
    .click();
  await page.getByRole("radio", { name: "3", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to review", exact: true })
    .click();
  await page.getByLabel("Your public display name").fill("My training name");
  await page.reload();
  await expect(page.getByText("3 per week")).toBeVisible();
  await expect(page.getByLabel("Your public display name")).toHaveValue(
    "My training name"
  );
  // The capture rig has no callable emulator. Intercept the boundary to verify
  // failure recovery; no production writes and no fake success screen.
  let requests = 0;
  await page.route("**/completeOnboarding", (route) => {
    requests++;
    return route.fulfill({
      status: 403,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        error: { status: "PERMISSION_DENIED", message: "capture test" },
      }),
    });
  });
  await page
    .getByRole("button", { name: "Create my plan", exact: true })
    .click();
  await expect(page.getByText(/We couldn’t save your plan/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try creating my plan again" })
  ).toBeEnabled();
  expect(requests).toBe(1);
  await capture(page, "save-retry");
});
/**
 * Home's reading order at 375px: the week strip, then the week's verdict,
 * then today's task — with the task still inside the first viewport.
 *
 * The order of the last two flipped by owner decision (2026-09-07): the
 * performance ring sits under the week strip, so the strip says which days
 * you trained and the ring says what they added up to, read as one answer
 * before the page moves on to today. What is NOT negotiable, and is what
 * this test exists for, is that putting the ring up there must not push the
 * session card below the fold.
 *
 * The progress locator matches on the href rather than the accessible name.
 * The name is composed from live data on the full card ("Performance Index
 * 92, Backing off"), and a fixed string here matched only the compact
 * rendering that #2187 removed — which is how this spec silently stopped
 * finding the card at all. The emulator capture lane is `continue-on-error`,
 * so nothing failed when it did.
 */
test("Home leads with today's task and puts the week's verdict below it, task above the fold, at 375 px", async ({
  page,
}) => {
  await suppressCoachmarks(page);
  await signInAsTestUser(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: /add water/i })
    .first()
    .waitFor();
  const training = page.getByLabel("Today’s training");
  await expect(training.getByRole("button").first()).toBeVisible({
    timeout: 20000,
  });
  let clearFrames = 0;
  for (let i = 0; i < 60 && clearFrames < 5; i++) {
    const seal = page.getByRole("button", { name: /Break the seal/ });
    const nice = page
      .getByRole("dialog")
      .getByRole("button", { name: "Nice", exact: true });
    if (await seal.isVisible().catch(() => false)) {
      await seal.click();
      clearFrames = 0;
    } else if (await nice.isVisible().catch(() => false)) {
      await nice.click();
      clearFrames = 0;
    } else if (
      await page
        .getByRole("dialog")
        .isVisible()
        .catch(() => false)
    ) {
      await page.mouse.click(8, 8);
      clearFrames = 0;
    } else clearFrames++;
    await page.waitForTimeout(250);
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await training.getByRole("button").first().boundingBox())!.y
  ).toBeLessThan(760);
  const progress = page.locator('a[href$="/history#performance"]').first();
  const task = page.getByLabel("Today’s training");
  // Reading order and the first viewport are captured even for a rest-day fixture.
  await expect(progress).toBeAttached();
  await expect(task).toBeVisible();
  // Today's action leads; the week's verdict follows it. The first thing on
  // the scroll should be something to do today rather than a score for the
  // week just gone — a rest day especially should not open on a verdict.
  expect((await task.boundingBox())!.y).toBeLessThan(
    (await progress.boundingBox())!.y
  );
  // Kept, though it is the weaker of the two now that the task leads: it
  // still catches anything large being inserted above it.
  expect((await task.boundingBox())!.y).toBeLessThan(650);
  await capture(page, "home");
});
