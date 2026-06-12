# Post-deploy verification runbook

The money/data-critical Cloud Functions are **already instrumented** — each emits
a greppable success/failure line (audited 2026-06-12). This runbook turns the
scattered `CLAUDE.md` "pre-launch QA backlog" items into a one-stop checklist:
for each function, the **Cloud Logging filter**, the **expected log line**, and
the **Firestore doc** to spot-check. Run a query in
[Cloud Logging](https://console.cloud.google.com/logs) (project
`adaptive-fitness-af8bb`); all logs carry `resource.type="cloud_function"`.

> Why logs AND a doc check: CI-green proves the code; only a real prod firing
> proves the behaviour. The dedup/bundle-hash gotcha (CLAUDE.md) means a green
> deploy workflow does NOT prove the new bundle uploaded — so for any function
> touched in a deploy, also spot-check the deployed source in the Console.

---

## Scheduled sweeps (fire on their cron; check the next natural firing)

### `dailyRaceReconciliationSweep` — 04:00 UTC daily

- **Filter:** `jsonPayload.message=~"dailyRaceReconciliationSweep"` (or text search `dailyRaceReconciliationSweep`)
- **Expect (in order):** `dailyRaceReconciliationSweep: starting` → `dailyRaceReconciliationSweep: done — noShow=X, recoveryCleared=Y, noShowCleared=Z`. **No** `fatal error:` line.
- **Spot-check:** a race-prep user whose race date passed >3 days ago with no logged race → `programState.runPlan.status` (or runDay) flips to `race_no_show` within 24h. A user whose recovery ended >7 days ago with no successor race → profile flips to `runMode:"freeform"`, `raceGoal:null`; `programState.runPlan` has `phase:null`, `recoveryEndDate:null`. A user who set a NEW future race during recovery stays `race_prep` with that goal.

### `weeklyFellBehindCheck` — Mondays 05:00 UTC

- **Filter:** text `weeklyFellBehindCheck`
- **Expect:** `weeklyFellBehindCheck: starting` → `weeklyFellBehindCheck: evaluating week YYYY-MM-DD (Sun..Sat)` → `weeklyFellBehindCheck: done — set=X, clear=Y`. `set=N` should be a realistic small count (pre-#815 bug it was every-active-user).
- **Spot-check:** a user who ran <50% of their weekly target the prior week → `programState.pendingFellBehindPrompt` present. Logging in as them, `FellBehindSheet` auto-opens on Home with "X of N runs (Y%)".

### `weeklyPerformanceRollup` (Sun 23:15 UTC) / `dailyPerformanceRefresh` (02:10 UTC)

- **Spot-check (BST fix #815):** the log timestamps land at **23:15** / **02:10 UTC** — not 22:15 / 01:10 (the pre-fix Europe/London drift).

---

## Triggers (fire on a real workout/run/activity save)

### `onWorkoutCreated` / `onRunCreated`

- **Filter:** text `onWorkoutCreated` / `onRunCreated`
- **Expect on a real save:** challenge-progress increments logged (pre-#815 this silently TypeError'd on `participantSnap.exists()`); for a race-templated run at ≥95% planned distance on the race date, `onRunCreated: recovery-entry written for {uid}` and `programState.runPlan.phase` flips to `"recovery"`. **No** `applyPartnerActivity: error` line.

### Partner-streak persist (`applyPartnerActivity`) — Soc7

- **Filter:** text `applyPartnerActivity`
- **Expect (NEW success log):** with two mutually-followed bonded accounts both logging on the same local day → `applyPartnerActivity: bond <id> streak→1 lastShared=YYYY-MM-DD (uid …, day …)`. A **same-day re-log emits NO line** (the no-op-skip path) — that absence IS the confirmation. An ineligible run (`isInvalid`/`savedAnyway`/sub-threshold) → no line (gated upstream).
- **Spot-check:** `partnerBonds/<id>` doc — `streak 0→1`, `lastSharedDay`=today. Over a gap that consumes a freeze, `freezeWeek.<uid>` is the **Monday-anchored** week key.

### Global hybrid challenge + `hybrid_score` sync — Soc8

- After the 00:05 UTC `rolloverChallenges`: `challenges/global-monthly-<YYYY-MM-01>` exists, `metric:"hybrid_score"`, `participantCount:0`.
- Join it, log a run (≥threshold) + a workout with volume → participant `currentValue` rises by ≈`km×100 + kg×0.1`; two sessions → two increments (distinct `applied/<sourceId>` markers).

---

## Billing (fire on a real purchase / webhook)

### Apple subscription uniqueness — #822 (`restoreApplePurchases`)

- **Filter:** text `applySubscriptionToUser`
- **Expect:** first purchase → `appleSubscriptions/<originalTransactionId>` doc created with `uid`, `productId`, `expiresAt`. Restore on same Apple ID + same Tropos account → that doc updates in place (uid stays). **Negative test:** a different account replaying the first user's `originalTransactionId` → throws `"different account"` (logged `applySubscriptionToUser.ownership_conflict`) and **no** user-doc write lands.

### Stripe webhook dedup — #822 (`stripeWebhook`)

- **Filter:** text `stripeWebhook`
- **Expect:** on a real delivery, `stripeEvents/<event.id>` has both `claimedAt` (set at claim) AND `processedAt` (set after success). A re-delivery → `stripeWebhook: duplicate delivery for <id>, skipping`. **Crash test** (stripe-cli forced failure mid-process) → `stripeWebhook: processing error:` then the claim doc is **deleted** (so the retry re-attempts, not silently skipped).

---

## App Check enforcement rollout (operator monitoring, not a firing)

- Firebase Console → App Check → APIs → Cloud Functions: target **≥99% verified for ≥7 days** before flipping `enforceAppCheck` per-callable. If low, query `jsonPayload.appCheck.status=("MISSING" OR "INVALID")` to see which callables/uids lack tokens (usual culprit: native iOS until the Capacitor App Check plugin lands). Flip low-risk callables first (`askGeminiText`); keep `deleteMyAccount` / `verifyApplePurchase` for last.
