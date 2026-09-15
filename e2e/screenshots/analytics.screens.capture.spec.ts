import { verifySignupEmail } from "../helpers/verifySignupEmail";
import { signInAsTestUser } from "../helpers/auth";
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
      animations: "disabled",
      path: `screenshots/${name}-light.png`,
      fullPage: true,
    });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-dark.png`,
      fullPage: true,
    });
  }

  /** Sign up a fresh account, seed one run + one workout + one meal, and
   *  land on History. Shared by both tests so the PRs tab is looked at
   *  with the same data the Analytics tab is. */
  async function signUpSeedAndOpenHistory(
    page: Page,
    prefix: string
  ): Promise<string> {
    const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@tropos.test`;
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
    await verifySignupEmail(page, email);
    await page
      .getByRole("button", { name: /build muscle/i })
      .waitFor({ state: "visible", timeout: 30_000 });

    const uid = await uidByEmail(email);
    await seedTrainingHistory(uid);

    await page.goto("/Maiin/history");
    return uid;
  }

  test("Analytics leaves skeleton state and renders real content", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await signUpSeedAndOpenHistory(page, "analytics");
    // NOT networkidle — History holds live Firestore listeners open, so
    // the network never goes idle and the wait burns the whole timeout.
    await page.waitForLoadState("domcontentloaded");

    // Positive anchor FIRST: the tab actually rendered its analytics body.
    await expect(
      page.getByRole("heading", { name: /analytics/i }).first()
    ).toBeVisible({ timeout: 30_000 });

    // The defect, stated directly. `motion-safe:animate-pulse` is the
    // Skeleton / ChartSkeleton marker class (matched by substring so the
    // variant prefix cannot silently empty this selector); the lazy-chunk
    // fallback copy is the other stuck state. Neither may survive a
    // settled load.
    await expect(page.locator('[class*="animate-pulse"]')).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByText(/loading analytics/i)).toHaveCount(0);

    // And the content the skeletons were standing in for is present —
    // one assertion per seeded discipline, so a section that renders its
    // heading but never its data still fails. All three feed `dataLoading`
    // and all three must have arrived.
    await expect(
      page.getByText("Monthly Volume", { exact: true })
    ).toBeVisible();
    await expect(page.getByText("2.2k").first()).toBeVisible();
    await expect(
      page.getByText("Monthly Distance", { exact: true })
    ).toBeVisible();
    await expect(page.getByText("5.2").first()).toBeVisible();
    await expect(page.getByText(/no meals logged/i)).toHaveCount(0);

    await shootBoth(page, "analytics-loaded");
  });

  /* The third tab had no capture at all — Analytics and Badges were
     filmed, PRs was not — and the first look at it found a personal
     record stated in the wrong unit ("Fastest 5K  5:35", a pace under a
     label naming a distance, read as a finish time). Reading the
     component had not found that; seeing it did.

     The assertions are the unit contract, not the numbers: a row whose
     label names a DISTANCE must say what its value is measured in, or a
     pace reads as a time. `prRowUnits.test.ts` holds the same rule
     against the builder; this holds it against the rendered page.

     Expect the FRAME to churn between captures taken on different days:
     every row carries a date ("13 Sept"), and the seeds are relative to
     now. That is the `badges-grid` family from CLAUDE.md — fixture data
     moving with the wall clock, not layout — so localise a diff to the
     date column before chasing it. The assertions above are immune:
     they read values, not dates. */
  test("PRs tab states its units", async ({ page }) => {
    test.setTimeout(180_000);

    const uid = await signUpSeedAndOpenHistory(page, "prs");
    /* A second, SHORTER and FASTER run. `buildPRBucket` draws Fastest 1K
       from runs >= 1 km and Fastest 5K from runs >= 5 km, so this one
       takes the 1K best (4:30) and leaves the 5K best to the 5.2 km run
       (5:35). Without it both rows print the same number and no
       assertion here can tell them apart. */
    await patch(`users/${uid}/runs/analytics-capture-r2`, {
      distance: { doubleValue: 1200 },
      duration: { integerValue: "324" },
      avgPace: { doubleValue: 270 },
      elevationGain: { integerValue: "4" },
      calories: { integerValue: "90" },
      activityType: { stringValue: "freerun" },
      completedAt: {
        timestampValue: new Date(Date.now() - 86_400_000).toISOString(),
      },
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.getByRole("heading", { name: /analytics/i }).first()
    ).toBeVisible({ timeout: 30_000 });

    // The tab strip is a SegmentedControl, so its options are radios.
    await page.getByRole("radio", { name: /^PRs$/ }).click({ timeout: 10_000 });

    await expect(page.getByText("Fastest 5K").first()).toBeVisible({
      timeout: 15_000,
    });
    /* Anchored on values that differ BY ROW, which is why the extra run
       above is seeded. With only the 5.2 km run, the 1K and the 5K best
       are the same pace, so every page-level assertion about "5:35 /km"
       is satisfied by the 1K row and passes with the 5K row's unit
       stripped — measured, not assumed: that version survived the
       mutation twice, as a substring and again anchored. Scoping the
       locator to the row was the other way out and it is worse: the
       nearest div containing the label is the label's own wrapper, so
       the assertion has to know the card's DOM shape. A fixture whose
       rows differ needs no such knowledge. */
    await expect(page.getByText(/^5:35 \/km$/).first()).toBeVisible();
    await expect(page.getByText(/^4:30 \/km$/).first()).toBeVisible();
    await expect(page.getByText(/^5\.2 km$/).first()).toBeVisible();

    await shootBoth(page, "prs-tab");
  });

  /* The STEADY state, which nothing had ever filmed.
     
     Both tests above sign up a FRESH account and seed it one run, one
     workout and one meal over REST, so every filmed look at this tab has
     been of a near-cold-start user. The rich seed — 18 workouts, 10
     runs, 12 meals, 6 performance weeks — writes to the shared
     `e2e-test@tropos.test` account that every OTHER capture spec signs
     in as, and Analytics never looked at it. Running the full CI seed
     chain changes nothing here, because this spec does not use that
     account; signing in as it is the fix.

     The first look found a chart that could not draw its own scale: the
     Performance Index y-axis clipped "100" to "00", invisible to a
     cold-start capture because the chart renders nothing without
     performance docs. */
  test("with a full history", async ({ page }) => {
    test.setTimeout(180_000);

    await signInAsTestUser(page);
    await page.goto("/Maiin/history");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.getByRole("heading", { name: /analytics/i }).first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[class*="animate-pulse"]')).toHaveCount(0, {
      timeout: 30_000,
    });

    /* The surfaces a cold-start user does not have at all. */
    await expect(page.getByText("Performance Index").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Training load" })
    ).toBeVisible();

    /* Clipping is VISUAL, so the DOM cannot see it: the tick text is
       present whether or not it is painted, and `getByText("100")`
       passes either way. Compare boxes — but against the SVG, not the
       card, which is the correction this assertion needed. Measured:
       the card's border box starts at x=16 and its CONTENT box at x=32,
       the chart's `<svg>` starts at 32, and the clipped "100" is drawn
       at x=23.6 — inside the card, outside the svg, and it is the svg
       that clips. An assertion against the card passes on the defect. */
    const card = page
      .locator("div.bg-card")
      .filter({ has: page.getByRole("heading", { name: "Performance Index" }) })
      .first();
    const svg = card.locator("svg").first();
    const tick = svg.locator("text", { hasText: /^100$/ }).first();
    await expect(tick).toBeVisible();
    const [tickBox, svgBox] = [
      await tick.boundingBox(),
      await svg.boundingBox(),
    ];
    expect(tickBox, "y-axis tick has no box").not.toBeNull();
    expect(svgBox, "chart svg has no box").not.toBeNull();
    expect(
      tickBox!.x,
      `the "100" tick is drawn at x=${tickBox!.x}, left of the chart svg at ` +
        `x=${svgBox!.x} — the axis has no room for three digits and the ` +
        `label is clipped`
    ).toBeGreaterThanOrEqual(svgBox!.x);

    await shootBoth(page, "analytics-rich");
  });
});
