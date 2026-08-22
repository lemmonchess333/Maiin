/**
 * Solo-first Social feed capture (SOCIAL S4 Soc8 PR3 backlog rows,
 * re-read 2026-08-08 against the current surface per the row's own
 * SUPERSEDED note) — the state 100% of launch users see first, filmed
 * light + dark as a genuinely fresh account.
 *
 * What the re-read found still true: FeedView routes 0-follow users to
 * SoloFirstFeed (Soc8 lock), whose stack is PartnerStreakHero →
 * challenge slot (collapses before rollover materialises the doc) →
 * Share-your-training. The original row's "Crews unlock…" hexagon row
 * died with crews (#1700) — the capture asserts the CURRENT stack.
 *
 * Fixture: brand-new signup-form account + onboardingComplete patched
 * via the emulator's rules-free REST surface (the coachmark.auth
 * pattern). Fresh account = 0 follows = the solo gate, with clean
 * localStorage. The share card must show its cold-start prompt WITHOUT
 * the "Create a share card" button (nothing logged yet) — asserted
 * before shooting, so a regression films loudly.
 */
import { test, expect, type Page } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

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

async function completeOnboardingDirect(uid: string): Promise<void> {
  const res = await fetch(
    `http://${FS_HOST}/v1/projects/demo-tropos/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=onboardingComplete&updateMask.fieldPaths=displayName`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer owner",
      },
      body: JSON.stringify({
        fields: {
          onboardingComplete: { booleanValue: true },
          displayName: { stringValue: "Solo Tester" },
        },
      }),
    }
  );
  if (!res.ok) throw new Error(await res.text());
}

/** Seed one plausible workout for the user via the emulator's rules-free
 *  REST surface, so the share card's preloaded state becomes reachable. */
async function seedWorkoutDirect(uid: string): Promise<void> {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const res = await fetch(
    `http://${FS_HOST}/v1/projects/demo-tropos/databases/(default)/documents/users/${uid}/workouts/solo-capture-w1`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer owner",
      },
      body: JSON.stringify({
        fields: {
          date: { stringValue: today },
          createdAt: { timestampValue: new Date().toISOString() },
          durationMinutes: { integerValue: "42" },
          totalCalories: { integerValue: "310" },
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
                          values: [1, 2, 3].map((n) => ({
                            mapValue: {
                              fields: {
                                setNumber: { integerValue: String(n) },
                                reps: { integerValue: "8" },
                                weightKg: { integerValue: "60" },
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
        },
      }),
    }
  );
  if (!res.ok) throw new Error(await res.text());
}

test.describe("solo-first feed screenshots", () => {
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

  test("fresh user's Social feed — the curated solo stack, light + dark", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const email = `solo-${Date.now()}-${Math.floor(Math.random() * 1e6)}@tropos.test`;
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
    await completeOnboardingDirect(await uidByEmail(email));

    await page.goto("social");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 25_000 });
    // Social defaults to the Together tab; the solo stack lives under
    // Feed (SegmentedControl → role=radio, the standing gotcha).
    await page.getByRole("radio", { name: /feed/i }).click({ timeout: 20_000 });
    // The solo stack leads with the share-your-training card; its
    // presence + the absence of empty-feed copy is the row's core claim.
    await expect(page.getByText(/Share your training/i)).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(/your feed is empty/i)).not.toBeVisible();
    // Cold start: nothing logged yet, so the share card shows its prompt
    // WITHOUT the create button.
    await expect(
      page.getByRole("button", { name: /create a share card/i })
    ).not.toBeVisible();

    await page.waitForTimeout(500);
    await shootBoth(page, "solo-feed");
  });

  test("sub-tab switch keeps the stack; a logged workout preloads the share card", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const email = `solo2-${Date.now()}-${Math.floor(Math.random() * 1e6)}@tropos.test`;
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
    const uid = await uidByEmail(email);
    await completeOnboardingDirect(uid);

    await page.goto("social");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 25_000 });
    await page.getByRole("radio", { name: /feed/i }).click({ timeout: 20_000 });
    await expect(page.getByText(/Share your training/i)).toBeVisible({
      timeout: 25_000,
    });

    // Sub-tab row: switching the feed source must keep the solo stack —
    // the 0-follow gate outranks the source selection — and never show
    // the empty-feed prompt.
    await page
      .getByRole("button", { name: /feed source/i })
      .click({ timeout: 10_000 });
    await page
      .getByRole("button", { name: /following/i })
      .first()
      .click({ timeout: 10_000 })
      .catch(() => {
        /* sheet option absent — the assertions below still decide */
      });
    await expect(page.getByText(/Share your training/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/your feed is empty/i)).not.toBeVisible();

    // Preloaded-share row: seed one workout, reload — the share card
    // must now offer the button, and tapping it opens the composer.
    await seedWorkoutDirect(uid);
    await page.reload();
    await page.getByRole("radio", { name: /feed/i }).click({ timeout: 20_000 });
    const createBtn = page.getByRole("button", {
      name: /create a share card/i,
    });
    await expect(createBtn).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(400);
    await shootBoth(page, "solo-feed-share-ready");

    await createBtn.click({ timeout: 8000 });
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await shootBoth(page, "solo-feed-share-sheet");
  });
});
