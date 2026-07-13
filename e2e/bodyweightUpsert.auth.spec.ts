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
async function readBodyweightLogs(): Promise<BodyweightRow[]> {
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
    const snap = await getDocs(
      collection(dbc, "users", cred.user.uid, "bodyweightLogs")
    );
    return snap.docs.map((d) => ({
      id: d.id,
      weight: d.data().weight as number,
    }));
  } finally {
    await deleteApp(app);
  }
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
    const afterFirst = await readBodyweightLogs();
    expect(afterFirst).toHaveLength(1);
    const firstId = afterFirst[0].id;
    const firstWeight = afterFirst[0].weight;

    // Correction on the same local day → still ONE row (the upsert contract),
    // same doc id, updated value.
    await logWeight(page, "80.1");
    const afterSecond = await readBodyweightLogs();
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].id).toBe(firstId);
    expect(afterSecond[0].weight).not.toBe(firstWeight);
  });
});
