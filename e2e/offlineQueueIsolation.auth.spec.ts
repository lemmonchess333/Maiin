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
 * clear SDK state either). The override keeps offline fidelity anyway:
 * the Firestore SDK's own connectivity monitor listens for the same
 * browser offline event, so it parks live writes locally exactly as
 * under real airplane mode (A's meal write pends and only drains when A
 * next signs in online) — but because the emulator was never actually
 * unreachable, the SDK's write stream comes back cleanly afterwards.
 * Every queue assertion targets `users/{uid}/logs`. What this
 * deliberately does not exercise is Chromium's disconnected network
 * stack — that stays a real-device (airplane-mode) concern.
 *
 * The SHARE queue (`tropos.share.queue`, PR #820's second row) rides
 * the same journey, and since the #1887 fix (this PR) the ENQUEUE half
 * is driven for real: still offline, A saves a synthetic finished run
 * through the actual RunSummary journey (the page hydrates from router
 * navigation state — no GPS involved), shares it to followers, and the
 * pre-gated offline branch queues the post with the once-unreachable
 * "Post queued" toast asserted. Before #1887, every enqueueShare site
 * sat behind an awaited Firestore write that PARKS offline (the SDK
 * durably queues the mutation and acks only on reconnect; it never
 * rejects for connectivity), so the share queue was drain-only
 * machinery — the fix pre-gates those saves on navigator.onLine and
 * proceeds on the durable local commit. B's pending share is seeded
 * (the exact PendingShare shape) as the drain-completion anchor: B's
 * drain (ShareComposerSheet's [isOnline, uid] effect → drainQueue →
 * postActivity) must post B's share and leave A's REAL entry queued
 * with no A-authored activity doc existing; A's return drains A's
 * share under A's auth and empties the queue.
 *
 * Fixture: two brand-new accounts minted through the real signup form,
 * `onboardingComplete` patched via the emulator's rules-free REST
 * surface (the coachmark-spec pattern) — no dependency on the shared
 * seed user, whose logs other parallel specs write to.
 */
import { test, expect, type Page } from "@playwright/test";
import { emulatorActive } from "./helpers/emulator";
import { suppressCoachmarks } from "./helpers/suppressCoachmarks";

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const PASSWORD = "test-password-123";
const QUEUE_KEY = "tropos_offline_queue";
const SHARE_QUEUE_KEY = "tropos.share.queue";

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

/** Wait until the signup's own profile write has landed server-side.
 *  `writeNewProfileDocs` commits the FULL default profile from the
 *  browser as a non-merge batch (including `onboardingComplete: false`)
 *  concurrently with the onboarding screen rendering — patching before
 *  it lands loses the race, because the batch then clobbers the patch
 *  and the account stays stuck in onboarding (observed live). Poll for
 *  `athleteType`, a field only that batch writes. */
async function awaitSignupProfileDoc(uid: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const res = await fetch(
      `http://${FS_HOST}/v1/projects/demo-tropos/databases/(default)/documents/users/${uid}`,
      { headers: { Authorization: "Bearer owner" } }
    );
    if (res.ok) {
      const body = (await res.json()) as RestDoc;
      if (body.fields?.athleteType) return;
    }
    if (Date.now() > deadline) {
      throw new Error(`signup profile doc for ${uid} never landed`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
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

function readShareQueue(page: Page): Promise<QueueEntry[]> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "[]") as never[],
    SHARE_QUEUE_KEY
  );
}

/** Count `activities` docs authored by `uid`, straight from the
 *  emulator. The collection is shared across parallel spec runs, so
 *  always filter by this run's own (fresh) uids. */
async function activitiesByAuthor(uid: string): Promise<number> {
  const res = await fetch(
    `http://${FS_HOST}/v1/projects/demo-tropos/databases/(default)/documents/activities?pageSize=300`,
    { headers: { Authorization: "Bearer owner" } }
  );
  if (!res.ok) {
    throw new Error(`firestore emulator list failed: ${await res.text()}`);
  }
  const body = (await res.json()) as { documents?: RestDoc[] };
  return (body.documents ?? []).filter(
    (d) => (d.fields?.authorId as { stringValue?: string })?.stringValue === uid
  ).length;
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
  await awaitSignupProfileDoc(uid);
  await completeOnboardingDirect(uid, displayName);

  // Reload into the full shell straight onto the account page, then use
  // the app's real Sign Out so auth clears without touching the queue.
  await page.goto("settings/account");
  await signOutViaUI(page);
  return uid;
}

/** A fresh account's FIRST logged activity earns a badge, and the
 *  BadgeEarnedModal celebration (fixed inset-0 z-50, mounted by the
 *  authed-root streaks provider over whatever page is showing)
 *  swallows pointer events until dismissed — CI caught it intercepting
 *  the Settings-gear tap for 35 straight actionability retries while
 *  local runs happened to win the race. Dismiss it the way a user
 *  does: backdrop taps crack the seal, one more dismisses. Bounded and
 *  best-effort — when no celebration is pending this costs one short
 *  probe. */
async function dismissBadgeCelebration(
  page: Page,
  probeMs: number
): Promise<void> {
  const dialog = page.getByRole("dialog", { name: /badge/i });
  try {
    await dialog.waitFor({ state: "visible", timeout: probeMs });
  } catch {
    return; // no celebration pending
  }
  for (let i = 0; i < 10 && (await dialog.isVisible()); i++) {
    await page.mouse.click(8, 300);
    await page.waitForTimeout(350);
  }
  await expect(dialog).not.toBeVisible();
}

/** Click the app's Sign Out (rendered on /settings/account) and wait
 *  for the Login screen. */
async function signOutViaUI(page: Page): Promise<void> {
  const signOut = page.getByRole("button", { name: "Sign Out" });
  await signOut.waitFor({ state: "visible", timeout: 20_000 });
  // The badge celebration can mount late over this page too (both
  // accounts log their first activity in this journey).
  await dismissBadgeCelebration(page, 1_000);
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
 *  parse, fully deterministic). Online, the save-ack toast is the
 *  completion anchor. Offline it can never fire — the dispatched
 *  offline event also parks the Firestore SDK's own network layer, so
 *  the meal write pends exactly as under real airplane mode — and the
 *  latency-compensated diary row is the signal that the save path ran
 *  (which is what fires the queued daily-log write). */
async function logMealViaComposer(
  page: Page,
  opts: { expectAck: boolean }
): Promise<void> {
  const composer = page.getByLabel("What did you eat");
  await composer.waitFor({ state: "visible", timeout: 20_000 });
  await composer.fill("2 eggs, toast");
  await page.getByRole("button", { name: "Log meal" }).click();
  if (opts.expectAck) {
    await expect(page.getByText(/2 items logged/i)).toBeVisible({
      timeout: 15_000,
    });
  } else {
    await expect(page.getByText(/eggs/i).first()).toBeVisible({
      timeout: 15_000,
    });
  }
}

test.describe("offline-queue uid isolation across an account switch", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    // Diagnostic breadcrumbs for CI triage: Firestore emulator traffic
    // and app console errors land in the Playwright stdout, so a
    // failure shows whether the SDK's Write channel was ever opened.
    page.on("request", (r) => {
      if (r.url().includes(":8080/google.firestore"))
        console.log(`[fs-req] ${r.method()} ${r.url().slice(0, 140)}`);
    });
    page.on("requestfailed", (r) => {
      console.log(
        `[req-failed] ${r.method()} ${r.url().slice(0, 140)} :: ${r.failure()?.errorText}`
      );
    });
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning")
        console.log(`[console-${m.type()}] ${m.text().slice(0, 200)}`);
    });
    // Keep first-use coachmarks off the nav/gear taps this journey makes.
    // Suppressed by shape rather than by key: dismissals are scoped per
    // account now, and this spec deliberately signs in as TWO of them.
    await suppressCoachmarks(page);
    await page.addInitScript(() => {
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

    await logMealViaComposer(page, { expectAck: false });

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
    // The user-facing offline banner counts the queued change.
    await expect(page.getByText(/1 change saved locally/i)).toBeVisible({
      timeout: 10_000,
    });

    // A's first activity just landed — give its badge celebration time
    // to mount and clear it before the click-through navigation below.
    await dismissBadgeCelebration(page, 4_000);

    // ── Phase 1b (#1887): the REAL share enqueue, via the run-save
    // journey. RunSummary hydrates from router navigation state, so
    // push a synthetic finished run client-side (5km / 30min — well
    // above the invalid-run thresholds; no GPS points needed) — the
    // page session, and with it the navigator override, survives.
    await page.evaluate(() => {
      const runData = {
        points: [],
        distance: 5000,
        elapsed: 1800,
        splits: [],
        elevationGain: 0,
      };
      history.pushState(
        { usr: runData, key: "e2e-run", idx: (history.state?.idx ?? 0) + 1 },
        "",
        "/Maiin/run-summary"
      );
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: history.state })
      );
    });
    await page
      .getByRole("button", { name: "Save Run" })
      .click({ timeout: 20_000 });
    // Pre-#1887 this await parked forever offline; now the save
    // confirms on the durable local commit and the composer opens.
    await expect(page.getByText("Run saved")).toBeVisible({
      timeout: 15_000,
    });
    await page
      .getByRole("button", { name: "Share to followers" })
      .click({ timeout: 15_000 });
    // The once-unreachable queued-post toast, now reachable:
    await expect(page.getByText(/Post queued/i)).toBeVisible({
      timeout: 10_000,
    });
    const sharesAfterEnqueue = await readShareQueue(page);
    expect(sharesAfterEnqueue).toHaveLength(1);
    expect(sharesAfterEnqueue[0].uid).toBe(uidA);
    // Nothing posted anywhere — the share is parked, not published.
    expect(await activitiesByAuthor(uidA)).toBe(0);

    // Back to Food (client-side), clearing the post-session prompts a
    // first run can raise: a fresh badge celebration and the streak
    // reminder priming modal ("No thanks" is its once-ever decline).
    await page.goBack();
    await dismissBadgeCelebration(page, 2_000);
    try {
      await page
        .getByRole("button", { name: "No thanks" })
        .click({ timeout: 2_000 });
    } catch {
      /* priming modal didn't fire — coordinator gating varies */
    }

    // ── Phase 2: still "offline", sign out via the app's own UI.
    // Client-side navigation (Food → Home → gear → Account) keeps the
    // page session, and with it the navigator override, alive until the
    // sign-out lands — so no flush can fire under A on the way out.
    await page.getByRole("link", { name: /^Home/ }).click();
    await dismissBadgeCelebration(page, 1_000);
    await page.getByLabel("Settings").click({ timeout: 20_000 });
    await page
      .getByRole("button", { name: /sign out, delete account/i })
      .click({ timeout: 20_000 });
    await signOutViaUI(page);

    // Sign-out must clear neither queue. The write queue may hold MORE
    // than one entry by now — remounting /food offline (the goBack from
    // the run summary) re-fires the daily-log effect, which queues the
    // same date-keyed merge write again. Real behavior, and convergent:
    // duplicates target one docId and merge idempotently on flush. What
    // matters here is that every entry is A's daily-log write.
    const queueAtSignOut = await readQueue(page);
    expect(queueAtSignOut.length).toBeGreaterThanOrEqual(1);
    for (const entry of queueAtSignOut) {
      expect(entry.uid).toBe(uidA);
      expect(entry.collectionPath).toBe(`users/${uidA}/logs`);
      expect(entry.docId).toBe(queuedDocId);
    }
    expect(await readShareQueue(page)).toHaveLength(1);

    // ── Phase 3: B signs in on the same device (fresh page session, so
    // navigator.onLine is genuinely true again). B's sign-in runs the
    // AppRoutes mount flush with A's entry present. "A's entry is still
    // queued" is a NEGATIVE claim, and a negative under a timer proves
    // nothing (the CLAUDE.md waitFor rule) — so anchor it: seed a
    // second queued entry tagged with B's uid, exactly the shape the
    // app itself queues, before B signs in. The same flush pass must
    // consume B's entry and skip A's — when B's doc lands server-side,
    // the scan provably ran to completion over both entries.
    const anchorDate = new Date(Date.now() - 86_400_000).toLocaleDateString(
      "en-CA"
    );
    await page.evaluate(
      ([key, uid, date]) => {
        const queue = JSON.parse(
          localStorage.getItem(key) ?? "[]"
        ) as unknown[];
        queue.push({
          id: crypto.randomUUID(),
          uid,
          collectionPath: `users/${uid}/logs`,
          docId: date,
          merge: true,
          data: { date, workouts: 0, meals: 1, hasPR: false, notes: "" },
          timestamp: Date.now(),
        });
        localStorage.setItem(key, JSON.stringify(queue));
      },
      [QUEUE_KEY, uidB, anchorDate] as const
    );

    // SHARE queue: A's entry is REAL (enqueued by the run-save journey
    // in phase 1b). Append a seeded entry for B — the exact
    // PendingShare shape enqueueShare writes — as the drain-completion
    // anchor: the same drain pass that posts B's must keep A's.
    await page.evaluate(
      ([key, b]) => {
        const queue = JSON.parse(
          localStorage.getItem(key) ?? "[]"
        ) as unknown[];
        queue.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          uid: b,
          payload: {
            authorId: b,
            authorName: "Offline User B",
            type: "workout",
            visibility: "followers",
            workoutName: "Queued Session",
            activityTitle: "Queued Session",
            exerciseCount: 1,
            totalVolume: 100,
            duration: 600,
            muscleGroups: [],
          },
          queuedAt: Date.now(),
        });
        localStorage.setItem(key, JSON.stringify(queue));
      },
      [SHARE_QUEUE_KEY, uidB] as const
    );

    await page.goto("/");
    await signInFromLoginScreen(page, emailB);

    // B's mount flush consumed B's entry — with flush provenance…
    await expect
      .poll(
        async () =>
          (await listLogDocs(uidB)).some(
            (d) =>
              d.name.endsWith(`/logs/${anchorDate}`) &&
              d.fields?._offlineCreatedAt !== undefined
          ),
        { timeout: 20_000 }
      )
      .toBe(true);
    // …so the queue settling back to exactly A's entries is the SAME
    // pass keeping them, not a timer hoping nothing happened.
    await expect
      .poll(async () => await readQueue(page), { timeout: 10_000 })
      .toHaveLength(queueAtSignOut.length);
    for (const kept of await readQueue(page)) {
      expect(kept.uid).toBe(uidA);
    }
    expect(await listLogDocs(uidA)).toHaveLength(0);

    // Share drain, same doctrine: B's pending share posts (the drain
    // pass provably completed)…
    await expect
      .poll(async () => await activitiesByAuthor(uidB), { timeout: 20_000 })
      .toBe(1);
    // …while that same pass kept A's share queued, and no A-authored
    // activity exists anywhere.
    await expect
      .poll(async () => await readShareQueue(page), { timeout: 10_000 })
      .toHaveLength(1);
    const [keptShare] = await readShareQueue(page);
    expect(keptShare.uid).toBe(uidA);
    expect(await activitiesByAuthor(uidA)).toBe(0);

    // B's live writes flow normally too (the online branch, no queue):
    // log a meal, see it ack and land beside the flushed anchor doc.
    await page.goto("food");
    await logMealViaComposer(page, { expectAck: true });
    await expect
      .poll(async () => (await listLogDocs(uidB)).length, { timeout: 15_000 })
      .toBe(2);

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

    // A's return also drains A's pending share — the post lands under
    // A's auth and the share queue empties.
    await expect
      .poll(async () => await activitiesByAuthor(uidA), { timeout: 20_000 })
      .toBe(1);
    await expect
      .poll(async () => await readShareQueue(page), { timeout: 10_000 })
      .toHaveLength(0);
  });
});
