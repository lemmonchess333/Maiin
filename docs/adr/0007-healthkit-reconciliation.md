---
Status: accepted
---

# HealthKit / Health Connect reconciliation with Tropos's own health data

## Context

Tropos is an iOS-first Capacitor app that will read from Apple HealthKit
(and, on Android, Health Connect). `POST_LAUNCH.md` and
`docs/heart-rate-healthkit.md` describe the *mechanics* (add the plugin, query
steps/HR, wire the Home tile). They deliberately deferred the hard part:
`docs/adaptive-paces-design.md:119,159` locks "no entanglement v1 (avoid
double-count)" for paces, and the same unanswered question applies to the whole
health-data surface. This ADR answers it: **how HealthKit/Health Connect data
reconciles with the numbers Tropos already computes, per data type, without
double-counting energy, without echo loops, and without a mid-history connect
silently rewriting streaks, the adaptive target, or historical budgets.**

This is a data-model / state-machine decision where being subtly wrong is
expensive and invisible. It was drafted as a decision grill, pressure-tested by
an adversarial pass, and the four blockers that pass found (all verified in
code) are folded into the decisions below.

### The one invariant everything hangs on: Tropos has **no eat-back budget**

Verified in three places (`src/utils/dailyBurn.ts:10-13`,
`src/hooks/useEffectiveTargets.ts:49-58,364`, `src/utils/calorieBalance.ts:21-28`):

- The daily calorie **target** is `profile.targetCalories` — Mifflin-St Jeor BMR
  × a static self-reported `activityLevel` multiplier (`src/lib/tdee.ts:22-28`),
  phase-adjusted, written once. It **already** accounts for typical daily
  activity via that multiplier.
- Completed workout/run/step burn is **never added back** to the target. The
  burn figures (`actualLiftBurn` + `actualRunBurn`, `useEffectiveTargets.ts:366-383`)
  are **display-only** — the "Burned today · already in your target" breakdown
  (`TodayEnergy.tsx:239-273`).
- For Pro/trial users who have "warmed up", the target is replaced by a
  **learned/adaptive TDEE** (`src/lib/adaptiveTdee.ts:102-164`) that infers true
  maintenance expenditure algebraically from **logged intake + bodyweight trend
  only** — no workout/run/step burn enters it.

So "which HealthKit data enters the calorie math" has a clean answer available:
**none of it, as an additive energy term** — because the app's model is already a
closed, no-eat-back loop, and the learned engine already *contains* whatever a
Watch would measure (see §Decision Q2). This is the spine of the whole ADR.

### The platform-seam precedent

Tropos has an established "swap-point seam" used twice (`src/lib/appCheck.ts`,
`src/lib/analyticsProvider.ts`; `analyticsProvider.ts:5` says it "mirrors the
`appCheck.ts` swap-point shape") and two no-op capability seams already model
the exact HealthKit shape (`src/lib/heartRateSource.ts`,
`src/lib/locationSource.ts`). HealthKit reconciliation adds a **third instance**
of this seam, not a new pattern.

## Decision

The reconciliation model in one line: **HealthKit/Health Connect supplies only
the signals Tropos genuinely cannot produce itself — step count, heart rate,
and weigh-in convenience — and contributes exactly zero energy terms to the
target, burn, balance, or adaptive-TDEE math.**

### Q1 + Q2 — source-of-truth per data type, and the double/triple-count trap

The single-energy-number rule: the ring/progress target is `finalTarget`, derived
through the locked chain **formula (`tdee.ts`) → learned override
(`adaptiveTdee.ts`, when `source==='learned'`) → taper override
(`taperNutrition.ts`)**. HealthKit contributes **zero** terms to that chain and
to every downstream burn/balance figure. The app stops computing **nothing** —
it keeps all its own numbers exactly as-is and *refuses* HealthKit energy as an
input.

| Data type | Source of truth | Enters calorie math? | Conflict / echo rule |
| --- | --- | --- | --- |
| **Steps** | HealthKit-wins (sole source; no app pedometer) | **NO — a display COUNT only.** `estimateStepCalories` (`dailyBurn.ts:50-53`) stays dead code; `Home.tsx:280` `stepCals` stays hardcoded `0`. Steps **never emit a kcal figure anywhere** (absolute rule — see blocker fix). | Read-only via `HKStatisticsQuery` day-aligned to **local** date; never sum raw samples (auto-dedupes iPhone+Watch only as a statistics query). No echo path. |
| **Active Energy** | app-wins (**refused as input**) | **NO — never read into `finalTarget`, `actualBurn`, `calcDayBalance`, or the adaptive regression.** | Not ingested at all. If a passive "Apple's estimate" cross-check card is ever shown (product call), it lives **outside** the summed `TodayEnergy` breakdown and uses a Tropos-source-excluding read predicate (see echo blocker). |
| **Body mass** | **merge** | **Indirectly + intentionally** — real weigh-ins feed the adaptive-TDEE slope + weight-trend, which is *correct* (better signal). No new additive term. | Canonical store stays `users/{uid}/bodyweightLogs`; **one row per local date, keyed by doc-id = date** (blocker fix). Row tagged `source:'manual'\|'healthkit'`. Manual entry is authoritative for its date; HealthKit fills only empty dates. |
| **Workouts** | app-wins | **NO new term.** `actualLiftBurn`/`actualRunBurn` stay derived from app-logged docs via app-owned formulas. | `HKWorkout` samples are **never** auto-ingested into `computeActiveDateSet`, `syncChallengeProgress`, or the performance engine. Import = display-only or an explicit per-item "log this" tap. |
| **Heart rate** | HealthKit-wins (sole source; no app sensor) | **NO.** Run burn is distance-based, lift burn MET/duration-based; neither uses HR. | Live samples for zones/effort display only; extends the existing `heartRateSource.ts` seam. Multiple HR sources (Watch + strap) need explicit source selection — no auto-dedupe. |
| **Sleep** | HealthKit-wins *if surfaced* | **NO — and v1 does not ingest it** (zero existing consumer). | Deferred behind the seam; display-only if a later arc needs it. |

**Why refusing Active Energy is right, not lazy (the argue-against, answered).**
The strongest case for eat-back: Active Energy from an accelerometer + HR is the
most accurate expenditure signal on the device, and MyFitnessPal / Lose It! /
Apple rings all eat back measured burn, so a Watch user will read Tropos as
"ignoring my Watch." Why it loses: Tropos's no-eat-back model is deliberate
(`dailyBurn.ts:10-13`), and the learned TDEE (`adaptiveTdee.ts:102-164`) already
infers true maintenance from intake + mass — a closed, outcome-based estimate
that **structurally already contains** whatever the Watch would measure, without
MFP's notorious open-loop eat-back overestimation spiral. Feeding Active Energy on
top would double-count against **both** the `activityLevel` multiplier **and** the
mass-derived learned TDEE, degrading a self-correcting estimator into a
self-referential loop. The sensor is not wasted — it is *superseded*. Its correct
role is exactly the things the app cannot infer (steps, HR, weigh-in
convenience), and that weigh-in stream is what feeds the regression that makes
Active Energy redundant.

### Q3 — bidirectional body weight (canonical store, conflict, echo prevention)

- **Canonical store:** `users/{uid}/bodyweightLogs`, **one row per local date,
  doc-id = date** (`YYYY-MM-DD`). This is a **required change**: today the write
  is `addDocGuarded(...)` with an auto-ID and `date` as a field
  (`src/pages/Home.tsx:465-469`), so "upsert by date" does **not** exist and a
  HealthKit sync racing a manual weigh-in would append a second row for the same
  date and double-weight the non-deduping consumers. Migrate the manual write to
  `setDocGuarded(doc(..., 'bodyweightLogs', date), {...}, {merge:true})` (or a
  transaction) so the sync writer and manual writer collide safely on one key.
- **Conflict rule:** manual entry wins for its date; HealthKit fills only empty
  dates; among HealthKit candidates the latest sample of the local day wins.
- **Echo/loop prevention (two layers):** (1) reads use an `HKSampleQuery` source
  predicate excluding **the currently-running bundle** (not a hardcoded id — dev
  `com.tropos.dev` vs prod `com.tropos.app` write under different `HKSource`s, so
  a hardcoded predicate re-ingests prior-variant samples); (2) doc-id = date +
  manual precedence drops any leaked echo. **Known residual:** a third-party
  Health app that re-publishes Tropos's weigh-in under *its own* bundle launders
  past the source predicate — caught only if a manual row already occupies that
  date. Accept and document; do not pretend it's closed.
- **Trend safety:** only `TrendWeight.tsx` dedups by date; `calcWeightTrend`
  (`weightTrend.ts`) and the adaptive slope fit (`adaptiveTdee.ts:120-148`) do
  **not** — so one-row-per-date **at write time** is the mechanism that keeps
  avg7d, the EMA line, and the learned TDEE from being skewed.

### Q4 — write-back policy

- **Body weight: YES (opt-in, HealthKit write permission).** New/edited manual
  weigh-ins mirror to HealthKit. Echo prevented by the source predicate + upsert.
  **Must mirror deletes/edits:** a one-way write-back leaks a retracted value —
  if a user deletes/corrects a weigh-in in Tropos, delete/update the corresponding
  HealthKit sample.
- **Workouts: YES (opt-in) — write `HKWorkout`** (with the app's own
  `totalEnergyBurned`) for the activity-ring-closing value users expect from
  Strava/NRC. Re-ingestion is a non-issue on two grounds: reads exclude
  Tropos-authored workouts, **and** HealthKit workouts never enter the
  energy/streak/challenge/PI math at all, so even a re-read can't double-count.
- **Active Energy: write NONE** as a standalone type (the per-workout total on the
  `HKWorkout` is enough; the app owns no authoritative standalone active-energy
  figure).
- All write-back sits behind the seam: opt-in, per-type, revocable, never-throws.

### Q5 — partial grants, availability, and the web-visible seam

- **Per-type grants degrade independently** — no all-or-nothing gate. Steps
  granted / energy denied is the *normal* case and costs nothing (Active Energy is
  never used regardless). Each consumer checks availability and falls back: steps
  tile → count or "Connect Health" placeholder; HR → live or age-estimate max
  (`useHeartRate` already does this); weight sync optional, manual weigh-in always
  works.
- **No HealthKit at all** (older iOS, or Android without Health Connect): the app
  is exactly today's app-only behaviour. No feature is locked out.
- **The seam:** add `src/lib/healthDataSource.ts` following the **`appCheck.ts`
  registration-seam** flavour (a `setNativeHealthProvider(factory)` swap-point,
  since no plugin is installed yet) — mirroring the shipped
  `heartRateSource.ts`/`locationSource.ts`. The **web provider reports
  `available:false` for every type**, and the identical UI renders (placeholder
  step tile, working manual weigh-in, age-estimate HR) so the feature stays
  **exercisable in the web dev/preview loop**. The `HKWorkout` write-back toggle
  and any Active-Energy card must **also render on web** in a "not available on
  web" state — not be invisible until on-device (the repo's parity rule).
- **Persisted state:** grant + `lastSyncedAt` per type in a new nested
  `profile.healthkitSyncState`, added to **all three** gates — `profileFieldRegistry`
  (`sanitized:true`), `functions/profileSanitizer.js` validators (null-clearable
  `cleanObject`), and `firestore.rules` `allowedUserFields()` — per the
  `adaptiveCapState` precedent, or the write is silently dropped. Plus the
  `POST_LAUNCH`-specced `users/{uid}/settings/healthKit` permission-shown flag so
  priming doesn't re-fire across devices.

### Q6 — connect-mid-history (backfill), by blast radius

- **Steps: backfill freely** — but **contingent** on steps remaining
  consumer-free. This is a discipline, not an invariant: the day any "active day
  includes N steps" or step-kcal feature lands, free step backfill silently
  becomes a retroactive streak/energy rewrite. Note it at the wiring site.
- **Body weight: backfill YES, only into dates with no manual entry**, via the
  doc-id=date upsert. Two hazards the design must own:
  1. **Engine-flip discontinuity.** Adaptive readiness needs `minWeighIns=8`,
     `minSpanDays=14`; a first-connect backfill can satisfy all gates in **one
     sync**, flipping `resolveTargetSource` formula→learned instantly.
     `applyWeeklyCap` bounds the *jump* (±150 kcal/7d) but **not** the engine
     switch or the sustained drift a steep imported slope causes. Decision: gate
     the formula→learned flip on a *settling window* after connect (e.g. require
     N days of post-connect logging before `learned` engages), not on backfilled
     rows alone. **Product/engineering call flagged.**
  2. **Window nuance.** The adaptive slope reads only the trailing 21-day window,
     so most first-connect weigh-ins (older than 21 days) do **not** improve the
     regression — they reshape `calcWeightTrend` (last-30-by-count), the EMA line,
     and the goal-date ETA, none bounded by any cap. That is the real retroactive
     UI blast radius.
- **Historical daily budgets ARE recomputed today — this must be fixed or
  scoped.** The claim "past budgets are point-in-time" is **false**:
  `CalorieBalanceChart.tsx:48-58` derives `maintenance` from **current**
  `profile.weightKg` and applies it to all 14 past days. So *any* weight change
  (backfill or a normal weigh-in) already retroactively rewrites every historical
  balance bar. HealthKit doesn't create this bug but amplifies it. Decision:
  either persist per-day expenditure point-in-time, or explicitly accept that the
  balance chart is a "recomputed-at-current-weight" view and label it so —
  **product call**, but the backfill design must not claim protection it doesn't
  have.
- **Workouts: NO silent backfill.** Historical `HKWorkout`s are never bulk-injected
  into `computeActiveDateSet` (`useStreaks.tsx:158-186,714-721`), challenges, or
  the performance engine — that would retroactively revive/extend streaks and move
  badges (a cheat + honesty violation). Import = display-only or explicit per-item
  logging; imported past sessions do not count toward challenges/PRs (product call).
- **Scale guard:** `fetchBodyweightLogs` reads the whole subcollection with **no
  limit** — years of Apple Health weight backfilled as thousands of rows bloats
  every trend/adaptive read and spikes write cost. Window or cap the backfill
  (streaks are windowed at 400/500; weight is not windowed at all).

## Consequences

- **One energy number is preserved** across the target, burn breakdown, balance
  chart, and adaptive TDEE — HealthKit adds display signals (steps, HR) and
  weigh-in convenience, never an energy term. The app diverges from MFP-style
  eat-back *on purpose* and must be visibly better on outcomes, not by copying it.
- **Three writes must be transactional/keyed to be safe:** the weigh-in write
  (doc-id=date), the background sync writer (uid-scoped + debounced per the
  `onAuthStateChanged`-multifire + PR#820 queue-scoping precedent), and local-date
  bucketing pinned at the sync writer to match how manual weigh-ins derive `date`
  (a HealthKit instant near local midnight must bucket by **local** time, or one
  physical day gets two keys).
- **Health Connect is not "the same seam."** It differs structurally: it
  **auto-revokes all permissions after ~30 days unopened** (a lapsed-and-returning
  user silently loses sync — a real segment per the design-for-1000-users rule);
  echo-exclusion is by `DataOrigin` package name, not an `HKSource` predicate; and
  historical reads sit behind a **separate** read-history permission (backfill can
  be live-granted but history-denied). The seam interface must model these, not
  paper over them.
- **Revoke leaves data.** On grant revoke, reads return empty but previously-merged
  `source:'healthkit'` rows persist in Firestore and keep feeding trend/TDEE.
  Decide: purge synced rows on revoke, or retain (recommend retain — they were
  real weigh-ins — but flip `healthkitSyncState.status` to `denied` so priming can
  re-ask). Product call.
- **Native operator steps stay off-agent:** `NSHealthShareUsageDescription` /
  `NSHealthUpdateUsageDescription` in `Info.plist`, enable the HealthKit
  capability, `cap sync ios`. The web-visible seam means the UI is reviewable
  before any of that lands.

## Locked decisions

Per data type, the reconciliation is locked as:

| Data type | Locked decision |
| --- | --- |
| **Steps** | HealthKit-wins; **display count only, never a kcal figure anywhere**; read-only; backfill free *but contingent on steps staying consumer-free*. |
| **Active Energy** | **Refused as a calorie input** — zero terms into target/burn/balance/adaptive. Superseded by the learned TDEE. Optional passive cross-check card only, outside the summed breakdown, source-predicate read. |
| **Body mass** | Merge; canonical `bodyweightLogs` **keyed doc-id=date** (migrate off auto-ID); manual-wins per date; HealthKit fills empty dates; source-tagged; two-layer echo prevention; feeds adaptive TDEE intentionally. |
| **Workouts** | App-owned; **never auto-ingested** into energy/streaks/challenges/PI; write `HKWorkout` opt-in; import is display-only or explicit per-item logging. |
| **Heart rate** | HealthKit-wins; zones/effort display only; **out of the calorie math**; extends `heartRateSource.ts`; explicit multi-source selection. |
| **Sleep** | Not ingested in v1 (no consumer); seam leaves room for a later display-only surface. |
| **Write-back** | Body weight + `HKWorkout` opt-in, per-type, revocable, never-throws; **deletes/edits must mirror**; no standalone Active-Energy write. |
| **Backfill** | Steps free; weight only into empty dates + settling-window before engine-flip; workouts never silently; scale-capped. |

**Four blockers that must be closed before implementation (all verified in code):**

1. `bodyweightLogs` must move to **doc-id=date** — today's `addDocGuarded` auto-ID
   append (`Home.tsx:465`) makes the manual-vs-sync race double-write a date.
2. **Historical balance is not point-in-time** (`CalorieBalanceChart.tsx:48`
   uses current weight for all days) — fix or explicitly label before claiming
   backfill safety.
3. The **Active-Energy cross-check read needs a Tropos-source-exclusion
   predicate** or it self-ingests app-written `HKWorkout` energy.
4. **Connect-mid-history can flip formula→learned in one sync** — gate the flip on
   a post-connect settling window, not on backfilled rows.

## Decisions that need a product call (not an engineer)

- Write `HKWorkout` at all (ring-closing value vs native scope)? *(recommend
  yes, opt-in)*
- Surface HealthKit Active Energy as a passive cross-check card, or hide it
  entirely? *(surfacing invites "why doesn't it add to my budget?" confusion)*
- Same-date weight tie-break when a manual entry and a smart-scale HealthKit
  sample both exist *(recommend manual-wins; some users trust the scale more)*.
- Offer HealthKit historical-workout import as explicit per-item logging, and if
  so do imported sessions count toward challenges/PRs? *(recommend
  import-as-suggestion, does-not-count)*.
- Sleep in v1 at all? *(recommend no)*.
- Android/Health Connect parity required at launch, or an iOS-first fast-follow?
- On grant revoke: purge synced rows or retain? *(recommend retain + flag denied)*.

## What a normal session implements from this

Each is a scoped, testable follow-on task; ship them in this order:

1. **`feat/health-data-seam`** — `src/lib/healthDataSource.ts` with the
   `setNativeHealthProvider` swap-point, web `available:false` provider, and per-type
   capability flags + a backfill read method. Mirror `appCheck.ts`/`heartRateSource.ts`.
   Web-visible from day one.
2. **`fix/bodyweight-doc-id-date`** — migrate the manual weigh-in write to
   `setDocGuarded(doc(...,'bodyweightLogs',date), {...}, {merge:true})`; add a
   parity test that a same-date manual + sync write collapses to one row. (Prereq
   for any weight sync; safe to ship standalone.)
3. **`feat/steps-tile-healthkit`** — wire the Home steps tile to
   `readDailySteps` (local-date `HKStatisticsQuery`, never raw-sum); assert steps
   never produce a kcal figure.
4. **`feat/healthkit-weight-sync`** — read/merge weigh-ins (source-tagged,
   empty-dates-only, source-predicate echo prevention), uid-scoped + debounced
   writer, local-date bucketing; opt-in write-back with delete/edit mirror.
5. **`feat/healthkit-hr-zones`** — extend `heartRateSource.ts` for live HR/zones
   (display only), multi-source selection.
6. **`fix/historical-balance-pointintime`** — persist per-day expenditure or
   relabel the balance chart (closes blocker 2; unblocks honest weight backfill).
7. **`feat/healthkit-backfill`** — weight backfill into empty dates with the
   post-connect settling window before the engine-flip, scale-capped; steps
   backfill with the consumer-free contingency note.
8. **`feat/hkworkout-writeback`** — opt-in `HKWorkout` write for saved runs/lifts;
   web-visible toggle stub.
9. **Native/operator:** Info.plist usage strings + HealthKit capability +
   `cap sync ios`; **Health Connect** as its own task modelling the 30-day
   auto-revoke, `DataOrigin` exclusion, and separate history permission.

## Confidence & method

Verified in code this session: the no-eat-back invariant (`dailyBurn.ts:10-13`,
`useEffectiveTargets.ts:364`), the learned-TDEE-from-intake+mass model
(`adaptiveTdee.ts:102-164`), the `bodyweightLogs` auto-ID write (`Home.tsx:465`),
the historical-budget recompute (`CalorieBalanceChart.tsx:48-58`), the seam
precedents (`appCheck.ts`, `analyticsProvider.ts`, `heartRateSource.ts`), and the
three-gate persistence path (`firestoreWrite.ts`, `profileSanitizer.js`,
`firestore.rules`). Drafted via a grounding → design → adversarial-critique pass;
the four blockers and the edge cases (build-variant bundle ids, third-party
re-publish, multi-source dedup, revoke residue, Health Connect divergence,
timezone travel, unbounded backfill read) came from the critique and are recorded
here rather than discovered in production.
