/**
 * Three surfaces the operator flagged from device screenshots, filmed
 * before/after so the visual change is evidenced rather than asserted
 * (CLAUDE.md's D15 lesson: no visual churn without screenshots).
 *
 *  1. Food macro tiles — the carbs icon has no circle while protein and
 *     fat do. That is the goal-reached halo behaving correctly, and it
 *     reads as a missing element. Seeded to reproduce EXACTLY that state:
 *     protein and fat over target, carbs far under.
 *  2. Home day-peek — the card revealed by tapping a calendar day.
 *  3. Home Today's Energy — collapsed by default, every visit.
 *
 * Fixture note: targets come from the onboarding profile, so the meal
 * below is sized to clear a typical protein/fat target while leaving
 * carbs obviously short. The assertion before shooting is on the RELATIVE
 * state (two goals met, one not), not on absolute grams.
 */
import { test, expect, type Page } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const DOCS = `http://${FS_HOST}/v1/projects/demo-tropos/databases/(default)/documents`;

/** Set by the runner so one spec files both states. */
const PHASE = process.env.CAPTURE_PHASE ?? "after";

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

/** Protein + fat over target, carbs far under — the reported screen. */
async function seedLopsidedDay(uid: string): Promise<void> {
  const now = new Date();
  await patch(`users/${uid}?updateMask.fieldPaths=onboardingComplete`, {
    onboardingComplete: { booleanValue: true },
  });
  await patch(`users/${uid}/meals/macro-capture-m1`, {
    foodName: { stringValue: "Steak and avocado" },
    date: { stringValue: ymd(now) },
    createdAt: { timestampValue: now.toISOString() },
    totalCalories: { integerValue: "1889" },
    totalProtein: { integerValue: "164" },
    totalCarbs: { integerValue: "53" },
    totalFat: { integerValue: "105" },
    meal: { stringValue: "dinner" },
    items: { arrayValue: { values: [] } },
    confidence: { stringValue: "high" },
  });
}

test.describe(`home + food surfaces (${PHASE})`, () => {
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

  async function shoot(page: Page, name: string) {
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `screenshots/${name}-${PHASE}.png`,
      fullPage: true,
    });
  }

  test("macro tiles, day peek, and today's energy", async ({ page }) => {
    test.setTimeout(240_000);

    const email = `surfaces-${Date.now()}-${Math.floor(Math.random() * 1e6)}@tropos.test`;
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

    await seedLopsidedDay(await uidByEmail(email));

    // ── 1. Food macro tiles ───────────────────────────────────────
    await page.goto("/Maiin/food");
    await page.waitForLoadState("domcontentloaded");
    // Asserts the REPORTED STATE, not just that the tiles rendered: two
    // macros at goal, one short. That's what puts a halo on protein and
    // fat and none on carbs — the thing the screenshot is documenting.
    // The accessible name carries it (`{label} goal reached` is sr-only),
    // so this holds without depending on how the halo is drawn, and
    // survives the restyle these captures bracket.
    const protein = page.locator('[data-macro="protein"]');
    const carbs = page.locator('[data-macro="carbs"]');
    const fat = page.locator('[data-macro="fat"]');
    await expect(protein).toBeVisible({ timeout: 30_000 });
    await expect(protein).toHaveAccessibleName(/goal reached/i);
    await expect(fat).toHaveAccessibleName(/goal reached/i);
    await expect(carbs).not.toHaveAccessibleName(/goal reached/i);
    await shoot(page, "macro-tiles");

    // ── 2 + 3. Home ───────────────────────────────────────────────
    await page.goto("/Maiin/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/today's energy/i)).toBeVisible({
      timeout: 30_000,
    });
    await shoot(page, "home-energy-default");

    // Open the day peek. Must be a NON-today cell: `handleDayTap` treats
    // a tap on today as redundant with the live session cards below and
    // scrolls to them instead of peeking (Cal-A), so targeting "today"
    // silently captures the wrong screen — which is what the first run
    // of this spec did. Day-cell labels carry a "(today)" suffix, so the
    // absence of it is the selector.
    const otherDay = page
      .getByRole("button", { name: /day, \w+ \d+$/ })
      .first();
    await otherDay.click({ timeout: 10_000 });
    await expect(page.getByText(/manage day|no sessions/i).first()).toBeVisible(
      { timeout: 10_000 }
    );
    await shoot(page, "home-day-peek");

    // Today's Energy expanded.
    await page
      .getByText(/today's energy/i)
      .click({ timeout: 10_000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    await shoot(page, "home-energy-expanded");
  });
});
