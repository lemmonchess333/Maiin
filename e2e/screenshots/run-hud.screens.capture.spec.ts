/**
 * The live run HUD — the one product surface with NO frames at all.
 *
 * This exists to unblock D18 in docs/design-backlog.md, which says so
 * explicitly: `RunBottomSheet` carries ~15 hardcoded 8-9px labels against a
 * documented 11px accessibility floor, on the screen people read while
 * moving and often outdoors, and the fix was deliberately NOT attempted
 * because nothing could show the result. "Sequence: add an active-run
 * capture spec first, then raise the sizes against it." This is that spec.
 *
 * Why it can be driven at all: `useGPS` uses plain
 * `navigator.geolocation.watchPosition`, which Chromium emulates from
 * `context.setGeolocation`. Each call delivers one fix, so walking a short
 * path in a loop is what moves the page through its phases — waiting →
 * acquiring (needs one fix) → countdown (3s) → active — and what
 * accumulates the distance and pace the HUD is there to display. Accuracy
 * is 5m because `getSignalQuality` calls <= 8 "strong"; a looser value
 * would park the page in acquiring behind the GOOD_FIX_M gate.
 *
 * The HUD is DARK-ONLY by construction (`text-white` throughout,
 * `THEME.bg` behind it), so unlike every other capture spec there is no
 * light variant to shoot and no theme toggle to settle.
 *
 * It asserts the HUD is really up before shooting, and fails if not. That
 * is deliberate: a spec that shoots whatever it reaches produces a frame
 * that lies about what it shows, and this session already lost an
 * investigation to one of those.
 *
 * Selectors used here are pinned against the real components by
 * `src/components/run/__tests__/runHudCaptureSelectors.test.tsx`, so the
 * usual failure mode of blind e2e authoring — a label that never matched,
 * or stopped matching — surfaces in the unit suite in seconds rather than
 * as a timeout in CI.
 */
import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

/* A short run in Hyde Park, at a pace the app will actually ACCEPT.
   `isValidReading` rejects any fix implying more than 12 m/s — the
   athlete-plausibility gate — and separately rejects any fix within 1m of
   the previous one. The first version of this spec stepped ~40m every
   400ms: 100 m/s, eight times over the limit, so every fix after the first
   was discarded and the HUD sat at 0.00 km however long it walked. The
   frame still looked plausible, which is what made it worth writing down.

   6m every 2s is 3 m/s — about 5:33/km, a real runner's pace — so the
   distance AND the elapsed timer stay consistent with each other in the
   frame rather than implying a 36 km/h sprint. */
const START = { latitude: 51.5074, longitude: -0.1657 };
const STEP_M = 6;
const INTERVAL_MS = 2000;
/** Metres per degree of latitude; longitude is held constant. */
const STEP_DEG = STEP_M / 111_320;

test.use({
  viewport: { width: 393, height: 852 },
  geolocation: { ...START, accuracy: 5 },
  permissions: ["geolocation"],
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("live run HUD", () => {
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

  /** Deliver `count` fixes, walking north. One fix per setGeolocation. */
  async function walk(page: Page, count: number, fromIndex = 0) {
    for (let i = 0; i < count; i += 1) {
      await page.context().setGeolocation({
        latitude: START.latitude + (fromIndex + i) * STEP_DEG,
        longitude: START.longitude,
        accuracy: 5,
      });
      await page.waitForTimeout(INTERVAL_MS);
    }
  }

  test("active HUD with a run in progress", async ({ page }) => {
    test.setTimeout(300_000);

    await page.goto("run");
    await page.waitForLoadState("domcontentloaded");

    /* Freeform users land on the tile picker; "Free Run" is the first
       outdoor tile (ACTIVITY_TYPES[0].name in runConfigDefaults.ts). A
       programme user would get RunLaunchCard instead, so accept either
       entry rather than assuming which one the seed produces. */
    const freeRun = page.getByRole("button", { name: /free run/i }).first();
    const launch = page
      .getByRole("button", { name: /^start( run)?$/i })
      .first();

    const entered = await freeRun
      .click({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!entered) {
      await launch.click({ timeout: 15_000 });
    }

    /* Two walks, not one, and the split matters. The first only has to
       reach the active phase: acquiring needs a single fix, then the
       countdown burns three seconds during which fixes still stream but
       the timer has not started. The FIRST version of this spec walked
       once, for 14 steps, and the resulting frame read 0:02 / 0.00 km /
       --:-- — the HUD captured, but every value it exists to display at
       zero, and the live-pace label never in its real state.

       So: walk enough to get in, assert, then keep walking so distance
       and rolling pace are real when the shutter goes. */
    // One fix leaves acquiring; the countdown is 3s. Four fixes at this
    // cadence covers both with margin.
    await walk(page, 4);

    /* Assert the HUD is really up before shooting. `Pause run` is the
       primary control and exists only in the active/paused phases. */
    const pause = page.getByRole("button", { name: /^pause run$/i });
    await expect(
      pause,
      "the run never reached the active phase — the frame would show the " +
        "setup screen or the countdown while claiming to be the HUD"
    ).toBeVisible({ timeout: 30_000 });

    /* 25 more at 6m — ~150m over 50s, which is all the frame needs: every
       figure and unit label rendering in a real state rather than at zero.
       Sized against the BUDGET, not against what would be nice. The capture
       job caps at 15 minutes, `workers: 1` makes it serial, and
       `retries: 2` means a failure costs this test's wall-clock THREE
       times. 300m would have been 108s of deliberate waiting, so 5.4
       minutes on the retry path for one frame. 150m proves the same thing
       for half. */
    await walk(page, 25, 4);

    await page.screenshot({
      animations: "disabled",
      path: "screenshots/run-hud-active.png",
      fullPage: false,
    });

    /* The sheet opens EXPANDED (`snapIdx` starts at 2), so the frame above
       already carries the metric grid D18 is about — the 18px and 22px
       figures with their 8px captions. There is deliberately no "expand"
       step here: `Expand bottom sheet` renders only while the sheet is
       COLLAPSED, so clicking it from the default state would have waited
       for a control that cannot exist. (Caught by the unit pin, not by a
       CI timeout — which is the whole point of that file.)

       What IS worth more frames is the other direction. The sheet now has
       THREE snaps (expanded → splits middle → compact bar): one ArrowDown
       lands the splits detent — on this 150m walk that films its designed
       sub-first-lap state (current-lap progress bar + "splits appear
       after each km"), which is exactly why that state exists as real
       copy rather than an empty box — and a second ArrowDown lands the
       compact bar. The drag handle takes ArrowDown, which is a far
       steadier way to step through them than synthesising pointer
       drags. */
    const handle = page.getByRole("button", {
      name: /drag to resize the run panel/i,
    });
    const stepped = await handle
      .focus({ timeout: 4_000 })
      .then(async () => {
        await handle.press("ArrowDown");
        return true;
      })
      .catch(() => false);
    if (stepped) {
      await page.waitForTimeout(700);
      await page.screenshot({
        animations: "disabled",
        path: "screenshots/run-hud-splits.png",
        fullPage: false,
      });
      await handle.press("ArrowDown").catch(() => {});
      await page.waitForTimeout(700);
      await page.screenshot({
        animations: "disabled",
        path: "screenshots/run-hud-compact.png",
        fullPage: false,
      });
      // Back up to the expanded snap (two steps) so the paused frame
      // below is comparable to the active one.
      await handle.press("ArrowUp").catch(() => {});
      await handle.press("ArrowUp").catch(() => {});
      await page.waitForTimeout(700);
    }

    // Paused reveals the Resume/Stop pair, which is where the smallest
    // labels in the sheet sit.
    await pause.click({ timeout: 4_000 }).catch(() => {});
    await page.waitForTimeout(600);
    const resume = page.getByRole("button", { name: /^resume run$/i });
    if (await resume.isVisible().catch(() => false)) {
      await page.screenshot({
        animations: "disabled",
        path: "screenshots/run-hud-paused.png",
        fullPage: false,
      });
    }
  });
});
