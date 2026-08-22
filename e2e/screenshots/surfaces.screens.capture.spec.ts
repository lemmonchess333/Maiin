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
import { settleFullPageHeight } from "../helpers/settleHeight";

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
    /* Then wait for the document to stop GROWING. The 400ms above is a
       fixed guess, and these are fullPage shots, so the frame's height is
       a claim about the whole page — while every anchor in this spec is a
       single element near the top. `home-energy-default-after.png` swung
       393x1191 -> 1190 -> 1458 -> 1191 across four captures with no
       relevant code change; the 267px jump is a card below the fold that
       had not arrived yet. See the helper for why height and not
       networkidle. */
    await settleFullPageHeight(page);
    await page.screenshot({
      animations: "disabled",
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
    /* Then anchor on the DATA, not the heading. The heading renders
       immediately; the card's target arrives from the profile, and until
       it does the card shows "/ 0 kcal" and the weight tile beside it
       shows "Tap to log" — a legitimate empty state, not a skeleton, so
       nothing generic can tell the two apart.

       That is what made this frame undiffable: it measured 1191 -> 1190
       -> 1458 -> 1191 -> 1358 across five captures. Settling the document
       height (added first, and kept — a fullPage shot should wait for
       layout) does NOT fix it, measured: the loading state is itself
       height-stable for longer than the settle window, so the helper
       returns on a stable page that is not the final one.

       A non-zero target is the readiness signal. Hard assertion rather
       than best-effort: if Home cannot load its energy target in 20s that
       is worth failing on, and shooting anyway is how you get a frame
       that lies about what it shows. */
    await expect(
      // Separator-agnostic. `formatCalories` is `toLocaleString()` with no
      // locale, so grouping follows the RUNTIME: "2,200" on en-US,
      // "2.200" on de-DE, "2 200" (U+202F) on fr-FR. A comma-only pattern
      // is a bet on the CI runner's locale; the class below covers all
      // three and still refuses a leading zero, which is the actual
      // signal. Pinned against a real render in
      // `energyCaptureAnchor.test.tsx`, including this runtime's grouping.
      page.getByText(/\/ [1-9][\d.,\s\u00a0\u202f]*kcal/).first(),
      "the energy card never loaded its target — the frame would capture " +
        "the pre-load state, which is what made this frame swing 267px"
    ).toBeVisible({ timeout: 20_000 });
    await shoot(page, "home-energy-default");

    /* Open the day peek. Must be a NON-today cell: `handleDayTap` treats
       a tap on today as redundant with the live session cards below and
       scrolls to them instead of peeking (Cal-A), so targeting "today"
       silently captures the wrong screen — which is what the first run
       of this spec did. Day-cell labels carry a "(today)" suffix, so the
       absence of it is the selector.

       That intent was right and the regex had rotted. It anchored the
       date to END of name (`/day, \w+ \d+$/`), but WeekStrip appends the
       training label after the date — "Friday, August 21, rest day" —
       so it matched NOTHING and this step had been timing out for as
       long as the label has had that suffix. A negative lookahead now
       carries the "not today" half explicitly instead of relying on an
       anchor to imply it. `weekStripDayLabel` in the unit suite pins the
       shape this depends on.

       Worth keeping about the SYMPTOM, because it is what made this
       survive so long: the only outward sign was `home-day-peek`
       quietly leaving the capture set. The spec timed out, the other 45
       tests passed, and the job still committed screenshots — so a
       missing frame looked like a frame nobody had asked for. */
    const otherDay = page
      .getByRole("button", { name: /^(?!.*\(today\))\w+day, \w+ \d+,/ })
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
