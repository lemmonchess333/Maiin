# Pre-launch QA checklist (operator-executed)

Single consolidated, prioritized view of the manual / device / production
checks deferred from work that already shipped to feature branches. Automated
tests + `tsc` + lint + the engine parity pins cover the basics; **everything
here needs eyes on a real device, a real account pair, real payment rails, or
a production observation window** — none can be done from a headless code
environment.

Source of truth for the underlying detail remains CLAUDE.md → "Pre-launch QA
backlog"; this file is the execution-ordered overlay. Tick items here as you
clear them.

Priority key: **P0** = launch blocker (billing / security / data-loss / the
state 100% of users hit) · **P1** = correctness verification of shipped code ·
**P2** = UX polish on a device.

---

## Already cleared in code (no operator action — context only)

These were open in the backlog and are now resolved; listed so you don't
re-chase them:

- ✅ **App Check client + rollout plan** — `src/lib/appCheck.ts` is
  code-complete (web reCAPTCHA + native injection seam + diagnostics); the
  per-callable enforcement plan + never-enforce guards are in
  `docs/app-check-rollout.md` (Phase 4b). The _flip_ is still P0 below.
- ✅ **Deferred server-function observability** — verified every backlog log
  line + deployed-source spot-check string is present and matches
  (`dailyRaceReconciliationSweep` `done — noShow/recoveryCleared`,
  `weeklyFellBehindCheck` `done — set/clear`, `onRunCreated` `recovery-entry
written`, `applyPartnerActivity`, `hybrid_score`, `_recoveryEndDateForRace`).
  The _observation cycles_ are still P1 below.
- ✅ **Own-profile lifetime stats** — fixed (was showing public/`limit(10)`
  projection as the total → 0 for private loggers).
- ✅ **Client/server engine parity** — `runEligibility` and plan-validation
  pinned; drift now fails CI.

---

## P0 — Launch blockers

### Billing integrity (needs real payment rails)

- [ ] **Apple subscription uniqueness** — first real iOS purchase creates
      `appleSubscriptions/<originalTransactionId>` with the purchaser's `uid` +
      `productId` + `expiresAt`. Restore on the same Apple ID under the same
      Tropos account updates that doc in-place (timestamp changes, uid stays).
      **Negative test:** call `restoreApplePurchases` from a _second_ test
      account using the first user's `originalTransactionId` (intercept via
      debug) → must throw `"different account"` with no user-doc write.
- [ ] **Stripe webhook dedup** — on the next real webhook delivery, confirm
      `stripeEvents/<event.id>` has BOTH `claimedAt` (new) and `processedAt`.
      Force a handler crash (stripe-cli test event) → the doc is DELETED so
      Stripe's retry re-attempts (pre-fix the partial claim persisted and the
      retry silently skipped).

### Security

- [ ] **App Check enforcement flip** — execute `docs/app-check-rollout.md`:
      Phase 3 (≥99% verified-token rate sustained ≥1 week) → Phase 4b
      per-callable `enforceAppCheck: true`, **low-risk tier first**
      (`askGeminiText` …) → **destructive last** (`deleteMyAccount`,
      `verifyApplePurchase`, `restoreApplePurchases`). **Never** the webhooks
      (`stripeWebhook`, `appleIAPWebhook`). Don't bulk-flip.
- [ ] **Public-profile uid binding** (firestore.rules) — from the client SDK,
      `setDoc(users/<me>/public/profile, { uid: '<other-uid>', … }, {merge})`
      must be **rejected** `permission-denied`. The same write without `uid`
      (or `uid: '<me>'`) still succeeds.
- [ ] **Subscription `expiresAt` guard** — set `subscriptionTier: "pro"` +
      `subscriptionExpiresAt: <past ISO>` on a test user → `useSubscription()
    .isPro` returns **false** on app open (locale-sensitive `Date.parse` of
      the stored string — worth a real roundtrip).

### Multi-account data isolation (two accounts, one device)

- [ ] **Offline + share queue uid scoping** — sign in as A, go offline, log a
      workout. Sign out, sign in as B (same device): A's queued workout must
      NOT appear under B; `localStorage['tropos_offline_queue']` still tagged
      `uid: <A>`. Back to A + online → queue flushes under A. Repeat for the
      share queue (`tropos.share.queue`). Confirm legacy pre-deploy items drop
      on first read (release-note line: upgraders with pending queued writes
      lose them — intended).

---

## P1 — Correctness verification of shipped code

### Server reconciliation observation (production windows; code verified ready)

Each needs the trigger to fire on real user data once. The log lines are
confirmed present — you're confirming behaviour, not wiring.

- [ ] **`dailyRaceReconciliationSweep`** (04:00 UTC) — first firing logs
      `starting` → `done — noShow=X, recoveryCleared=Y`, no `fatal error:`.
      Spot-check a race-prep user whose race passed >3 days ago with no logged
      race: `runDay.status` flips to `race_no_show` within 24h. Recovery-exit
      materialization: a user whose recovery ended >7 days ago with no
      successor race flips to `runMode: "freeform"` + `raceGoal: null`; a user
      who set a FUTURE race during recovery stays `race_prep`.
- [ ] **`weeklyFellBehindCheck`** (Mon 05:00 UTC) — logs `evaluating week …`
      → `done — set=X, clear=Y` with a realistic `set=N` (not every active
      user). A user who ran <50% of weekly target prior week gets
      `programState.pendingFellBehindPrompt`; the `FellBehindSheet` auto-opens
      on Home with correct copy + all three buttons write the expected change.
- [ ] **`onRunCreated` recovery-entry** — a real race-templated saved run at
      ≥95% planned distance logs `recovery-entry written for {uid}`;
      `runPlan.phase` flips to `"recovery"` with the race-day id in
      `completedRaces[]`; the saved run carries top-level `date:"YYYY-MM-DD"`.
- [ ] **Partner-streak server persist** — two mutually-following accounts with
      a bond: log on the same local day as A then B → `partnerBonds/<id>`
      flips `streak 0→1`, `lastSharedDay` today, no `applyPartnerActivity:
    error`. Same-day re-log is a no-op (doc `updateTime` unchanged). An
      `isInvalid`/`savedAnyway`/sub-threshold run does NOT update `lastActive`.
      Freeze ledger uses Monday-anchored week keys.
- [ ] **Global hybrid challenge + `hybrid_score`** — after 00:05 UTC
      `rolloverChallenges`, `challenges/global-monthly-<YYYY-MM-01>` exists
      (`metric: "hybrid_score"`, `participantCount: 0`). Join + log a run
      (≥threshold) and a workout → participant `currentValue` rises by
      ≈`km×100 + kg×0.1`; two sessions → two increments.
- [ ] **BST timezone + challenge increments** (#815) — on a BST day,
      `weeklyPerformanceRollup` / `dailyPerformanceRefresh` log at 23:15 / 02:10
      UTC. On a real workout save, `onWorkoutCreated` logs challenge-progress
      increments (pre-fix this silently TypeErrored).

### Social cold-start — the state 100% of launch users hit

- [ ] **Solo-first feed** — fresh user (0 follows, 0 crew): the curated stack
      (PartnerStreak hero → monthly Hybrid challenge → Share-your-training →
      "Crews unlock…" row) renders top-to-bottom on Feed with no empty/skeleton
      beneath, light + dark. **Note (decided this session):** the smart default
      routes a new user to the **Find/People tab** (locked Soc5c), not Feed — so
      confirm (a) that's still the intended landing, and (b) tapping Feed shows
      the solo stack. Before the first daily rollover the challenge slot should
      collapse cleanly (no broken card). Share card shows the prompt with no
      button until something is logged, then offers "Create a share card".

---

## P2 — UX polish (device-level)

- [ ] **Tooltip + Coachmark** — light + dark visibility (body + arrow) on all 3
      wire-ups (Performance Index, Trajectory delta chip, Programme running
      coachmark). Open a vaul drawer while a tooltip shows → drawer occludes
      (z-50 > z-40). iOS Safari + Capacitor: rubber-band scroll doesn't drift
      the portal. First-use coachmark on the Programme running icon dismisses
      via all paths (anchor tap / outside tap / Escape / 6s timeout) and
      persists across reloads.

---

## Execution batching (to minimise device/account churn)

- **One real iOS device + a sandbox Apple ID:** Apple uniqueness, App Check iOS
  verified-rate, tooltip/coachmark device checks, RunSummary `date` field.
- **Two test accounts on one device:** offline/share queue isolation,
  partner-streak persist, public-profile uid binding, cross-user profile.
- **stripe-cli + a test Stripe account:** webhook dedup (incl. forced crash).
- **Production observation (passive, over 1–2 weeks):** all the scheduled /
  trigger reconciliation items — just watch Cloud Functions logs for the
  confirmed log lines.
