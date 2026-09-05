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
 * A PLACARD demo (2026-09-03) prints something better under the same
 * flag: every named position at once, each under its own caption — the
 * form card the animation steps through. So `dips` now captures as a
 * six-panel frame rather than a two-up, and its first diff after that
 * change is a whole-frame change by construction, not churn.
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
  // 2026-09-03 build-out, batch 1: the two with new chains.
  ["lunges", "Lunges"],
  ["front-raise", "Front Raise"],
  // Batch 2: the supine chain.
  ["hip-thrust", "Hip Thrust"],
  // Batch 3: the cable station (a rope at face height, a handle from a
  // chest-height pulley on a row bench) and the seated machine.
  ["face-pulls", "Face Pulls"],
  ["seated-row", "Seated Cable Row"],
  ["leg-extension", "Leg Extension"],
  // Batch 4: a pad, a sled, the declined bench.
  ["preacher-curl", "Preacher Curl"],
  ["leg-press", "Leg Press"],
  ["decline-bench", "Decline Bench Press"],
  // Batch 5: the hang, the kneel, the cable at the temples.
  ["leg-raise", "Hanging Leg Raise"],
  ["ab-wheel", "Ab Wheel Rollout"],
  ["cable-crunch", "Cable Crunch"],
  // Batch 6: the rigid-body row, the pendulum, the knee hinge.
  ["inverted-row", "Inverted Row"],
  ["kettlebell-swing", "Kettlebell Swing"],
  ["nordic-hamstring-curl", "Nordic Hamstring Curl"],
  // Batch 7: the box, one leg, the pad.
  ["barbell-step-ups", "Barbell Step-Ups"],
  ["pistol-squat", "Pistol Squats"],
  ["chest-supported-db-row", "Chest-Supported Dumbbell Row"],
  // Batch 8: the low pulley behind, the pad, the ankle strap.
  ["overhead-cable-tricep-extension", "Overhead Cable Tricep Extension"],
  ["spider-db-curl", "Spider Dumbbell Curl"],
  ["cable-glute-kickback", "Cable Glute Kickback"],
  // Batch 9: a landmine arc, a solved pike, the bench-edge flag.
  ["landmine-press", "Landmine Press"],
  ["pike-push-up", "Pike Push-Up"],
  ["dragon-flag", "Dragon Flag"],
  // Batch 10: a hold drawn as its set-up, and the two-phase transition.
  ["plank", "Plank"],
  ["muscle-ups", "Muscle-Ups"],
  ["clean-and-press", "Clean and Press"],
  // Batch 11: the front camera — a foreshortened fly, the deck, the Arnold.
  ["db-flyes", "Dumbbell Flyes"],
  ["pec-deck", "Pec Deck"],
  ["arnold-press", "Arnold Press"],
  // Batch 12: legs on the front figure, the back figure, a top-down core.
  ["hip-abduction-machine", "Hip Abduction Machine"],
  ["reverse-pec-deck", "Reverse Pec Deck"],
  ["dead-bug", "Dead Bug"],
  // Batch 13: the climber's foot path, the rower's sequence, the side plank.
  ["mountain-climbers", "Mountain Climbers"],
  ["rowing-machine", "Rowing Machine"],
  ["side-plank", "Side Plank"],
  // Batch 14: the keyed burpee.
  ["burpees", "Burpees"],
  // Batch 15: cycles — a stride, a stair step, the box landing.
  ["treadmill", "Treadmill"],
  ["stairmaster", "Stairmaster"],
  ["box-jumps", "Box Jumps"],
  // Batch 16: a crank stroke, the elliptical's levers, the pool.
  ["bike", "Stationary Bike"],
  ["elliptical", "Elliptical"],
  ["swimming", "Swimming"],
  // Batch 17: the two keyed sequences.
  ["man-maker", "Man Maker"],
  ["turkish-get-up", "Turkish Get-Up"],
  // Batch 18: the ankle joint — the last row.
  ["seated-calf-raise", "Seated Calf Raise"],
  // Placards. These three render supplied art rather than the rig, so
  // their frames are the only proof the extraction pipeline's output
  // still composes into a readable position — a rig regression and a
  // bad crop look nothing alike, and only one of them has unit tests.
  // bench-press and dips are already above; these are the third and
  // fourth. The overhead press is the first placard whose EQUIPMENT
  // moves — the bar travels the whole range — so its frame is also the
  // only check on the extractor's `--anchor base` registration.
  ["rope-tricep-pushdown", "Rope Tricep Pushdown"],
  ["overhead-press", "Overhead Press"],
  ["skull-crushers", "Skull Crushers"],
  ["barbell-row", "Barbell Row"],
];

test.use({
  viewport: { width: 393, height: 852 },
  // `reducedMotion` is a browser-context option, not a test option: only
  // `contextOptions` applies it. A bare `reducedMotion` key here is
  // ignored silently (probed: prefers-reduced-motion stayed false) — the
  // emulateMedia call in beforeEach is what actually held the placards
  // still; this is now the typed brace to that belt.
  contextOptions: { reducedMotion: "reduce" },
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
    // Belt AND braces on reduced motion. `test.use({ reducedMotion })` did
    // not reach the page in the auth-emulator project — the first capture
    // run came back with the loop still running and every frame caught
    // mid-rep — so the media state is emulated here as well, and the
    // shot below selects the reduced-motion label specifically so a
    // regression fails the spec instead of quietly producing churn.
    await page.emulateMedia({ reducedMotion: "reduce" });
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
    /* The reduced-motion root, by attribute rather than by accessible
       name. It used to wait on the two-up's EXACT label, because
       `/demonstration/i` alone also matches the animated player
       ("... demonstration — looping reps") and a looser locator once
       shipped frames of a running loop. That string then stopped
       existing for a placard demo, whose still version is a six-panel
       storyboard, and this spec broke at `dips` — taking every demo
       after it in the same run with it.

       `data-demo-still` is on the two reduced-motion roots and nowhere
       else, so it survives a change of presentation while keeping the
       guarantee the string carried. `ExerciseRigDemo.test.tsx` pins it
       against the real render, both that it is there and that the
       animated path does not have it. */
    const card = page.locator("[data-demo-still]").first();
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
