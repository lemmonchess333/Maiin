/**
 * Analytics tab capture — the "analytics doesn't load" report.
 *
 * Reported from a device screenshot: the Analytics tab showed a "Lifting"
 * section label with skeleton placeholders under it that never resolved.
 *
 * `dataLoading` on History is `runsLoading || workoutsLoading ||
 * mealsLoading`, so a single hook that never settles holds the entire tab
 * in skeleton state — there is no per-section granularity and no recovery
 * affordance once it sticks. This spec seeds one of each (run, workout,
 * meal) so all three hooks have real work to do, then asserts the tab
 * reaches CONTENT rather than merely rendering.
 *
 * The assertion that matters is the negative one: no skeleton element is
 * left on the page. Asserting only "the Lifting heading is visible" would
 * pass against the exact reported defect — the heading renders in the
 * loading branch too.
 */
import { test, expect, type Page } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const DOCS = `http://${FS_HOST}/v1/projects/demo-tropos/databases/(default)/documents`;

test.use({
  viewport: { width: 393, height: 852 },
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

/** One run, one workout, one meal — enough that all three History hooks
 *  return non-empty and the tab must leave cold-start. */
async function seedTrainingHistory(uid: string): Promise<void> {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);

  await patch(`users/${uid}?updateMask.fieldPaths=onboardingComplete`, {
    onboardingComplete: { booleanValue: true },
  });

  // `distance` is METRES and `avgPace` is SECONDS PER KM — the units
  // `isVolumeEligible` gates on (>= 50m, >= 30s). The first draft of this
  // fixture wrote 5.2 and 5.58, reading them as km and min/km, and the run
  // was silently dropped from every stat while the workout beside it
  // rendered. The predicate was behaving exactly as documented; the
  // fixture was lying. Left as a note because "seeded data doesn't show
  // up" reads like an app bug and isn't.
  await patch(`users/${uid}/runs/analytics-capture-r1`, {
    distance: { doubleValue: 5200 },
    duration: { integerValue: "1740" },
    avgPace: { doubleValue: 334.6 },
    elevationGain: { integerValue: "42" },
    calories: { integerValue: "380" },
    activityType: { stringValue: "freerun" },
    completedAt: { timestampValue: twoDaysAgo.toISOString() },
  });

  await patch(`users/${uid}/workouts/analytics-capture-w1`, {
    date: { stringValue: ymd(twoDaysAgo) },
    createdAt: { timestampValue: twoDaysAgo.toISOString() },
    durationMinutes: { integerValue: "48" },
    totalCalories: { integerValue: "340" },
    exercises: {
      arrayValue: {
        values: [
          {
            mapValue: {
              fields: {
                exerciseId: { stringValue: "bench-press" },
                exerciseName: { stringValue: "Bench Press" },
                category: { stringValue: "push" },
                caloriesBurned: { integerValue: "0" },
                sets: {
                  arrayValue: {
                    values: [1, 2, 3, 4].map((n) => ({
                      mapValue: {
                        fields: {
                          setNumber: { integerValue: String(n) },
                          reps: { integerValue: "8" },
                          weightKg: { integerValue: "70" },
                        },
                      },
                    })),
                  },
                },
              },
            },
          },
        ],
      },
    },
  });

  // `parseMealDoc` reads total* / foodName / meal — not name/calories/
  // mealType. Same fixture-vs-schema trap as the run above.
  await patch(`users/${uid}/meals/analytics-capture-m1`, {
    foodName: { stringValue: "Chicken and rice" },
    date: { stringValue: ymd(twoDaysAgo) },
    createdAt: { timestampValue: twoDaysAgo.toISOString() },
    totalCalories: { integerValue: "620" },
    totalProtein: { integerValue: "48" },
    totalCarbs: { integerValue: "72" },
    totalFat: { integerValue: "14" },
    meal: { stringValue: "lunch" },
    items: { arrayValue: { values: [] } },
    confidence: { stringValue: "high" },
  });
}

test.describe("analytics tab screenshots", () => {
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
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `screenshots/${name}-light.png`,
      fullPage: true,
    });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `screenshots/${name}-dark.png`,
      fullPage: true,
    });
  }

  test("Analytics leaves skeleton state and renders real content", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const email = `analytics-${Date.now()}-${Math.floor(Math.random() * 1e6)}@tropos.test`;
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

    await seedTrainingHistory(await uidByEmail(email));

    await page.goto("/Maiin/history");
    // NOT networkidle — History holds live Firestore listeners open, so
    // the network never goes idle and the wait burns the whole timeout.
    await page.waitForLoadState("domcontentloaded");

    // Positive anchor FIRST: the tab actually rendered its analytics body.
    await expect(
      page.getByRole("heading", { name: /analytics/i }).first()
    ).toBeVisible({ timeout: 30_000 });

    // The defect, stated directly. `animate-pulse` is the Skeleton /
    // ChartSkeleton marker class; the lazy-chunk fallback copy is the
    // other stuck state. Neither may survive a settled load.
    await expect(page.locator(".animate-pulse")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByText(/loading analytics/i)).toHaveCount(0);

    // And the content the skeletons were standing in for is present —
    // one assertion per seeded discipline, so a section that renders its
    // heading but never its data still fails. All three feed `dataLoading`
    // and all three must have arrived.
    await expect(
      page.getByRole("button", { name: /Monthly Volume/i })
    ).toBeVisible();
    await expect(page.getByText("2.2k").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Monthly Distance/i })
    ).toBeVisible();
    await expect(page.getByText("5.2").first()).toBeVisible();
    await expect(page.getByText(/no meals logged/i)).toHaveCount(0);

    await shootBoth(page, "analytics-loaded");
  });
});
