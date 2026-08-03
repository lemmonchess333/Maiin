/**
 * P1 — bodyweight data integrity: one canonical row per local day.
 *
 * Guards the upsert contract shipped in PR #1605: logging a weight twice on
 * the same local day must UPDATE the single date-keyed
 * `users/{uid}/bodyweightLogs/{YYYY-MM-DD}` document, never append a second
 * row. Before the fix, each weigh-in wrote an auto-id doc, so a day with two
 * corrections left two rows and the trend/read path had to collapse them at
 * read time. This runs against the real Firestore emulator (not a mock) so
 * the write path — `handleLogWeight` → `setDocGuarded(doc(..., today))` — is
 * exercised end to end.
 *
 * Named `*.auth.spec.ts` so both the emulator-tests.yml CI positional filter
 * (`auth.spec.ts`) and the Playwright `auth-emulator` project `testMatch`
 * pick it up. Skips gracefully (via the shared strict gate) when the emulator
 * env is absent, matching every other auth.spec.ts.
 */
import { test, expect, type Page } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  deleteDoc,
  getDocs,
} from "firebase/firestore";
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { signInAsTestUser, TEST_USER } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

interface BodyweightRow {
  id: string;
  weight: number;
}

/**
 * Reads the signed-in test user's bodyweightLogs directly from the Firestore
 * emulator via a throwaway client SDK app. A dummy `apiKey` is mandatory —
 * `getAuth` refuses to initialise without one even when the auth calls are
 * rerouted to the emulator. The app is torn down in `finally` so parallel
 * reads don't collide on the default app name.
 */
async function withBodyweightLogs<T>(
  fn: (snap: Awaited<ReturnType<typeof getDocs>>) => T | Promise<T>
): Promise<T> {
  const app = initializeApp(
    { apiKey: "emulator-dummy-key", projectId: "demo-tropos" },
    `verify-bodyweight-${process.hrtime.bigint()}`
  );
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    const cred = await signInWithEmailAndPassword(
      auth,
      TEST_USER.email,
      TEST_USER.password
    );
    const dbc = getFirestore(app);
    connectFirestoreEmulator(dbc, "127.0.0.1", 8080);
    return await fn(
      await getDocs(collection(dbc, "users", cred.user.uid, "bodyweightLogs"))
    );
  } finally {
    await deleteApp(app);
  }
}

async function readBodyweightLogs(): Promise<BodyweightRow[]> {
  return withBodyweightLogs((snap) =>
    snap.docs.map((d) => ({ id: d.id, weight: d.data().weight as number }))
  );
}

/**
 * Empty the collection before each attempt.
 *
 * Without this, one failure poisons every retry: the leftover row makes the
 * FIRST assertion (`afterFirst` has length 1) fail too, so Playwright's
 * retries can never recover and a transient blip is reported as a hard red.
 * That is exactly what happened on the 2026-08-03 00:00 UTC run — the real
 * fault was a midnight straddle lasting seconds, but all three attempts
 * failed and only the first one failed for the actual reason.
 */
async function clearBodyweightLogs(): Promise<void> {
  await withBodyweightLogs(async (snap) => {
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  });
}

/** The browser's LOCAL calendar day, in the same `YYYY-MM-DD` shape the
 *  app uses for the doc id. */
function localDay(page: Page): Promise<string> {
  return page.evaluate(() => new Date().toLocaleDateString("en-CA"));
}

async function logWeight(page: Page, value: string): Promise<void> {
  await page
    .getByRole("button", { name: /weight/i })
    .first()
    .click();
  const input = page.getByLabel(/Body weight in/i);
  await input.waitFor({ state: "visible", timeout: 10_000 });
  await input.fill(value);
  await page.getByRole("button", { name: "Save weight" }).click();
  // Let the guarded Firestore write + sheet-close settle before the next
  // action / read. The write is fire-and-forget from the UI's perspective.
  await page.waitForTimeout(1500);
}

test.describe("P1 bodyweight upsert — one row per local day", () => {
  test.skip(
    !emulatorActive,
    "Requires the Firebase Auth + Firestore emulators (see e2e/helpers/emulator.ts)."
  );

  test.beforeEach(async ({ page }) => {
    await clearBodyweightLogs();
    // The emulator warning banner intercepts pointer events over the
    // bottom-right of the viewport, which can block the Save button. Hide
    // it before the app paints.
    await page.addInitScript(() => {
      const style = document.createElement("style");
      style.textContent =
        ".firebase-emulator-warning{display:none !important;}";
      document.addEventListener("DOMContentLoaded", () =>
        document.head.appendChild(style)
      );
    });
  });

  test("a second same-day weigh-in updates the single doc, never appends", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    await page.goto("");
    await page
      .getByRole("button", { name: /weight/i })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });

    // First weigh-in → exactly one date-keyed row.
    await logWeight(page, "80.4");
    const dayOfFirst = await localDay(page);
    const afterFirst = await readBodyweightLogs();
    expect(afterFirst).toHaveLength(1);
    const firstId = afterFirst[0].id;
    const firstWeight = afterFirst[0].weight;

    await logWeight(page, "80.1");
    const dayOfSecond = await localDay(page);
    const afterSecond = await readBodyweightLogs();

    // The doc id IS the local date — that is the whole contract. Before PR
    // #1605 each weigh-in wrote an auto-id doc, so this is the assertion the
    // regression would break, and it holds regardless of when the run
    // happens.
    for (const row of afterSecond)
      expect(row.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    if (dayOfSecond === dayOfFirst) {
      // The case being guarded: same local day → still ONE row, same doc id,
      // updated value.
      expect(afterSecond).toHaveLength(1);
      expect(afterSecond[0].id).toBe(firstId);
      expect(afterSecond[0].weight).not.toBe(firstWeight);
    } else {
      // The run straddled local midnight. Two rows is then CORRECT — the
      // premise "same local day" simply did not hold, and asserting one row
      // would be testing the clock, not the upsert. Still check the useful
      // half: one row per day, each keyed by its own date.
      //
      // Kept as a branch rather than a skip so a genuine append regression at
      // 00:00 is still caught; a skip would make the suite blind for a minute
      // each day.
      expect(afterSecond).toHaveLength(2);
      expect(afterSecond.map((r) => r.id).sort()).toEqual(
        [dayOfFirst, dayOfSecond].sort()
      );
    }

    // Either way, the LATEST value must live under the day it was logged on.
    const latest = afterSecond.find((r) => r.id === dayOfSecond);
    expect(latest?.weight).toBe(80.1);
  });
});
