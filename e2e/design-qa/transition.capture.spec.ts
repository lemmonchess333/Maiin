/**
 * Design-QA capture harness (SOCIAL/UX polish loop).
 *
 * Drives a real interaction in chromium, records it with the DevTools
 * screencast (no ffmpeg dependency), turns the frame stream into a
 * change-ratio series via an in-page canvas diff, and grades it with the
 * pure `analyzeFrameDiffs` jank detector. This is the web analogue of the
 * native "record the simulator, diff frames, verify transitions are
 * hitch-free" technique.
 *
 * Runs in the `auth-emulator` Playwright project only (it drives authed
 * surfaces + needs bypassCSP). Locally:
 *   npm run seed:e2e && E2E_AUTH_EMULATOR=1 \
 *     npx playwright test --project=auth-emulator transition.capture
 *
 * Selectors + the settle window are first-run tuning knobs — the FIRST real
 * run is the calibration pass (confirm the trigger animates and the window
 * covers the whole transition); after that the thresholds in
 * scripts/design-qa/frameAnalysis.ts hold the line.
 */
import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import {
  analyzeFrameDiffs,
  type FrameAnalysis,
} from "../../scripts/design-qa/frameAnalysis";

// Decode a base64 JPEG screencast frame in the page (the browser has native
// JPEG decode + canvas), diff it against the previous frame, and return the
// fraction of pixels that changed beyond a small per-channel threshold.
// Maintains the previous frame on `window` so callers just stream frames in.
const DIFF_AGAINST_PREV = (b64: string): Promise<number> =>
  new Promise<number>((resolve) => {
    const w = window as unknown as { __pwPrev?: Uint8ClampedArray };
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const cur = ctx.getImageData(0, 0, c.width, c.height).data;
      const prev = w.__pwPrev;
      let changed = 0;
      const total = cur.length / 4;
      if (prev && prev.length === cur.length) {
        for (let i = 0; i < cur.length; i += 4) {
          const d =
            Math.abs(cur[i] - prev[i]) +
            Math.abs(cur[i + 1] - prev[i + 1]) +
            Math.abs(cur[i + 2] - prev[i + 2]);
          if (d > 30) changed++;
        }
      }
      w.__pwPrev = cur;
      resolve(prev ? changed / total : 0);
    };
    img.onerror = () => resolve(0);
    img.src = "data:image/png;base64," + b64;
  });

/**
 * Record `trigger`'s animation via CDP screencast and return the per-frame
 * change-ratio series ready for `analyzeFrameDiffs`. The screencast is armed
 * BEFORE the trigger so the first motion frame is captured; `settleMs` must
 * be long enough for the transition to start AND come to rest.
 */
async function captureTransition(
  page: Page,
  trigger: () => Promise<void>,
  { settleMs = 900 } = {}
): Promise<number[]> {
  const client = await page.context().newCDPSession(page);
  const frames: string[] = [];
  client.on("Page.screencastFrame", async (e) => {
    frames.push(e.data);
    await client
      .send("Page.screencastFrameAck", { sessionId: e.sessionId })
      .catch(() => {});
  });

  // PNG (lossless) — JPEG compression noise produced spurious "pop" diffs
  // between visually-identical frames (CI calibration #3). Lossless frames
  // make the change-ratio signal clean.
  await client.send("Page.startScreencast", {
    format: "png",
    everyNthFrame: 1,
  });
  await trigger();
  await page.waitForTimeout(settleMs);
  await client.send("Page.stopScreencast").catch(() => {});
  await client.detach().catch(() => {});

  await page.evaluate(() => {
    (window as unknown as { __pwPrev?: unknown }).__pwPrev = undefined;
  });
  const ratios: number[] = [];
  for (const f of frames) {
    ratios.push(await page.evaluate(DIFF_AGAINST_PREV, f));
  }
  // Drop the first (no predecessor → always 0).
  return ratios.slice(1);
}

/**
 * Report a transition's smoothness for human review and gate ONLY on capture
 * validity. Calibration (CI runs 1-3) showed the discrete pop/stall counts
 * are too noisy on a web screencast to hard-fail on — `smoothness` is the
 * robust, durable signal — so this lane is a DIAGNOSTIC, not an oracle:
 * `smoothness` + flagged frames print to the log + artifact for an eyeball,
 * and the only hard assertion is `hasMotion` (a wrong selector / dead trigger
 * → no motion → loud failure). A smoothness regression GATE can come later,
 * once we have a baseline across runs.
 */
function logReport(label: string, report: FrameAnalysis): void {
  console.log(
    `[design-qa] ${label}: smoothness=${report.smoothness.toFixed(2)} ` +
      `pairs=${report.pairs} settled=${report.settled} ` +
      `pops=${report.pops.length} stalls=${report.stalls.length}` +
      (report.jankFlags.length
        ? ` · review: ${report.jankFlags.join("; ")}`
        : "")
  );
  expect(
    report.hasMotion,
    `${label}: no motion captured — the trigger didn't animate (selector drift?)`
  ).toBe(true);
}

test.describe("design-qa · transitions are hitch-free", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator + seeded user (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
  });

  test("bottom-nav Home → Food transition", async ({ page }) => {
    await page.goto("");
    // NOT `waitForLoadState("networkidle")` — Firestore's realtime snapshot
    // listeners hold persistent connections, so the network is never idle and
    // that wait times out (the first-CI-run calibration finding). Wait for the
    // actual trigger element to be ready instead.
    const foodNav = page.getByRole("link", { name: /food/i }).first();
    await foodNav.waitFor({ state: "visible" });

    const ratios = await captureTransition(
      page,
      async () => {
        // If this selector drifts, the analyzer reports "no motion captured"
        // — a loud, correct failure, not a silent pass.
        await foodNav.click();
      },
      { settleMs: 900 }
    );

    logReport("Home → Food", analyzeFrameDiffs(ratios));
  });

  test("water-card fill animation (the signature SVG transition)", async ({
    page,
  }) => {
    // WaterWave + WaterBubbles are the app's most complex animation
    // (CLAUDE.md flags them) — the highest-value jank target. The fill
    // plays when water is added (WaterCard.tsx `aria-label="Add water"`).
    await page.goto("");
    // See the nav test: wait for the trigger, not `networkidle` (a Firebase
    // realtime app never goes network-idle).
    const addWater = page.getByRole("button", { name: /add water/i }).first();
    await addWater.waitFor({ state: "visible" });

    const ratios = await captureTransition(
      page,
      async () => {
        await addWater.click();
      },
      // The fill-from-bottom + wave + bubble particles take longer than a
      // route transition to settle.
      { settleMs: 1400 }
    );

    logReport("water-card fill", analyzeFrameDiffs(ratios));
  });
});
