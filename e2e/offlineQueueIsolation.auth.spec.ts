/**
 * PR #820 — offline-queue uid isolation, end-to-end on the real app
 * (the two-account "device test" row in the pre-launch QA backlog).
 *
 * The journey the backlog row describes, driven for real: sign in as A,
 * go offline, log activity (a queued write lands in
 * `localStorage['tropos_offline_queue']` tagged `uid: <A>`), sign out
 * while offline via the app's own Sign Out, sign in as B on the same
 * device/context, prove A's queued write neither appears under B nor
 * leaves the queue, then return as A and watch the queue flush under
 * A's auth — the flushed doc carries `_offlineCreatedAt`, which only
 * `flushQueue` writes, so its presence proves the doc came from the
 * queue rather than any live write path.
 *
 * Vehicle note — the row says "log a workout", but no workout surface
 * routes through the offline queue today: programme completion
 * (`completeWorkoutDay`) commits a `writeBatch` directly (offline it
 * rides the Firestore SDK's own pending-mutation queue + the persisted
 * session draft), and `useWorkouts.saveWorkout` is a pinned orphan
 * export (see symbolReachability). The one UI journey that routes
 * through the queue is the Food page's daily-log write
 * (`DailyLogsProvider.saveLog` → `safeMerge`), triggered by logging a
 * meal. The contract under test — enqueue tagged with uid, survive
 * sign-out and an account switch, never flush under another uid, flush
 * under the owner on return — is identical regardless of which
 * collection the queued write targets.
 *
 * How "offline" is driven — navigator.onLine override, NOT
 * `context.setOffline`. The app's queue gate is `navigator.onLine` on
 * both sides: `safeMerge`/`safeSave` check it before attempting the
 * live write, and AppRoutes' `tryFlush` early-returns on it. Overriding
 * the getter (plus dispatching the offline event) therefore drives the
 * exact branches the queue contract lives on. `context.setOffline` was
 * tried first and hit a rig-level fault: after the offline→online
 * cycle, the Firestore SDK re-establishes its Listen channel but its
 * WebChannel WRITE stream never comes back (observed via network
 * capture: Listen POSTs resume with 200s, no Write channel request is
 * ever issued again), so every later server ack hangs — B's saves sat
 * pending behind latency-compensated UI for >25s across two runs and a
 * page reload (the cache is `persistentLocalCache`, so a reload doesn't
 * clear SDK state either). With the override, the emulator stays
 * reachable throughout — the meal doc itself lands server-side even
 * during A's "offline" window, which is fine: the QUEUED write is the
 * daily log, and every assertion targets `users/{uid}/logs`. What this
 * deliberately does not exercise is Chromium's disconnected network
 * stack — that stays a real-device (airplane-mode) concern.
 *
 * Fixture: two brand-new accounts minted through the real signup form,
 * `onboardingComplete` patched via the emulator's rules-free REST
 * surface (the coachmark-spec pattern) — no dependency on the shared
 * seed user, whose logs other parallel specs write to.
 */
import { test, expect, type Page } from "@playwright/test";
import { emulatorActive } from "./helpers/emulator";

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const PASSWORD = "test-password-123";
const QUEUE_KEY = "tropos_offline_queue";

interface QueueEntry {
  uid: string;
  collectionPath: string;
  docId?: string;
}

interface RestDoc {
  name: string;
  fields?: Record<string, Record<string, unknown>>;
}

test.use({
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

/** Look up a user's uid in the emulator by email (Bearer owner bypasses
 *  auth in the emulator). */
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
  if (!res.ok) {
    throw new Error(`auth emulator query failed: ${await res.text()}`);
  }
  const { userInfo } = (await res.json()) as {
    userInfo?: { localId: string; email?: string }[];
  };
  const localId = userInfo?.find((u) => u.email === email)?.localId;
  if (!localId) throw new Error(`user ${email} not found in auth emulator`);
  return localId;
}

/** Mark the account onboarding-complete via the Firestore emulator's
 *  rules-free REST surface, so the app routes to the full shell. */
async function completeOnboardingDirect(
  uid: string,
  displayName: string
): Promise<void> {
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
          displayName: { stringValue: displayName },
        },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`firestore emulator patch failed: ${await res.text()}`);
  }
}

/** List a user's `logs` subcollection straight from the emulator,
 *  bypassing rules — the server-side ground truth the queue assertions
 *  need (what actually landed, under whom). */
async function listLogDocs(uid: string): Promise<RestDoc[]> {
  const res = await fetch(
    `http://${FS_HOST}/v1/projects/demo-tropos/databases/(default)/documents/users/${uid}/logs`,
    { headers: { Authorization: "Bearer owner" } }
  );
  if (!res.ok) {
    throw new Error(`firestore emulator list failed: ${await res.text()}`);
  }
  const body = (await res.json()) as { documents?: RestDoc[] };
  return body.documents ?? [];
}

function readQueue(page: Page): Promise<QueueEntry[]> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "[]") as never[],
    QUEUE_KEY
  );
}

/** Flip the app's own offline gate: navigator.onLine reads false and
 *  the offline event fires. Real network stays up (see header). The
 *  override is page-session-scoped — any full navigation clears it. */
async function goOffline(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    window.dispatchEvent(new Event("offline"));
  });
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
}

/** Mint a fresh onboarded account through the real signup form, then
 *  leave it signed OUT via the app's own Sign Out (never localStorage
 *  wipes — the queue under test must survive every transition). */
async function mintOnboardedAccount(
  page: Page,
  email: string,
  displayName: string
): Promise<string> {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: /sign up/i })
    .click({ timeout: 20_000 });
  await page.fill("#login-email", email);
  await page.fill("#login-password", PASSWORD);
  await page
    .getByRole("button", { name: /create account/i })
    .click({ timeout: 8_000 });
  // Onboarding step 0 confirms the account + profile doc exist.
  await page
    .getByRole("button", { name: /build muscle/i })
    .waitFor({ state: "visible", timeout: 30_000 });

  const uid = await uidByEmail(email);
  await completeOnboardingDirect(uid, displayName);

  // Reload into the full shell straight onto the account page, then use
  // the app's real Sign Out so auth clears without touching the queue.
  await page.goto("settings/account");
  await signOutViaUI(page);
  return uid;
}

/** Click the app's Sign Out (rendered on /settings/account) and wait
 *  for the Login screen. */
async function signOutViaUI(page: Page): Promise<void> {
  const signOut = page.getByRole("button", { name: "Sign Out" });
  await signOut.waitFor({ state: "visible", timeout: 20_000 });
  await signOut.click();
  await page
    .locator("#login-email")
    .waitFor({ state: "visible", timeout: 20_000 });
}

/** Sign in from an already-rendered Login screen. */
async function signInFromLoginScreen(page: Page, email: string): Promise<void> {
  await page
    .locator("#login-email")
    .waitFor({ state: "visible", timeout: 20_000 });
  await page.fill("#login-email", email);
  await page.fill("#login-password", PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  // Bottom nav renders only under the authed Layout.
  await expect(page.locator("nav").first()).toBeVisible({ timeout: 20_000 });
}

/** Log "2 eggs, toast" through the NL composer (free tier → local
 *  parse, fully deterministic) and wait for the save toast. The meal
 *  write itself always completes here — the network is genuinely up
 *  even inside the "offline" window (see header) — so the toast is a
 *  positive completion anchor in both phases. */
async function logMealViaComposer(page: Page): Promise<void> {
  const composer = page.getByLabel("What did you eat");
  await composer.waitFor({ state: "visible", timeout: 20_000 });
  await composer.fill("2 eggs, toast");
  await page.getByRole("button", { name: "Log meal" }).click();
  await expect(page.getByText(/2 items logged/i)).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("offline-queue uid isolation across an account switch", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Pre-dismiss first-use coachmarks so no floating tooltip sits
      // over the nav/gear taps this journey makes (home capture rig
      // pattern; keys mirror src/hooks/useCoachMarks.ts).
      const BASE = "tropos-coach-marks-dismissed";
      for (const k of [BASE, `${BASE}:social-find-invite`]) {
        try {
          window.localStorage.setItem(k, "1");
        } catch {
          /* storage unavailable — worst case a coachmark shows */
        }
      }
      // The emulator warning banner overlays the bottom of the viewport
      // and intercepts taps on the bottom nav (bodyweight-spec fix).
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          ".firebase-emulator-warning{display:none !important}";
        document.head.appendChild(style);
      });
    });
  });

  test("A's offline write survives B's session untouched and flushes only under A", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const emailA = `offline-a-${stamp}@tropos.test`;
    const emailB = `offline-b-${stamp}@tropos.test`;

    const uidA = await mintOnboardedAccount(page, emailA, "Offline User A");
    const uidB = await mintOnboardedAccount(page, emailB, "Offline User B");

    // ── Phase 1: A goes "offline" mid-session and logs activity.
    await page.goto("/");
    await signInFromLoginScreen(page, emailA);
    await page.goto("food");
    await page
      .getByLabel("What did you eat")
      .waitFor({ state: "visible", timeout: 20_000 });
    await goOffline(page);

    await logMealViaComposer(page);

    // The daily-log write queued under A's uid instead of writing live.
    await expect
      .poll(async () => await readQueue(page), { timeout: 10_000 })
      .toHaveLength(1);
    const [queued] = await readQueue(page);
    expect(queued.uid).toBe(uidA);
    expect(queued.collectionPath).toBe(`users/${uidA}/logs`);
    const queuedDocId = queued.docId;
    expect(queuedDocId).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // …and nothing landed in A's logs collection server-side.
    expect(await listLogDocs(uidA)).toHaveLength(0);

    // ── Phase 2: still "offline", sign out via the app's own UI.
    // Client-side navigation (Food → Home → gear → Account) keeps the
    // page session, and with it the navigator override, alive until the
    // sign-out lands — so no flush can fire under A on the way out.
    await page.getByRole("link", { name: /^Home/ }).click();
    await page.getByLabel("Settings").click({ timeout: 20_000 });
    await page
      .getByRole("button", { name: /sign out, delete account/i })
      .click({ timeout: 20_000 });
    await signOutViaUI(page);

    // Sign-out must not clear the queue.
    expect(await readQueue(page)).toHaveLength(1);

    // ── Phase 3: B signs in on the same device (fresh page session, so
    // navigator.onLine is genuinely true again). B's sign-in runs the
    // AppRoutes mount flush with A's entry present.
    await page.goto("/");
    await signInFromLoginScreen(page, emailB);

    // Positive anchor that B's session is fully wired: B logs a meal,
    // B's OWN daily-log write goes through live (no queue involved).
    await page.goto("food");
    await logMealViaComposer(page);
    await expect
      .poll(async () => (await listLogDocs(uidB)).length, { timeout: 15_000 })
      .toBe(1);

    // Force one more flush pass under B (the same 'online' listener the
    // real reconnect path uses), then hold the line: A's entry is still
    // queued, still tagged A, and nothing has landed in A's collection.
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(1_500);
    const queueDuringB = await readQueue(page);
    expect(queueDuringB).toHaveLength(1);
    expect(queueDuringB[0].uid).toBe(uidA);
    expect(await listLogDocs(uidA)).toHaveLength(0);

    // ── Phase 4: B signs out, A returns; the queue flushes under A.
    await page.goto("settings/account");
    await signOutViaUI(page);
    await signInFromLoginScreen(page, emailA);

    await expect
      .poll(async () => (await listLogDocs(uidA)).length, { timeout: 20_000 })
      .toBe(1);
    const [flushed] = await listLogDocs(uidA);
    // The doc id the queue carried is the doc that landed…
    expect(flushed.name.endsWith(`/logs/${queuedDocId}`)).toBe(true);
    // …with A's offline activity…
    expect(flushed.fields?.meals?.integerValue).toBe("1");
    // …and flush provenance: only flushQueue writes _offlineCreatedAt,
    // so this doc came from the queue, not a live write path.
    expect(flushed.fields?._offlineCreatedAt).toBeDefined();

    // The flush consumed A's entry.
    await expect
      .poll(async () => await readQueue(page), { timeout: 10_000 })
      .toHaveLength(0);
  });
});
