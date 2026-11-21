/**
 * The iPhone Duo (docs/ios/iphone-duo.md): its outer display behaves like
 * any iPhone, its inner display open on its side lays Home, a workout and
 * a run out in two panes with the gap on the fold, and folding or
 * unfolding mid-workout or mid-run loses nothing.
 *
 * A fold is a resize of the same page (Apple: "a fold can resize your app
 * in the middle of a session"; the scene is not disconnected), so these
 * resize the page between the outer and inner sizes and check what a
 * person would lose: a weight half typed in a focused field, a sheet left
 * open, a rest counting down, a run's clock and distance. They check the
 * same elements are still there, not new ones drawn in their place.
 *
 * The sizes are src/test/iphoneDuo.ts's, all touch screens, since the
 * wide layouts answer a coarse pointer only. What only the phone can show
 * (the status bar's side column, the crease, the scene surviving a fold)
 * is in docs/qa/pre-launch-backlog.md.
 */
import {
  test,
  expect,
  type ElementHandle,
  type Locator,
  type Page,
} from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { settleImages } from "../helpers/settleImages";
import { sizeTo, type ScreenSize } from "../helpers/screenSize";
import { IPHONE_DUO } from "../../src/test/iphoneDuo";

const OUTER = { ...IPHONE_DUO.outer, touch: true };
const INNER = { ...IPHONE_DUO.innerLandscape, touch: true };
const STANDING = { ...IPHONE_DUO.innerPortrait, touch: true };

const START = { latitude: 51.5074, longitude: -0.1657 };
test.use({
  geolocation: { ...START, accuracy: 5 },
  permissions: ["geolocation"],
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

async function shoot(page: Page, name: string) {
  await settleImages(page);
  await page.screenshot({
    animations: "disabled",
    path: `screenshots/${name}.png`,
  });
}

/** Resizes as a fold does, and lets the layout and its listeners settle. */
async function fold(page: Page, size: ScreenSize) {
  await sizeTo(page, size);
  await page.waitForTimeout(700);
}

/** True when the locator now finds the very element held before. */
async function same(page: Page, held: ElementHandle, now: Locator) {
  const found = await now.elementHandle();
  return page.evaluate(([x, y]) => x === y, [held, found] as const);
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("not on screen");
  return b;
}

test.describe("iPhone Duo", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          ".firebase-emulator-warning{display:none !important}";
        document.head.appendChild(style);
      });
    });
  });

  test("Home: one column on the outer display, two panes open", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await sizeTo(page, OUTER);
    await signInAsTestUser(page);
    await page.goto("");
    const training = page.getByRole("group", { name: "Today’s training" });
    const water = page.getByRole("button", { name: /add water/i }).first();
    await training.waitFor({ timeout: 20_000 });
    await water.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1200);

    // The outer display is a phone: everything in one column.
    let t = await box(training);
    let w = await box(water);
    expect(w.y).toBeGreaterThan(t.y + t.height);
    await shoot(page, "duo-home-outer");

    // Open on its side: training on one side, food and water on the
    // other, the gap between them on the fold.
    await fold(page, INNER);
    t = await box(training);
    w = await box(water);
    const middle = INNER.width / 2;
    expect(t.x + t.width).toBeLessThanOrEqual(middle);
    expect(w.x).toBeGreaterThanOrEqual(middle);
    await shoot(page, "duo-home-inner");

    // Standing up, the inner display is one column again, and a sheet
    // keeps a phone's width over the page instead of the whole display.
    await fold(page, STANDING);
    t = await box(training);
    w = await box(water);
    expect(w.y).toBeGreaterThan(t.y + t.height);
    await shoot(page, "duo-home-standing");

    // And back to the outer display: the page it left.
    await fold(page, OUTER);
    expect(await training.isVisible()).toBe(true);
  });

  test("a workout: the list beside the sets, and a fold mid-set keeps everything", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await sizeTo(page, OUTER);
    await signInAsTestUser(page);
    await page.goto("program");
    const start = page.getByRole("button", {
      name: "Start workout",
      exact: true,
    });
    await start.waitFor({ timeout: 20_000 });
    await start.click();
    const complete = page.getByRole("button", { name: /^Complete / }).first();
    await complete.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1200);

    // The first set done, so a rest is counting down over the fold.
    const weights = page.getByRole("spinbutton", { name: /weight$/ });
    for (const field of await weights.all())
      if ((await field.getAttribute("placeholder")) === "–")
        await field.fill("20");
    await complete.click();
    await page.waitForTimeout(600);
    const rest = page.getByRole("group", { name: "Rest timer" });
    const resting = await rest.isVisible().catch(() => false);

    // A weight half typed in the next set, the field still focused.
    const current = page.locator('[aria-current="step"]').first();
    const field = page.getByRole("spinbutton", { name: /weight$/ }).nth(1);
    await field.click();
    await field.fill("");
    await field.pressSequentially("6");
    const held = (await field.elementHandle())!;
    await shoot(page, "duo-workout-outer");

    // Unfold.
    await fold(page, INNER);
    const fieldAfter = page.getByRole("spinbutton", { name: /weight$/ }).nth(1);
    expect(await same(page, held, fieldAfter)).toBe(true);
    await expect(fieldAfter).toHaveValue("6");
    expect(
      await fieldAfter.evaluate((el) => el === document.activeElement)
    ).toBe(true);
    if (resting) await expect(rest).toBeVisible();

    // Two panes: the exercises named down the leading half, the sets in
    // the trailing half.
    const middle = INNER.width / 2;
    const listed = await box(current);
    expect(listed.x + listed.width).toBeLessThanOrEqual(middle);
    expect((await box(fieldAfter)).x).toBeGreaterThanOrEqual(middle);
    const name = await current.getAttribute("aria-label");
    expect(name).toBeTruthy();
    await expect(current).toContainText(name!.replace(/, (done|skipped)$/, ""));
    await shoot(page, "duo-workout-inner");

    // Finish the number and fold again: still the same field, still there.
    await fieldAfter.pressSequentially("2");
    await fold(page, OUTER);
    const folded = page.getByRole("spinbutton", { name: /weight$/ }).nth(1);
    expect(await same(page, held, folded)).toBe(true);
    await expect(folded).toHaveValue("62");
    if (resting) await expect(rest).toBeVisible();

    // A sheet left open over the fold stays open.
    await page
      .getByRole("button", { name: /^More for / })
      .first()
      .click();
    const sheet = page.getByRole("dialog").first();
    await sheet.waitFor({ timeout: 10_000 });
    await fold(page, INNER);
    await expect(sheet).toBeVisible();
    const s = await box(sheet);
    expect(s.width).toBeLessThanOrEqual(520);
    await shoot(page, "duo-workout-sheet-inner");
    await page.keyboard.press("Escape");
  });

  test("a run: the map beside its figures, and a fold mid-run keeps the clock", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await sizeTo(page, OUTER);
    await signInAsTestUser(page);
    await page.goto("run");
    await page.waitForTimeout(2500);
    const freeRun = page.getByRole("button", { name: /free run/i }).first();
    const launch = page
      .getByRole("button", { name: /^start( run)?$/i })
      .first();
    const entered = await freeRun
      .click({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!entered) await launch.click({ timeout: 10_000 });
    const walk = async (from: number, steps: number) => {
      for (let i = from; i < from + steps; i++) {
        await page.context().setGeolocation({
          latitude: START.latitude + (i * 6) / 111_320,
          longitude: START.longitude,
          accuracy: 5,
        });
        await page.waitForTimeout(1500);
      }
    };
    await walk(0, 5);
    const time = page.getByTestId("run-hud-time");
    await expect(time).toBeVisible();
    const seconds = async () => {
      const [m, s] = ((await time.textContent()) ?? "0:0")
        .trim()
        .split(":")
        .slice(-2)
        .map(Number);
      return m * 60 + s;
    };
    const before = await seconds();
    const clock = (await time.elementHandle())!;
    await shoot(page, "duo-run-outer");

    // Unfold: the same clock, still running, docked beside the map.
    await fold(page, INNER);
    await walk(5, 2);
    expect(await same(page, clock, page.getByTestId("run-hud-time"))).toBe(
      true
    );
    expect(await seconds()).toBeGreaterThan(before);
    const panel = page.locator("[data-docked]");
    await expect(panel).toBeVisible();
    const p = await box(panel);
    expect(Math.abs(p.x - INNER.width / 2)).toBeLessThanOrEqual(2);
    expect(p.y).toBeLessThanOrEqual(1);
    await expect(
      page.getByRole("button", { name: /pause/i }).first()
    ).toBeVisible();
    await shoot(page, "duo-run-inner");

    // Fold again: no reset, the panel back as a sheet.
    const opened = await seconds();
    await fold(page, OUTER);
    await walk(7, 2);
    expect(await seconds()).toBeGreaterThan(opened);
    await expect(page.locator("[data-docked]")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /pause/i }).first()
    ).toBeVisible();
  });
});
