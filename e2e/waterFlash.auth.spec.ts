/**
 * The water total must never travel backwards while you are adding.
 *
 * A tap is optimistic: the action goes in a local queue and the card
 * renders snapshot + queue. `flushWater` then commits a transaction and
 * drops the queue entry immediately, because the flush loop would
 * otherwise spin on it forever — but the listener is a separate
 * round-trip. For the window between the commit and the snapshot the
 * card had a fresh server total nowhere to read and no queued action
 * left to add, so it rendered the figure from BEFORE the tap and jumped
 * forward again once the snapshot landed.
 *
 * Measured in this rig across four taps before the fix: three dips of
 * 18ms, 16ms and 15ms, each showing the previous value. Short, but the
 * fill is a spring animation, so a dip that brief still reads as the
 * whole card flashing — which is how it was reported.
 *
 * Asserted here rather than in jsdom because the gap IS the round-trip.
 * The unit fake delivers snapshots on a drained microtask queue, so the
 * window this covers does not exist there and a unit test would pass
 * against the bug. `settledWater` / `retireSettled` carry the overlay;
 * their own semantics are pinned in `waterActions.test.ts`.
 */
import { test, expect, type Page } from "@playwright/test";
import { emulatorActive } from "../e2e/helpers/emulator";
import { suppressCoachmarks } from "./helpers/suppressCoachmarks";

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const DOCS = `http://${FS_HOST}/v1/projects/demo-tropos/databases/(default)/documents`;

test.use({
  viewport: { width: 390, height: 844 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

async function uidByEmail(email: string): Promise<string> {
  const r = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/demo-tropos/accounts:query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer owner",
      },
      body: "{}",
    }
  );
  const { userInfo } = (await r.json()) as {
    userInfo?: { localId: string; email?: string }[];
  };
  const id = userInfo?.find((u) => u.email === email)?.localId;
  if (!id) throw new Error(`user ${email} not found in the auth emulator`);
  return id;
}

/**
 * Record every CHANGE to the rendered water figure, one sample per frame,
 * NORMALISED TO MILLILITRES.
 *
 * Two things this has to survive, both of which broke it once.
 *
 * It used to locate the numeral by the "/ target" denominator. The card
 * no longer renders a target, so that matched nothing, `read()` returned
 * null every frame, and the run came back with an EMPTY sample list —
 * which the `adds.length > 3` guard below is what caught. Without that
 * guard a monotonic check over zero samples passes, and this spec would
 * have gone quietly blind instead of red.
 *
 * And the figure now carries its own unit, so a burst that crosses a
 * litre renders 750 ml then 1 L. Comparing bare figures would read
 * 750 -> 1 as travelling backwards and fail on correct behaviour, so the
 * unit is folded in. What this spec is about — a frame showing the total
 * from BEFORE the tap — is a change in VOLUME, not in how it is spelled.
 */
async function startSampling(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __water: number[] };
    w.__water = [];
    const read = () => {
      // "750ml" / "1L" / "4.5L" — value plus its unit span, no space
      // between them in textContent. The weight tile ("100.0kg") and the
      // macro figures ("0g") cannot match this shape.
      const RE = /^(\d+(?:\.\d+)?)\s*(ml|L)$/;
      const el = Array.from(document.querySelectorAll("p")).find((p) =>
        RE.test((p.textContent ?? "").trim())
      );
      const m = (el?.textContent ?? "").trim().match(RE);
      if (!m) return null;
      return m[2] === "L" ? Number(m[1]) * 1000 : Number(m[1]);
    };
    const loop = () => {
      const v = read();
      if (v !== null && w.__water[w.__water.length - 1] !== v)
        w.__water.push(v);
      requestAnimationFrame(loop);
    };
    loop();
  });
}

const samples = (page: Page) =>
  page.evaluate(() => (window as unknown as { __water: number[] }).__water);

test.describe("water total never travels backwards mid-tap", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test("a burst of adds only ever increases the figure", async ({ page }) => {
    test.setTimeout(180_000);
    await suppressCoachmarks(page);

    const email = `waterflash-${Date.now()}-${Math.floor(Math.random() * 1e6)}@tropos.test`;
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", { name: /sign up/i })
      .click({ timeout: 20_000 });
    await page.fill("#login-email", email);
    await page.fill("#login-password", "test-password-123");
    await page
      .getByRole("button", { name: /create account/i })
      .click({ timeout: 8000 });
    await page
      .getByRole("button", { name: /build muscle/i })
      .waitFor({ state: "visible", timeout: 30_000 });

    const res = await fetch(
      `${DOCS}/users/${await uidByEmail(email)}?updateMask.fieldPaths=onboardingComplete`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer owner",
        },
        body: JSON.stringify({
          fields: { onboardingComplete: { booleanValue: true } },
        }),
      }
    );
    expect(res.ok, "seeding onboardingComplete failed").toBe(true);

    await page.goto("/Maiin/");
    await page.waitForLoadState("domcontentloaded");
    const plus = page.getByRole("button", { name: /add \d+ ml/i }).first();
    await plus.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(2000);
    for (let i = 0; i < 8; i++) {
      const open = await page
        .getByRole("dialog")
        .isVisible()
        .catch(() => false);
      if (!open) break;
      await page.mouse.click(8, 8);
      await page.waitForTimeout(300);
    }

    await startSampling(page);
    for (let i = 0; i < 4; i++) {
      await plus.click();
      await page.waitForTimeout(900);
    }
    await page.waitForTimeout(1500);

    const adds = await samples(page);
    // The run has to have DONE something, or a monotonic check over one
    // sample passes for the wrong reason.
    expect(
      adds.length,
      `expected the figure to move; saw ${JSON.stringify(adds)}`
    ).toBeGreaterThan(3);
    const backwards = adds.filter((v, i) => i > 0 && v < adds[i - 1]);
    expect(
      backwards,
      `the water figure fell back mid-tap: ${JSON.stringify(adds)}. Each drop is ` +
        `a frame showing the total from before the tap, between the commit and ` +
        `the snapshot that confirms it.`
    ).toEqual([]);

    // The same gap exists on the way down, so the minus button gets the
    // paired check rather than being assumed symmetric.
    await page.evaluate(() => {
      (window as unknown as { __water: number[] }).__water = [];
    });
    const minus = page.getByRole("button", { name: /remove \d+ ml/i }).first();
    for (let i = 0; i < 2; i++) {
      await minus.click();
      await page.waitForTimeout(900);
    }
    await page.waitForTimeout(1500);

    const removes = await samples(page);
    expect(
      removes.length,
      "expected the figure to move on remove"
    ).toBeGreaterThan(1);
    const forwards = removes.filter((v, i) => i > 0 && v > removes[i - 1]);
    expect(
      forwards,
      `the water figure jumped up mid-remove: ${JSON.stringify(removes)}`
    ).toEqual([]);
  });
});
