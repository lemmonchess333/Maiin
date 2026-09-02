/**
 * Form-demo capture — the figures themselves, on the real surface.
 *
 * The capture channel had no spec that reached a Form demo, so every
 * owner review of the rig art has been a phone screenshot pasted into
 * chat. This drives the real journey (Analytics -> exercise -> Form)
 * and shoots the demo card for five exercises, light and dark.
 *
 * REDUCED MOTION IS DELIBERATE. The shipped player loops on rAF, which
 * `animations: "disabled"` does not stop (that flag freezes CSS/Web
 * animations only), so an unforced capture lands on whatever frame the
 * loop had reached — nondeterministic, and every run would churn the
 * diff report. Under `prefers-reduced-motion` the player renders its
 * static two-up of the START and END extremes, which is both stable and
 * the exact pair a model-art review wants to see.
 *
 * The demo card is shot as an ELEMENT, not fullPage: the surrounding
 * stats carry seeded numbers and a date, and a full-page frame would
 * diff on those instead of on the art.
 */
import { test, expect, type Page } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import { settleImages } from "../helpers/settleImages";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const DOCS = `http://${FS_HOST}/v1/projects/demo-tropos/databases/(default)/documents`;

/** Demo id -> the exercise NAME the /history/exercise/:name route takes.
 *  Two side views, one front view, and the two rebuilt this week. */
const DEMOS: [id: string, name: string][] = [
  ["barbell-curl", "Barbell Curl"],
  ["bench-press", "Bench Press"],
  ["squat", "Barbell Squat"],
  ["dips", "Dips"],
  ["lateral-raise", "Lateral Raise"],
];

test.use({
  viewport: { width: 393, height: 852 },
  reducedMotion: "reduce",
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

async function uidByEmail(email: string): Promise<string> {
  const res = await fetch(
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
  if (!res.ok) throw new Error(await res.text());
  const { userInfo } = (await res.json()) as {
    userInfo?: { localId: string; email?: string }[];
  };
  const localId = userInfo?.find((u) => u.email === email)?.localId;
  if (!localId) throw new Error(`user ${email} not found in auth emulator`);
  return localId;
}

async function patch(path: string, fields: unknown): Promise<void> {
  const res = await fetch(`${DOCS}/${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer owner",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`${path}: ${await res.text()}`);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** One workout carrying every captured exercise, so each detail page has
 *  history behind it and renders its stats rather than a cold start. */
async function seedWorkout(uid: string): Promise<void> {
  const when = new Date(Date.now() - 2 * 86_400_000);
  await patch(`users/${uid}?updateMask.fieldPaths=onboardingComplete`, {
    onboardingComplete: { booleanValue: true },
  });
  await patch(`users/${uid}/workouts/form-demo-capture-w1`, {
    date: { stringValue: ymd(when) },
    createdAt: { timestampValue: when.toISOString() },
    durationMinutes: { integerValue: "52" },
    totalCalories: { integerValue: "360" },
    exercises: {
      arrayValue: {
        values: DEMOS.map(([id, name]) => ({
          mapValue: {
            fields: {
              exerciseId: { stringValue: id },
              exerciseName: { stringValue: name },
              category: { stringValue: "push" },
              caloriesBurned: { integerValue: "0" },
              sets: {
                arrayValue: {
                  values: [1, 2, 3].map((n) => ({
                    mapValue: {
                      fields: {
                        setNumber: { integerValue: String(n) },
                        reps: { integerValue: "8" },
                        weightKg: { integerValue: "40" },
                      },
                    },
                  })),
                },
              },
            },
          },
        })),
      },
    },
  });
}

test.describe("form demo screenshots", () => {
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
  });

  async function shootBoth(page: Page, name: string) {
    const card = page.getByRole("img", { name: /demonstration/i }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    // The demo itself is inline SVG, but the page around it carries art;
    // settling keeps this spec out of the unsettled-capture ratchet and
    // costs nothing on a frame with no raster in it.
    await settleImages(page);
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(250);
    await card.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-light.png`,
    });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(250);
    await card.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-dark.png`,
    });
  }

  test("every rebuilt demo renders its figure on the Form tab", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const email = `formdemo-${Date.now()}-${Math.floor(Math.random() * 1e6)}@tropos.test`;
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

    await seedWorkout(await uidByEmail(email));

    for (const [id, name] of DEMOS) {
      await page.goto(`/Maiin/history/exercise/${encodeURIComponent(name)}`);
      // NOT networkidle: live Firestore listeners keep the network busy.
      await page.waitForLoadState("domcontentloaded");

      // The Progress/Form switch is a SegmentedControl — role=radio, not
      // a button (the house gotcha that has broken three capture specs).
      await page
        .getByRole("radio", { name: /^form$/i })
        .click({ timeout: 30_000 });

      await shootBoth(page, `form-demo-${id}`);
    }
  });
});
