/**
 * Feed activity cards, light + dark — the surface the 2026-08-21 numeric
 * hierarchy pass changed and NOTHING could look at.
 *
 * That pass reworked ActivityCard's run and workout metric rows (flex →
 * grid, distance/volume promoted to the primary tier, elevation's unit
 * demoted out of the numeral) and hardened the exercise rows. Every
 * existing capture of Social lands on the Together tab or a 0-follow
 * solo stack, so not one frame in the channel contains an ActivityCard.
 * The change shipped unseen. This spec is the fixture that closes that.
 *
 * Fixture: a fresh signup-form account, then two PUBLIC activity docs
 * seeded through the emulator's rules-free REST surface (the
 * solo-feed / coachmark pattern) and read back through the Explore
 * source, which queries `activities` on `visibility == "public"`.
 * `useDiscoverFeed` spreads the flat doc into `activity` (`...item`), so
 * the seed shape is the doc shape — no nesting.
 *
 * The two fixtures are chosen to exercise the exact things that were
 * unconstrained before:
 *   - the run carries NO routePreview, so distance stays IN the row and
 *     the row renders its worst case: FOUR metrics (distance, pace,
 *     time, elevation). That is the case the old `flex gap-5` pushed off
 *     a 393px screen.
 *   - the workout carries a deliberately long exercise name, which is
 *     what `truncate` alone could not save before `min-w-0 flex-1`.
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
          displayName: { stringValue: "Feed Tester" },
        },
      }),
    }
  );
  if (!res.ok) throw new Error(await res.text());
}

type FsValue = Record<string, unknown>;

async function seedActivity(id: string, fields: FsValue): Promise<void> {
  const res = await fetch(
    `http://${FS_HOST}/v1/projects/demo-tropos/databases/(default)/documents/activities/${id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer owner",
      },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) throw new Error(await res.text());
}

/**
 * ONE follow edge. Without it the account is `isNewUser`, and
 * `showSoloFeed = isNewUser` in Social.tsx routes every feed SOURCE —
 * Explore included — to the curated solo stack, so no activity card can
 * render at any source. The first run of this spec failed exactly here:
 * the seed was fine and the account was simply never eligible to see it.
 * `followUser` writes both sides, so the fixture does too.
 */
async function seedFollow(uid: string, targetUid: string): Promise<void> {
  const body = JSON.stringify({
    fields: { createdAt: { timestampValue: new Date().toISOString() } },
  });
  for (const path of [
    `following/${uid}/users/${targetUid}`,
    `followers/${targetUid}/users/${uid}`,
  ]) {
    const res = await fetch(
      `http://${FS_HOST}/v1/projects/demo-tropos/databases/(default)/documents/${path}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer owner",
        },
        body,
      }
    );
    if (!res.ok) throw new Error(await res.text());
  }
}

/** A run with no route preview — so distance renders IN the metric row
 *  and the row carries its four-metric worst case. */
async function seedRun(uid: string, stamp: string): Promise<void> {
  await seedActivity(`cap-run-${stamp}`, {
    authorId: { stringValue: uid },
    authorName: { stringValue: "Feed Tester" },
    type: { stringValue: "run" },
    visibility: { stringValue: "public" },
    summary: { stringValue: "Half marathon pace run" },
    caption: { stringValue: "Long one before the taper." },
    // METRES on the wire: ActivityCard feeds this to
    // `distanceValue(distanceM, ...)`. Seeding 21.1 here renders
    // "0.02" — checked, not assumed.
    distance: { integerValue: "21100" },
    // Seconds per KM (paceMinSec converts for an imperial reader).
    avgPace: { integerValue: "312" },
    duration: { integerValue: "6583" },
    elevationGain: { integerValue: "342" },
    kudosCount: { integerValue: "4" },
    commentCount: { integerValue: "1" },
    createdAt: { timestampValue: new Date().toISOString() },
  });
}

/** A workout whose first exercise name is long enough to prove the
 *  truncation contract, with all four metrics present. */
async function seedWorkout(uid: string, stamp: string): Promise<void> {
  const ex = (name: string, summary: string) => ({
    mapValue: {
      fields: {
        name: { stringValue: name },
        summary: { stringValue: summary },
      },
    },
  });
  await seedActivity(`cap-lift-${stamp}`, {
    authorId: { stringValue: uid },
    authorName: { stringValue: "Feed Tester" },
    type: { stringValue: "workout" },
    visibility: { stringValue: "public" },
    summary: { stringValue: "Lower body" },
    totalVolume: { integerValue: "12480" },
    exerciseCount: { integerValue: "6" },
    prCount: { integerValue: "2" },
    duration: { integerValue: "4200" },
    exercises: {
      arrayValue: {
        values: [
          ex("Romanian Deadlift (Dumbbell, Single-Leg)", "3 x 8 60kg"),
          ex("Back Squat", "5 x 5 100kg"),
          ex("Walking Lunge", "3 x 12 BW"),
        ],
      },
    },
    kudosCount: { integerValue: "2" },
    commentCount: { integerValue: "0" },
    createdAt: {
      timestampValue: new Date(Date.now() - 3600_000).toISOString(),
    },
  });
}

test.describe("feed activity card screenshots", () => {
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

  test("run + workout cards in the Explore feed, light + dark", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const email = `feedcard-${stamp}@tropos.test`;
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
    // The activities are authored by a DIFFERENT uid, which is what a
    // real feed shows and what keeps the card's author row meaningful.
    const authorUid = `cap-author-${stamp}`;
    await seedFollow(uid, authorUid);
    await seedRun(authorUid, stamp);
    await seedWorkout(authorUid, stamp);

    await page.goto("social");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 25_000 });
    // Social opens on Together; the feed lives under the Feed radio
    // (SegmentedControl → role=radio, the standing gotcha).
    await page.getByRole("radio", { name: /feed/i }).click({ timeout: 20_000 });
    // A 0-follow account lands on the solo stack, so switch the SOURCE to
    // Explore — that is the one that queries `activities` directly.
    await page
      .getByRole("button", { name: /feed source/i })
      .first()
      .click({ timeout: 20_000 });
    await page
      .getByRole("radio", { name: /explore/i })
      .click({ timeout: 15_000 });

    // Assert BEFORE shooting, so a regression films loudly rather than
    // producing a quietly empty frame.
    await expect(page.getByText("Half marathon pace run")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Romanian Deadlift/)).toBeVisible({
      timeout: 15_000,
    });
    // The four-metric run row: every metric present means the grid is
    // carrying the case the old flex row could not.
    await expect(page.getByText("21.10")).toBeVisible();
    // Anchored to the unit rather than the bare number: "342" alone
    // could match anything on the page, and the point of the elevation
    // change is that the value and its unit sit together with the unit
    // demoted — so assert the pair.
    await expect(page.getByText(/342\s*m/)).toBeVisible();
    // Volume is the promoted primary on the lift card.
    await expect(page.getByText("12,480")).toBeVisible();

    await page.waitForTimeout(600);
    await shootBoth(page, "feed-activity-cards");
  });
});
