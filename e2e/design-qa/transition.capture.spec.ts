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
import { analyzeFrameDiffs } from "../../scripts/design-qa/frameAnalysis";

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
    img.src = "data:image/jpeg;base64," + b64;
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

  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality: 70,
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
    await page.waitForLoadState("networkidle");

    const ratios = await captureTransition(
      page,
      async () => {
        // Tropos bottom nav. If this selector drifts, the analyzer reports
        // "no motion captured" — a loud, correct failure, not a silent pass.
        await page.getByRole("link", { name: /food/i }).first().click();
      },
      { settleMs: 900 }
    );

    const report = analyzeFrameDiffs(ratios);
    expect(
      report.ok,
      `transition jank — ${report.jankFlags.join("; ")} ` +
        `(pairs=${report.pairs}, smoothness=${report.smoothness.toFixed(2)})`
    ).toBe(true);
  });
});
