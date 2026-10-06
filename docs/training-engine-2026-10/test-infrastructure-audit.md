# Tropos test and E2E infrastructure: audit for the simulated-user run

Branch `claude/tender-hypatia-qvawvs`, HEAD `55c195a`, audited 2026-10-06 in the
agent container: 4 vCPU, 15 GB, Node 22.22.0 (`package.json` asks for >=22.22.1,
which npm does not enforce), Java 21.0.12, Playwright 1.60.0, Vitest 4.1.11.
Every number below was measured here unless it is marked as quoted.

> Point-in-time: line numbers and measurements describe `55c195a`. Re-trace a
> claim against the current tree before acting on it. Index and corrections:
> [README.md](README.md).

---

## 0. Key facts

- **Unit layer:** Vitest has three projects (`node`, `root-node`, `dom`). There is one
  Firestore fake (ADR-0009) with a seed/read/fail harness. `npm run test` runs
  through `scripts/run-unit-tests.mjs`, which preloads a TCP/TLS deny guard, plus
  `scripts/fake-clock.cjs` when `TROPOS_CLOCK_OFFSET_DAYS` or `TROPOS_CLOCK_AT` is set.
  - That clock is a **fixed process-wide offset for Node only**.
  - **No app-level clock seam exists.** App code calls `new Date()` and
    `Date.now()` directly, for example 34 sites in `useProgram.ts`.
  - **No fast-check is installed.** The 13 "property" tests are hand-rolled loops,
    each with its own copy of `mulberry32`.
  - **One golden snapshot** exists: `planSweep.golden.test.ts`, which pins 90
    `buildPlan` configurations at week 1 only.
- **Multi-week coverage today is engine-level and narrow.** These tests walk the
  engine over many weeks:
  - `volumeProgressionOverTime` (24 weeks of lifting)
  - `persistedWeekProgression` (26-week marathon rollover walk)
  - long-run, quality and taper ramps
  - PI and deload over 26 to 30 weeks
  - `trainingDecisionJourneys`, which covers completion → correction → next week
    on the fake

  No test chains plan → daily sessions → weekly rollover → what Home and Train
  show, for a persona, across a season. The weekly rollover loop is **inline in
  `useProgram.ts` effects**: `nextRunWeek` is module-private, so a headless
  simulation cannot call the running copy without an extraction.

- **E2E layer:** Playwright has three projects. Only `auth-emulator` (signed-in specs
  and capture specs) and two named chromium specs run in CI. The other nine
  signed-out specs run in **no** workflow. The rig is the Auth and Firestore
  emulators only. **There is no Functions emulator.** Specs reach callables by
  `page.route` → real handler `.run()` in-process, or by calling the handler
  directly. Time is controlled with `page.clock.setFixedTime` in 6 specs (3
  signed-in, 3 capture). There is no app override.
- **GPS:** One capture spec steps `context.setGeolocation` in real time. Every
  other run path skips GPS by pushing RunSummary's router state. No spec uses the
  manual or treadmill path.
- **Feasibility: yes.**
  - `npx firebase-tools@latest` (15.32.1) installs in 27 s.
  - The Firestore JAR downloads in 3 s.
  - The emulators boot in about 10 s.
  - 5 signed-in tests from `homeStart`, `trainingDecisions` and `journeys` **passed
    in 36.6 s**.
  - **The full signed-in suite, as CI runs it, passed: 46 tests in 4.7 minutes.**
  - A scratch probe passed in 42 s. It moved the browser clock to +1, +2 and +16
    weeks, finished two real lifts through the UI (8 s each, saved under the fake
    day, load progressed 62.5 → 65 kg), saved a GPS-free run, and watched the
    client rollover catch up 15 weeks. History and Home then rendered with 0 page
    errors.
- **Unit timing:** `npx vitest run src/features/program` takes **48.4 s** (124
  files, 1,732 tests). Engine-only multi-week tests cost about 2–5 ms per
  simulated week.
- **Baseline:** `npm run verify` **PASSED** in **603 s** (10m03s):
  - lint, the form-art and form-draft audits, the cycle check, the build and the
    dist-size check took 147 s together;
  - the unit suite took 455 s, with 1,075 files and 12,156 tests (11,784 passed,
    372 skipped).

---

## 1. Unit layer

### 1.1 Runner and configs

- **`npm run test`** = `node scripts/run-unit-tests.mjs run`. It spawns
  `node_modules/vitest/vitest.mjs` with `NODE_OPTIONS=--require deny-unit-network.cjs`.
  - That preload throws on any TCP connect or `tls.connect`; Unix IPC is allowed.
    So **unit tests cannot reach an emulator**, by design.
  - The same command adds `--require scripts/fake-clock.cjs` only when
    `TROPOS_CLOCK_OFFSET_DAYS` or `TROPOS_CLOCK_AT` is set.
  - `npx vitest run …` bypasses both preloads.
- **`vitest.config.ts`:** `globals: true`, `setupFiles: src/test/setup.ts`, the `@/`
  alias, and placeholder `VITE_FIREBASE_*` defines. It sets **no `testTimeout`**,
  so Vitest's default of 5 s per test applies. Three projects:
  - `node` (node env): `src/lib/__tests__`, `src/utils/__tests__` and
    **`src/features/program/**tests**/**`**. A file can opt into DOM with
`// @vitest-environment jsdom`.
  - `root-node`: `firestore.*.test.ts`, `storage.rules.test.ts` and
    `scripts/**/*.test.ts`. These are emulator-gated rules suites that skip
    without an emulator, run by `npm run test:rules`.
  - `dom` (jsdom): every other `src/**/*.test.{ts,tsx}`.
  - It excludes `functions/**`, which has its own `functions/vitest.config.js`:
    node env, `fileParallelism: false` (one shared emulator) and
    `testTimeout: 30_000`.
- **`src/test/setup.ts`:**
  - Loads jest-dom.
  - A DOM-only `afterEach` drains a post-unmount `setTimeout(0)` from Radix
    FocusScope. It skips under fake timers.
  - Stubs `matchMedia`.
  - Its comments warn that a suite which fakes timers must settle framer-motion's
    frame loop itself. That is a DOM concern only.
- **Other test helpers in `src/test/`:**
  - `notificationsFake.ts` and `notificationsHarness.ts`
  - `nutritionFixtures.ts`, `sessionFixtures.ts`, `aiConsentFixtures.ts`
  - `localeGrouping.ts` (`GROUP` and `group(n)`: build grouped numbers the way the
    runtime does, because the de-DE and fr-FR jobs break hard-coded commas)

### 1.2 The Firestore fake (ADR-0009)

It has three parts:

- `src/test/firestoreFake.ts` (945 lines): an in-memory store.
- `__mocks__/firebase/firestore.ts`: the SDK-shaped surface.
- `src/test/firestoreHarness.ts`: the helpers.

A suite writes a **bare** `vi.mock("firebase/firestore")` plus
`vi.mock("@/lib/firebase", () => ({ db: {} }))`. The harness then provides:

- `resetFirestore()` (in `beforeEach`), `seedFirestore({"users/u1/...": {...}})`
  (paths with an even segment count only) and `flushSnapshots()`.
- `readDoc`, `allPaths`, `writeLog`, `batchLog`, `readLog` and `readsAt`.
- `failNextFirestore(op, {path, code, times})` and `unfiredFailures()`.
- `seedCache` (cache-only docs for `getDocFromCache`).
- `deferReads`, `resumeReads`, `pendingReads`, `releaseRead`, `rejectRead`,
  `releaseAllReads`, the same set for writes, and `setSnapshotMetadata`.

What it models:

- where, orderBy, limit and startAfter queries;
- live `onSnapshot`, coalesced per microtask;
- batches, sentinels (`increment`, `arrayUnion`, `serverTimestamp`, …) and
  `FakeTimestamp`;
- transactions, which run their callback **once** with no contention;
- the real ordering rule: a doc that lacks an `orderBy` field is excluded, as
  Firestore does (CLAUDE.md's "runs ordered by createdAt" lesson).

It does not model rules, indexes or offline persistence. The ADR's rule is to
**extend the fake, never add a local factory**. `firestoreHookCoverage.test.ts`
gates hooks that touch Firestore.

Because the fake covers the SDK module, the app's real write paths run on it.
`trainingDecisionJourneys.test.ts` is the worked example: it drives
`commitWorkoutCompletion`, `correctSavedWorkout` and `commitProgramTransition`
against seeded docs.

### 1.3 The clock: what exists and what does not

**`TROPOS_CLOCK_OFFSET_DAYS` / `TROPOS_CLOCK_AT`** are implemented in
`scripts/fake-clock.cjs`.

- The preload replaces global `Date` with a subclass. Only a no-argument
  `new Date()` and `Date.now()` are shifted; explicit constructions pass through.
- It keeps `instanceof Date` working through `Symbol.hasInstance`.
- It throws on malformed values.
- The offset is fixed at process start and **cannot be stepped**.
- It reaches Vitest workers through `NODE_OPTIONS`.
- The CI functions suite gets it through `NODE_OPTIONS` in `unit-future`.
- `scripts/fake-clock.test.ts` pins it.
- Locally: `TROPOS_CLOCK_OFFSET_DAYS=90 npm run test` or
  `TROPOS_CLOCK_AT=2026-10-18 npm run test`.

**There is no app-level clock seam**, in the browser or anywhere else. Searches for
`clockOverride`, `__TROPOS_NOW`, `appClock`, `getNow`, `window.__*` test hooks and
`VITE_E2E` found nothing. The only automation switch in app code is
`navigator.webdriver`, which hides the launch splash and the first-visit guide
(`launchSplash.ts`, `firstGuide.ts`). The localStorage key
`tropos-guide-under-automation=on` re-enables the guide.

**Implicit wall-clock reads that a simulation must control:**

| Site                                                                | What it reads                                                                        | Effect                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `programEngine.ts:2003` `applyProgression` and `:2412` `recorded()` | `format(new Date(), "yyyy-MM-dd")`                                                   | `performanceHistory[].date` is stamped with the **wall-clock** day, not the session's `date` |
| `advanceWeek`, `programTransition.ts:136`                           | `updatedAt: Date.now()`                                                              | —                                                                                            |
| `migrations.ts:444`                                                 | default `weekStart = localWeekKey()`                                                 | —                                                                                            |
| `useProgram.ts`                                                     | 34 direct `new Date()`, `Date.now()`, `localWeekKey()` and `localDateString()` calls | the rollover effects decide "stale" from the wall clock                                      |
| `programTypes.ts:976` `generateInstanceId()`                        | `crypto.randomUUID()`; fallback `Date.now()` plus `Math.random()`                    | ids are nondeterministic                                                                     |

**APIs that already take the date explicitly**, which are good simulation seams:

- `buildPlan({ currentDate })` (it has no implicit `new Date()`, by its own
  header);
- `generateRacePlanV2({ currentDate, weekStart })`;
- `advanceWeek(state, exp, nextWeekKey, raceBlockWeek, opts)`;
- `migrateProgramState(state, weekKey)`;
- `todaySession({ nowMs, … })`;
- `runDocument(run, now)`;
- `liftProgress(…, today)`;
- `_needsRaceNoShowEvaluation(profile, state, nowMs)` and
  `_runWeeklyFellBehindCheckForUser(uid, range)` on the server.

**In tests:** 44 files use `vi.setSystemTime` and 68 use `vi.useFakeTimers`, some
with `toFake: ["Date"]`. **In the browser:** Playwright's `page.clock` (§2.5).

### 1.4 Property tests

**fast-check is not installed.** The 13 `*.property.test.ts` files are hand-rolled
loops, each with its own copy of `mulberry32` and fixed seeds:

- `generateRacePlanV2.property` (3,000 random plans; timing flags agree with
  `classifyRaceTiming`)
- `runModeMaterialization.property`
- `generateSchedule.property`, `applyWeeklyCap.property`
- `calculateSplits.property`, `gpsAggregates.property`, `kalmanFilter.property`,
  `paceTrends.property`
- `prTracking.property`, `tdee.property`, `performanceScoreBounds.property`
- `computeStreakSpan.property`, `resolveTier.property`

There are also exhaustive sweeps:

- `racePlanSafetySweep` (distance × date × race weekday);
- `deloadTriggerReachability` (345,600 combinations);
- `runSchedulerCoverage`, `generatorAudit`, `injuryCoverage` and `calfCoverage`.

### 1.5 Golden snapshots

There is exactly one snapshot file:
`src/features/program/__tests__/planSweep.golden.test.ts` with
`__snapshots__/planSweep.golden.test.ts.snap` (2,756 lines).

- It covers 6 lift-day counts × 3 equipment levels × 5 goals = 90 `buildPlan`
  configurations: split, day names, `exerciseId × sets × reps @ weight`, and
  weekly sets per judgement muscle with LOW/ok/HIGH against the band.
- It pins `currentDate = "2026-03-08"`.
- A `KNOWN_DEFECTS` ratchet holds known-wrong values: "a golden that silently
  blessed defects would be worse than none".
- It covers **week 1 only**.

The only other snapshot is an inline one in `bodyProps.test.ts`.

### 1.6 Existing multi-week or longitudinal scenario tests

| File                                                                                                                            | Covers                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/program/__tests__/volumeProgressionOverTime.test.ts`                                                                  | 24 weeks (six mesocycles) of a compliant 4-day intermediate, using `generateProgram` + `applyProgression` + `advanceWeek`. Set volume repeats 66/66/66/44 (deload); no residue in `baseSets`; accessory load climbs for 15 weeks. Load, not volume, carries progression.   |
| `persistedWeekProgression.test.ts`                                                                                              | Walks a 26-week marathon season **the way `useProgram` does** (regenerate weekly, persist `weeks[0]`) and asserts the _persisted_ week progresses. It names the defect class it found: 22 identical base weeks.                                                            |
| `longRunProgression.test.ts`, `qualityProgression.test.ts`, `mediumLongRun.test.ts`                                             | Long-run ramp properties per distance (monotone to peak, cutbacks step down, peak scales with distance); quality sessions grow by volume over build weeks; medium-long run.                                                                                                |
| `taperCap.test.ts`, `raceFinalWeeks.test.ts`, `raceLighterWeeks.test.ts`, `raceLegTrim.test.ts`                                 | Taper length per distance across all weeks; the lift side in the 2 weeks before a race, race week and the week after; lighter lift weeks aligned to the run plan's step-back weeks (4–24-week plans × 4 distances).                                                        |
| `racePlanSafetySweep.test.ts`                                                                                                   | Swept training-safety properties. Correction (integration, 2026-10-06): its header records that 28.4% of plans _used to_ schedule runs after race day; the sweep now pins **zero** (`expect(withRunsAfter).toBe(0)`), so this is a guarded regression, not an open defect. |
| `programEngine.test.ts` (145 tests)                                                                                             | Mesocycle chains through `advanceWeek`: a deload needs a trained week; stalls and absences; the weekly reset to base sets; lighter weeks; a regenerate preserves loads.                                                                                                    |
| `progressionUserLoad.test.ts`, `rangelessDoubleProgression.test.ts`, `easeBack.test.ts`, `represcribe.test.ts`                  | Session-over-session load following, the miss and lowering rules, return after a break across the first weeks back.                                                                                                                                                        |
| `deloadEngine.cross.test.ts`                                                                                                    | Client and server deload parity, using `createRequire` of `functions/lib/deloadEngine.js` (the pattern for using server code in a client simulation).                                                                                                                      |
| `detrainedRacePlan.test.ts`, `useProgramLayoffWiring.test.ts` (jsdom, real hook on the fake)                                    | Layoff → the persisted runDays; account-switch leak.                                                                                                                                                                                                                       |
| `useProgramWriters.test.ts` (jsdom, 78 tests, 4,000 lines)                                                                      | The `useProgram` writer paths, including V2 runDays, race/structured refresh, the compressed flag and regenerate.                                                                                                                                                          |
| `lib/__tests__/trainingDecisionJourneys.test.ts` (jsdom, fake)                                                                  | Full, partial, express, easier and time-budget sessions → saved workout → correction → `advanceWeek` → next prescription, through the real commit and correction functions.                                                                                                |
| `performanceIndexOverTime.test.ts`, `deloadNagLoop.test.ts`, `deloadTriggerReachability.test.ts`                                | PI over 26–30 weeks (flat under steady growth, scale-invariant); deload advice over 26 weeks (fires on the transition, not every week).                                                                                                                                    |
| `adaptiveTargetClosedLoop.test.ts`                                                                                              | The calorie target as a daily closed loop. This is the best existing **template for a closed-loop simulation**: the user eats today's target, weight responds, and the estimator re-fits each morning.                                                                     |
| `functions/__tests__/dailyRaceReconciliationSweep`, `weeklyFellBehindCheck`, `recoveryEntry`, `programCommands`, `integration/` | Server decisions, with emulator integration in CI.                                                                                                                                                                                                                         |

There is also a QA write-up of this kind of journey:
`docs/qa/training-decision-journeys.md`. Ledger row RUN-EV-09 in
`docs/running-programming-claude-handoff.md` explicitly asks for "journey tests
across generated, custom, and modified completion".

### 1.7 Costs, measured on an idle machine

- **`npx vitest run src/features/program`:** 48.4 s wall. 124 files (123 passed, 1
  skipped); 1,732 tests (1,729 passed, 3 skipped). Vitest reports 47.3 s; the
  per-file sum is 30.2 s.
- **Heaviest files:**

  | File                                       | Time   | Tests |
  | ------------------------------------------ | ------ | ----- |
  | `useProgramWriters` (jsdom hook)           | 6.6 s  | 78    |
  | `trainingBlock.timezone`                   | 4.6 s  | 3     |
  | `injuryCoverage`                           | 3.4 s  | —     |
  | `generatorAudit`                           | 1.7 s  | —     |
  | `useProgramCommandBoundary`                | 1.5 s  | —     |
  | `useProgramLayoffWiring`                   | 1.4 s  | —     |
  | `racePlanSafetySweep`                      | 1.2 s  | —     |
  | `generateRacePlanV2.property`              | 1.2 s  | —     |
  | `programEngine`                            | 0.95 s | 145   |
  | `persistedWeekProgression` (26-week walks) | 0.14 s | 9     |

  `volumeProgressionOverTime` (24-week simulations) is under 0.1 s.

- **So a pure-engine simulation costs about 2–5 ms per simulated week per persona,
  and a hook-level one about 80 ms per test.**

---

## 2. E2E layer

### 2.1 Playwright config (`playwright.config.ts`)

- `testDir: ./e2e`, `fullyParallel: true`, base URL
  `http://localhost:4173/Maiin/`, `trace: on-first-retry`, and the `html`
  reporter, which writes `playwright-report/` and `test-results/` in the repo.
- **CI only:** `retries: 2`, `workers: 1`, `forbidOnly`.
- **`webServer`:** `npm run preview`, which serves `dist/`, with
  `reuseExistingServer: !CI`.
- **`PW_CHROMIUM`** is an optional `executablePath` override, applied globally.
  It is needed in the sandbox: Playwright 1.60 wants chromium-1223 but
  `/opt/pw-browsers` has chromium-1194, so use
  `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Never run
  `playwright install`.

Projects:

- **`chromium`** (Desktop Chrome) and **`mobile`** (devices `iPhone 14`, which is
  **WebKit**) ignore auth and capture specs.
- **`auth-emulator`** (Desktop Chrome, `bypassCSP: true`,
  `fullyParallel: false`) matches `/auth\.spec\.ts/` and `/\.capture\.spec\.ts/`.
  The config comment records that the specs share one seeded account and
  interfere when parallel. `npm run test:e2e:auth` adds `--workers=1`.

What CI actually runs (all in `emulator-tests.yml`):

- **Job `emulator-tests`** (15-minute budget):
  1. `appCheckCsp.spec.ts` and `reducedMotionScroll.spec.ts`, named explicitly on
     `--project=chromium`.
  2. `npm run test:rules` and `test:rules:storage`.
  3. The functions suite against the emulators.
  4. **`npm run seed:e2e && npm run test:e2e -- auth.spec.ts --project=auth-emulator`**.
     The argument is a regex, so it runs **all 17 `*.auth.spec.ts` files** (46
     tests).
  5. Design-QA transitions, which are non-blocking.
- **Job `capture-specs`** (30-minute budget): the full seed chain, then
  `capture.spec.ts`. These are 50 capture specs and they block.
- `app-screenshots.yml` runs the same capture chain for frames and diffs.
  `captureSeedChain.test.ts` pins the two seed lists as identical.
- **The other nine signed-out specs run in no workflow:** `smoke`, `navigation`,
  `accessibility`, `performance`, `pwa`, `security`, `responsive`,
  `responsive-safari-standalone` and `legal-pages`. The `mobile`/WebKit project
  never runs in CI.
- Only `unit` is confirmed to be a **required** check
  (`requiredCheckComposition.test.ts`). The emulator jobs show red but are not
  confirmed required.

### 2.2 The emulator rig

**Emulators.** `firebase.json` sets auth 9099, firestore 8080, storage 9199, UI
off and `singleProjectMode`. **No functions emulator.** The client's
`src/lib/firebase.ts` connects firestore, storage and **functions on 5001**
when `VITE_USE_EMULATORS=true`, but nothing serves 5001 in the rig.

**Build.** `npm run build:e2e` (`tsc -b && vite build --mode=test`) runs with
`VITE_USE_EMULATORS=true` and these dummy values (from `emulator-tests.yml`):

```
VITE_FIREBASE_API_KEY=emulator-dummy-key
VITE_FIREBASE_AUTH_DOMAIN=demo-tropos.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-tropos
VITE_FIREBASE_STORAGE_BUCKET=demo-tropos.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000000000
```

Empty values leave the app on its spinner forever. Test mode emits a
`dist/TROPOS_E2E_BUILD_DO_NOT_DEPLOY` marker. The production CSP stays in the
bundle; only the `auth-emulator` browser context bypasses it.

**Run.** CI runs
`firebase emulators:exec --only auth,firestore --project demo-tropos '<seed chain> && npm run test:e2e -- …'`.
It installs firebase-tools with `npm install -g firebase-tools` and Java 21 with
`setup-java`.

**Gate.** `e2e/helpers/emulator.ts` exports `emulatorActive`, true only when
`E2E_AUTH_EMULATOR=1`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` and
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` exactly (localhost is normalised). Specs
`test.skip` otherwise, and seeds call `assertEmulatorEnvOrExit()`. Seeds and
specs use `GCLOUD_PROJECT=demo-tropos`.

**Seeds** (Admin SDK, idempotent, fixed ids):

| Script                                   | Account                                                                    | What it writes                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seed:e2e` (`seed-e2e-user.ts`)          | **shared** `e2e-test@tropos.test` / `test-password-123`, a verified Lifter | A profile with a 6-lift-day schedule whose _tomorrow_ is rest (so today always has a lift) and `weekScheduleVersion: 1`; `public/profile`. **No programState**: the app bootstraps one on first visit.                                                                                                                            |
| `seed:rich`                              | same shared account                                                        | Workouts, runs, meals, performance docs, activities, challenges, follows, spaces                                                                                                                                                                                                                                                  |
| `seed:circles`, `seed:experience`        | dedicated users                                                            | Circles; a beginner with 6 stalled weekly sessions (and a programState)                                                                                                                                                                                                                                                           |
| `seed:fellbehind`, `seed:liftreturn`     | dedicated users                                                            | Profile + programState from the **real `buildPlan`** (the call Onboarding makes), plus a pending fell-behind prompt and a run gap, or a 24-day-old workout                                                                                                                                                                        |
| `seed:season` (`seed-season-athlete.ts`) | `season-athlete@tropos.test`                                               | **16 weeks of history** (3 lifts and 3 runs a week, deload in week 8, squat stall, a 10K in week 12, splits from `calculateSplits`, weigh-ins, food, 42 daily performance docs scored by the real engine). Deterministic `mulberry32(20260928)`, dated back from the run day. It **writes history; it does not step the engine.** |
| `seed-visual-audit.ts`                   | shared account                                                             | Hybrid plus race plan. Not in the CI chain.                                                                                                                                                                                                                                                                                       |

### 2.3 How signed-in specs authenticate and get accounts

- **Sign-in:** `signInAsTestUser(page, creds?)` (`e2e/helpers/auth.ts`) drives the
  real Login form: `#login-email`, `#login-password`, submit, then wait for
  `nav`. `signOut` clears localStorage and IndexedDB.
- **Isolated accounts**, which every journey should use: tests that share the
  seeded account race each other.
  1. **Admin SDK in the spec:** `initializeApp({projectId:"demo-tropos"}, name)`,
     `auth.createUser`, write profile and programState, and in `finally` run
     `db.recursiveDelete(userRef)`, `deleteUser` and `deleteApp`. Used by
     `trainingDecisions`, `homeStart`, `homeTrainingRecovery`,
     `mondayWeekMigration` and `workoutCorrection`. `trainingDecisions` builds
     its plan with the real `buildPlan`.
  2. **Auth emulator REST:** `accounts:signUp?key=emulator-dummy-key`, and
     `accounts:query` or a Firestore REST `PATCH` with `Authorization: Bearer owner`
     to bypass rules. Used by `companion-finish`, `offlineQueueIsolation` and
     `new-user-feed`.
  3. **The real sign-up form plus `verifySignupEmail`**: read the `oobCodes`
     REST endpoint, apply the code, then dispatch focus until the token refresh
     arrives. Used by `guide.capture` and `offlineQueueIsolation`.
- **Onboarding completion** has two forms:
  - route the `completeOnboarding` callable into its **real handler** (below), as
    `guide.capture` does through the real Onboarding UI;
  - or patch `onboardingComplete` over REST.

### 2.4 Callables without a Functions emulator

The client calls five callables: `completeOnboarding`, `configurePlan` (Run plan
and Lift plan saves, "Restructure programme?"), `applyProgramCommand`,
`deleteMyAccount` and `syncRevenueCatEntitlement`.

`applyProgramCommand` carries a lot: `skipWorkoutDay`, `set/clearNextWorkout`,
`setManualRunCompletion`, `transitionRunDay`, `moveRunDay`, `overrideRunDay`,
`setProgramSettings`, `reorder/remove/add/replace/restoreExercise`,
`apply/revertDeloadWeek`, `apply/revertEaseWeek`, `skipRecoveryEarly` and
`dismissFellBehindPrompt`. Unrouted, the call fails as transport, the command
sits in the client outbox (`commandOutbox.ts`) and nothing is persisted.
`journeys.auth.spec.ts` stops at the armed "Save race plan" for exactly this
reason.

Bridges in use:

- `guide.capture` (`completeOnboarding`) and `run-coaching.capture`
  (`applyProgramCommand`) use
  `page.route("**/demo-tropos/us-central1/<name>")`: answer OPTIONS with 204,
  `admin.auth().verifyIdToken(bearer)`, run
  `require("../../functions/index.js")[name].run(data, { auth: { uid, token } })`,
  then fulfil `{ result }`.
- `app-store.capture` calls `configurePlan.run(payload, { auth: { uid } })`
  directly, with the payload built by `buildPlan` exactly as the Run plan editor
  builds it.
- `app-store.capture`'s `calibrateProgramme` also replays logged sessions
  through `applySessionProgression` in an Admin transaction, after
  `normalizeProgramState` and `migrateProgramState`. That is the existing
  **seed through the real engine** pattern.

Firestore triggers never run in the rig: `onWorkoutCreated`, `onRunCreated`
(performance recompute, challenge sync, recovery entry), the scheduled rollups,
`weeklyFellBehindCheck` and `dailyRaceReconciliationSweep`. So **Home's
Performance row only moves if a spec writes `users/{uid}/performance` docs or
calls `computePerformanceWeek` itself.**

### 2.5 Time control in specs

There is **no app override**. Specs use Playwright's `page.clock`:

- **`setFixedTime`** (Date frozen, timers real), before `signInAsTestUser`:
  - `homeStart`: next Wednesday at 12:00 UTC
  - `homeTrainingRecovery`: this Saturday
  - `mondayWeekMigration`: `2026-09-09T12:00Z`, about 4 weeks in the past
  - `races` and `races-cta`: `2026-06-01`, 4 months in the past
  - `app-store`: holds Date during a lift to fake 14:20 of elapsed time
- **`clock.install` and `fastForward`:** only the form-art `.pw.ts` scripts.

The signed-in specs that seed dates from Node pin `timezoneId: "UTC"`:
`homeStart`, `homeTrainingRecovery`, `mondayWeekMigration` and
`trainingDecisions`. That keeps Node-side seed date keys, computed in the CI
runner's UTC, in step with the browser. The capture specs that move the clock
(`races`, `races-cta`, `app-store`) do not pin it; they rely on the runner
being UTC.

### 2.6 Every spec that touches lifting or running

| Spec                                                                                                                                                                         | Drives                                                                                                                                                                 | Asserts                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journeys.auth`                                                                                                                                                              | Shared account. Programme → Start workout → (Express chooser: "Full session") → fill set 1 → Mark set complete → Close. Settings → Run plan → Race prep → Half + date. | The session UI renders set inputs and the remaining-set count drops by 1. The planner preview mentions a half marathon and "Save race plan" is enabled; it is not clicked, because the callable is missing.                                                                                                                                                                                             |
| `trainingDecisions.auth`                                                                                                                                                     | Isolated account, real `buildPlan` (hybrid marathon), 1-exercise lower day                                                                                             | "Go easier today" appears or disappears as a hard run, a lift and edits are written to Firestore live. Finishing every set → Save workout → Done. The saved receipt's sets and planned values; weight progressed past 100; Correct workout (set 3 = 6) → revision 1, failure count, `lastPerformance` 7; "Start next week" → weekNumber 2 → "Target: 3×8 @ 100 kg" and the "Last time" buttons per set. |
| `homeStart.auth`                                                                                                                                                             | Fixed clock Wednesday; 2-day upper/lower                                                                                                                               | The Home card previews Session 1 (the rotation cursor, ADR-0002); Start opens it via `/program?day=0&start=1`; the link is consumed.                                                                                                                                                                                                                                                                    |
| `homeTrainingRecovery.auth`                                                                                                                                                  | Fixed clock Saturday; 6 workouts, all-lift week                                                                                                                        | An overflow lift offers the next unfinished session; the weekly layout editor's six-lift limit and its confirmation/cancel; Firestore workouts unchanged.                                                                                                                                                                                                                                               |
| `mondayWeekMigration.auth`                                                                                                                                                   | Fixed clock `2026-09-09`; race plan with moved and completed runs                                                                                                      | The Monday-anchor migration keeps progress, moved runs and ids. Week strip labels; Run week tablist; `/run?scheduledRunId=` → "Start Easy".                                                                                                                                                                                                                                                             |
| `workoutCorrection.auth`                                                                                                                                                     | Seeded saved workout                                                                                                                                                   | Correct workout → revision 1, total volume and duration recomputed, persists across reload.                                                                                                                                                                                                                                                                                                             |
| `weeklyLayoutRecovery.auth`                                                                                                                                                  | Shared account                                                                                                                                                         | "Restructure programme?" confirmation stays open; Cancel keeps the draft.                                                                                                                                                                                                                                                                                                                               |
| `coldstart.auth`                                                                                                                                                             | Shared account                                                                                                                                                         | Home, Food, Train, Analytics and Social render with 0 page errors on a zero-data account.                                                                                                                                                                                                                                                                                                               |
| `offlineQueueIsolation.auth`                                                                                                                                                 | Sign-up accounts; `navigator.onLine` override                                                                                                                          | A synthetic finished run saved **offline** through RunSummary state: "Saved locally — will sync when online"; queue entries tagged by uid; share queue.                                                                                                                                                                                                                                                 |
| a11y, tapTargets, responsive (auth)                                                                                                                                          | Shared account                                                                                                                                                         | Route sweeps include `program`, `history`, `settings/training`, `run-plan` and `lift-plan`.                                                                                                                                                                                                                                                                                                             |
| `companion-finish.capture`                                                                                                                                                   | REST sign-up; full and 30-minute budget                                                                                                                                | Warm-ups and "End rest", set correction dialog, "Finish early" → "Review completed work" → Save workout → "Workout saved" → Done → back on Program; saved doc fields via REST; session-length radio; weekly running goal "0 / 3"; running starting point.                                                                                                                                               |
| `app-store.capture`                                                                                                                                                          | Copies of the season athlete                                                                                                                                           | 03 workout (warm-ups + 2 sets, End rest, held clock); race goal through `configurePlan.run`; calibrated programme.                                                                                                                                                                                                                                                                                      |
| `run-hud.screens.capture`                                                                                                                                                    | `context.setGeolocation`, 6 m per 2 s                                                                                                                                  | The HUD reaches active ("Pause run"), and splits and compact snaps.                                                                                                                                                                                                                                                                                                                                     |
| `run-finish.capture`                                                                                                                                                         | RunSummary state (5 km loop, splits)                                                                                                                                   | "Save run" visible; not saved.                                                                                                                                                                                                                                                                                                                                                                          |
| `run-coaching.capture`                                                                                                                                                       | Real `applyProgramCommand` via route; runs seeded with `computePlanMetadata`                                                                                           | "Review easier week" follows run edits; Ease this week, then Undo; Firestore effects.                                                                                                                                                                                                                                                                                                                   |
| `analytics.season.capture`                                                                                                                                                   | Season athlete                                                                                                                                                         | Every History view leaves skeleton state; PRs tab "Lift PRs" and "Longest run"; Home "Performance Index N".                                                                                                                                                                                                                                                                                             |
| `analytics.screens.capture`                                                                                                                                                  | One run, one workout, one meal                                                                                                                                         | History leaves skeleton state; PR units; full history.                                                                                                                                                                                                                                                                                                                                                  |
| `lift-return`, `fellbehind-detrained`, `experience-suggestion`, `easier`, `exercise-list`, `train-header`, `day-peek`, `reorder-overflow`, `form-demo`, `largeText`, `guide` | Seeds                                                                                                                                                                  | The register or copy before the frame (the welcome-back sheet, the detrained fell-behind sheet, the suggestion card, the chooser, list and drag mode, the week-strip legend). `largeText` measures workout, run start, live run, run summary and detail pages. `guide` runs the full sign-up → onboarding (real handler) → first-set hint.                                                              |

### 2.7 GPS

`useGPS` uses plain `navigator.geolocation.watchPosition`. Three ways to finish a
run exist or are reachable:

1. **`context.setGeolocation` stepping** (only `run-hud.capture`). The
   plausibility gate rejects fixes above 12 m/s or within 1 m, so a run has to
   be walked at about 3 m/s with fixes every 2 s: roughly 50 s for 150 m. That
   is useless for volume.
2. **RunSummary router-state injection** (`run-finish.capture`,
   `offlineQueueIsolation`):
   `history.pushState({ usr: runData, key, idx }, "", "/Maiin/run-summary")`
   plus a `popstate`, then "Save run" → "Done". It uses the real
   `runCompletion` save path but **skips Run.tsx's plan-metadata prefill**:
   measured below, the saved run has `scheduledRunId: null`,
   `plannedTemplateId: null` and `planSource: "manual"`. A planned day is
   credited only through the claim map's date, distance and pace matching
   (`scheduledRunCompletion.ts`).
3. **Manual or treadmill path, used by no spec.** Pick Treadmill in setup, or
   wait 15 s in the acquiring state and press "Track without GPS". Then
   `TreadmillMode` (`#treadmill-distance`) → Save → RunSummary. Opened from
   `/run?scheduledRunId=<id>`, this goes through Run.tsx's prefill and linkage;
   `page.clock.install()` plus `runFor` can skip the 15 s wait and the timer.

---

## 3. Feasibility in this container (time-boxed, measured)

### 3.1 Tooling

| Step                   | Result                                                                                                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| firebase-tools         | **Not** a devDependency and not global. `npx --yes firebase-tools@latest --version` returned **15.32.1 in 27 s**. It lands in the npx cache (`/root/.npm/_npx/ba4f1959e38407b5/node_modules/.bin/firebase`), not the repo; registry.npmjs.org bypasses the proxy. |
| Firestore emulator JAR | `firebase setup:emulators:firestore` downloaded `cloud-firestore-emulator-v1.22.0.jar` (137 MB) to `~/.cache/firebase/emulators` **in 3 s** through the proxy. Java 21.0.12 is present, and `JAVA_TOOL_OPTIONS` already carries the proxy and truststore.         |
| Emulator boot          | `emulators:exec --only auth,firestore --project demo-tropos` reached the script **in 9–10 s**. Harmless warnings: IPv6 `::1 EAFNOSUPPORT` for each port, "Unable to fetch the CLI MOTD", and firebase-admin `MetadataLookupWarning … 403`.                        |
| e2e bundle             | `vite build --mode=test --outDir <scratch>/dist-e2e --emptyOutDir` with the CI env: **22 s** (CI's `build:e2e` adds `tsc -b`). The marker file was emitted.                                                                                                       |
| Chromium               | `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` worked.                                                                                                                                                                                          |

### 3.2 Signed-in specs: run and pass

```
cd /home/user/Maiin
E2E_AUTH_EMULATOR=1 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=demo-tropos PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
npx firebase-tools emulators:exec --only auth,firestore --project demo-tropos \
 'npm run seed:e2e && npx playwright test e2e/journeys.auth.spec.ts e2e/trainingDecisions.auth.spec.ts \
   e2e/homeStart.auth.spec.ts --project=auth-emulator --workers=1 --reporter=line --output=<scratch>/pw-results'
```

**Result: 5 passed in 36.6 s.** The tests were `homeStart`, `trainingDecisions`
(full lift + correction + next week) and the 3 `journeys` tests.
`seed:e2e` took a few seconds.

### 3.3 The full signed-in suite, as CI runs it

`npm run seed:e2e && npx playwright test auth.spec.ts --project=auth-emulator --workers=1`

**Result: 46 passed in 4.7 minutes** across all 17 `*.auth.spec.ts` files.
`emulators:exec` took 296 s in total, so plan about 5 minutes of CI time for
today's signed-in suite.

The browser log shows the app calling Functions on `127.0.0.1:5001`, getting
`ERR_CONNECTION_REFUSED`, and carrying on:

- `sendVerificationEmailCallable`
- `backfillMyActivityCategories`
- `recreditMyLiftVolume` (one-time maintenance)

So callables fail **silently** in the rig. OpenFoodFacts lookups are blocked by
the sandbox proxy (`ERR_TUNNEL_CONNECTION_FAILED`), which is harmless.

### 3.4 Clock-shift probe (scratch spec, kept as a seed)

The spec is at `harnesses/e2e-clock-probe.spec.ts.txt`, with its config at
`harnesses/e2e-clock-probe.pw.config.ts.txt`. Run outside the repo, it needs a
directory with a `node_modules` symlink to the repo's and a `package.json` of
`{"type":"module"}`.

Persona: an isolated Admin SDK user with a profile and programState from the
real `buildPlan`: strength goal, intermediate, 3 lift days plus 3 run days,
race prep for a marathon 52 weeks out. T0 was the next lift day, Thu
2026-10-08 09:00 UTC, two days ahead of the real clock. **1 passed in 42.2 s**
(`emulators:exec` total 54 s).

| Step                                                  | Measured                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in with `page.clock.setFixedTime(T0)`            | 2.1–2.5 s                                                                                                                                                                                                                                                                                                                                                            |
| Full lift through the UI                              | **7.8–8.0 s** for 23–24 set taps, including warm-ups and "End rest" when shown. Path: `/program` → Start workout → (Full session) → loop `Mark set complete` and `End rest` → the review opens → Save workout → Done. The **saved workout's `date` = the fake day** (`2026-10-08`). Programme: `workouts[0].completed = true`, the first lift went **62.5 → 65 kg**. |
| Synthetic run through RunSummary state (8 km, 48 min) | "Done" after 0.30 s, **on the server after 0.72 s**. Doc `date` = the fake day. `scheduledRunId: null`, `plannedTemplateId: null`, `planSource: "manual"`. "Done" shows on the local commit, so **poll Firestore; do not read it once**.                                                                                                                             |
| Clock +1 week → `goto("program")`                     | Run side caught up to the 2026-10-12 week in **2.0 s**. Lift `weekNumber` 1; `liftWeekKey` stayed `2026-10-12`, because a plan built Thursday to Sunday anchors the lift week on the _next_ week (`planBuilder.firstLiftWeekKey`). `runPlan.currentWeek` 1.                                                                                                          |
| Clock +2 weeks                                        | Caught up in 2.0 s. `weekNumber` 2, `liftWeekKey` 2026-10-19, `runPlan.currentWeek` 2. A second UI lift took 7.8 s, saved under the fake date `2026-10-22`.                                                                                                                                                                                                          |
| Clock +16 weeks (a 14-week jump)                      | Caught up in **2.2 s**, even though the run-rollover loop is capped at 12 iterations per pass (the effect re-runs after its save). `weekNumber` 3, because untrained weeks hold the number by design. `runPlan.currentWeek` 16.                                                                                                                                      |
| History, then Home at +16 weeks                       | Rendered in 1.5 s with **0 page errors**. The Auth emulator kept the session across reloads at +16 weeks of client clock.                                                                                                                                                                                                                                            |

Each week step cost about 5 s including a fixed 3 s settle; the settle can be
replaced by a poll.

**Observations a simulation would pin. These are not verified as defects.**

1. `buildPlan` on Thursday 10-08 wrote runDays for **Tue 10-06 and Wed 10-07**,
   both before the plan existed.
2. At +16 weeks of a 52-week marathon plan, with no runs logged for 14 weeks, the
   week was `easy_30, easy_30, long_12k`. The long run was the same as week 1,
   and week 1's strides session had become a plain easy run. That could be base
   phase or layoff handling, but nothing states the expected value.

### 3.5 Gotchas met

- **Debug log.** `emulators:exec` writes `firestore-debug.log` into the repo root.
  It is gitignored by `*.log`; I deleted mine.
- **Orphan preview server.** Killing the `npx vite preview` PID leaves an orphan
  node child; kill it by pattern.
- **Repo-root reports.** The default `html` reporter writes `playwright-report/`
  and `test-results/` in the repo. Use `--reporter=line --output=<scratch>`.
- **Concurrent builds.** Agents sharing the checkout can rebuild `dist/` under a
  running suite. Build with `--outDir <scratch>`, serve with
  `vite preview --outDir <scratch> --port 4173 --strictPort`, and Playwright's
  `webServer` reuses it locally.
- **First probe failure.** The probe's first version waited for `liftWeekKey` to
  change at +1 week and timed out, because of the long first week above. Poll on
  the run week (`runDays[0].weekKey === localWeekKey(fakeDay)`) or on the
  expected anchor instead.

### 3.6 Cleanup

- All emulators, preview servers and browsers were stopped.
- At the end, `git status --porcelain` shows only
  `src/features/program/__tests__/zz_scratch_lift_audit.test.ts`. Another agent
  created it at 20:18, with a sibling `zz_scratch_run_audit.test.ts` that its
  owner has since removed. Neither file is mine, and I left it alone.
- `dist/` already existed and was rebuilt by `verify`; it is gitignored.

---

## 4. Design input

### 4(a) A CI-friendly headless simulation suite

**Where.** Put it in `src/features/program/__tests__/sim/*.test.ts`. It joins the
existing `node` Vitest project (node environment, about 2–5 ms per simulated week)
with no config change. The harness goes in `src/test/sim/`: persona model,
seeded RNG, trace recorder, invariant library. Optionally add
`npm run test:sim` (`vitest run --project node src/features/program/__tests__/sim`)
for local iteration.

**Which CI jobs run it.** Being inside `npm run test`, it runs automatically in
`ci.yml`:

- `unit` (the required check)
- `unit-timezone` × 3
- `unit-locale` × 2
- `unit-future`
- `unit-shuffle` × 2

That is **9 executions per PR**. The deny-network preload means it must be pure,
or run on the Firestore fake; that is the right constraint. For a long soak
(hundreds of seeds × 52 weeks), add an env-gated variant (`TROPOS_SIM_SEEDS=500`)
and a **scheduled** workflow, the trade `check-race-dates.ts` made: never redden
an unrelated PR on a calendar day.

**The pipeline per simulated day must call the running code:**

1. **Plan:** `buildPlan(input)`, the call Onboarding makes (`planBuilder.ts:759`).
2. **Load:** `normalizeProgramState`, then `migrateProgramState(state, weekKey)`.
3. **Weekly rollover:** today this is **inline** in `useProgram.ts`.
   - The run-side effect (around L1157–1300) loops `nextRunWeek` (module-private,
     L384) and `advanceWeek`, up to 12 iterations per pass.
   - The lift-side effect (around L1309–1395) loops `advanceWeek`.
   - Only `weekRolloverAnchor` (`programMaintenance.ts`) and `raceBlockWeek`
     (`weekPrescription.ts`) are exported.
   - **Seam to add:** a pure `rolloverProgramme(state, profile, { todayWeekKey, recentLayoff })`
     called by both effects and by the simulation. Without it, either the loop is
     copied (ADR-0008: the tested copy is not the running copy) or the simulation
     must `renderHook(useProgram)` on the fake in jsdom (exact but slower,
     around 80 ms or more per step).
4. **Home and week view-models:** `todaySession({ nowMs, … })` (Home's card
   decision, `src/lib/todaySession.ts`) and `trainingWeek(…)` / `weekDays(weekKey)`.
5. **Lift session:**
   - `applySessionProgression(state, dayIndex, session)` (`sessionCompletion.ts:48`),
     the save-time step;
   - or, for fidelity, `commitWorkoutCompletion` on the fake (the
     `trainingDecisionJourneys` pattern), which covers the receipt and the
     transaction;
   - `buildExpressSession`, `buildEasierSession` and `buildTimeBudgetSession`
     for session variants.
6. **Run session:** `runDocument(run, now)`, `computePlanMetadata(…)` for the plan
   linkage, and the claim map in `scheduledRunCompletion.ts` for planned-day
   credit.
7. **Server weekly effects:**
   - pure deciders exported from `functions/index.js`: `_fellBehindRatio`,
     `_decideFellBehindFlag`, `_needsRaceNoShowEvaluation(profile, state, nowMs)`,
     `_decideReconciliationActions`, `_decideRecoveryEntry`;
   - `functions/lib/*.js` through `createRequire`, as `deloadEngine.cross.test.ts`
     does;
   - `computePerformanceIndex` (`src/lib/performanceEngine.ts`) for PI.
8. **Persona model:** a seeded RNG decides adherence (does the session, skips it,
   moves it), performance (hits the target, misses by k reps, logs heavier), and
   run execution (planned distance × factor).

**What to assert.**

- **Invariants each week:**
  - no NaN or negative loads;
  - every lift on its equipment grid;
  - volume within the bands;
  - lift weeks lighter in the 2 weeks before a race, in race week and the week
    after;
  - no run after race day, or the measured policy;
  - long run monotone up to the peak, with cutbacks lower;
  - taper length per distance;
  - weekNumber holds only for untrained weeks;
  - Home's card agrees with Train's cursor (ADR-0002).
- **Goal outcomes**, because "add 10 kg to my bench" **is not an app input**.
  Onboarding takes `primaryGoal`, one of Build muscle, Get stronger, Lose fat,
  General fitness or Improve running, plus run mode and race. So the outcome is
  asserted on the bench prescription by week N for a compliant intermediate; the
  marathon plan peaks its long run at 30 km or more and reaches race day on the
  target date.
- **A golden trace per persona:** a compact locale-free text table (week, phase,
  weekNumber, main lift loads, sets, runs and km, done/planned) through
  `toMatchFileSnapshot`, with a `KNOWN_DEFECTS` ratchet as `planSweep.golden`
  has.

**Determinism under the five-way matrix:**

- **Clock (`unit-future`, real date).**
  - Never read the wall clock. Pin the simulation calendar: start from a literal
    and step with `vi.useFakeTimers({ toFake: ["Date"] })` plus
    `vi.setSystemTime(simDayNoon)` each simulated day.
  - Absolute `setSystemTime` overrides the +90-day shift, so the simulation is
    immune to `unit-future`. No window relative to the real now exists, so
    CLAUDE.md's "derive fixtures from the clock" rule does not bite.
  - This is _required_, not optional: `applyProgression` stamps
    `performanceHistory.date` from `new Date()`.
  - Use synthetic race dates relative to the pinned start, never the race
    catalogue, whose dates lapse.
  - Restore with `vi.useRealTimers()` in `afterEach`.
- **Timezone (Kiritimati, Midway, Auckland DST).**
  - Step days with `addLocalDays` and construct local noon
    (`new Date(y, m, d, 12)`), never `t + n*86_400_000`.
  - Keys come from `localDateString` and `localWeekKey` (Monday-anchored).
  - A 16-to-52-week span crosses Auckland's April and September transitions, so
    include one persona whose span crosses each, and assert keys, not instants.
- **Locale (de-DE, fr-FR).** Traces use `String(n)` and `toFixed`, never
  `toLocaleString`. If a trace includes app copy with numbers, compare it through
  `src/test/localeGrouping.ts`.
- **Shuffle (seeds 23, 5).**
  - No module-scope mutable state; build each persona inside its `it`.
  - `resetFirestore()` in `beforeEach` if the fake is used.
  - Never assert `vi.mock` factory call counts.
  - Fake timers in the node environment do not touch framer-motion; that trap is
    DOM-only.
- **Randomness.**
  - Extract one `mulberry32` into `src/test/prng.ts` (13 copies exist today), with
    one RNG per persona and the seed printed in failure messages.
  - Stub `crypto.randomUUID` with a seeded counter, or normalise instanceIds out
    of traces.
- **Timeouts.** The 5 s default applies, so pass `{ timeout: 30_000 }` or keep
  each persona under 5 s.

**Cost.** 20 personas × 52 weeks on the pure path is about 2–5 s per run, nine
times over parallel jobs, so negligible wall-clock. A hook-level variant
(`useProgram` on the fake) should be measured before committing to many personas.

### 4(b) Playwright: 16 weeks in a few minutes

**Placement and CI.**

- Put it in `e2e/journeys/<persona>.auth.spec.ts`. It matches the
  `auth-emulator` project. Use an isolated account per persona, cleaned in
  `finally`.
- Give it its **own job** in `emulator-tests.yml`, for example `journeys` with a
  30-minute budget, run in parallel. The existing 15-minute `emulator-tests` job
  already carries the rules suites, the functions integration suite, the signed-in
  suite (about 5 minutes here) and design-QA. Its `auth.spec.ts` filter would
  also pick the journey files up, so either exclude the path there or name the
  files so the regex misses them.
- Use `test.describe.configure({ mode: "serial", retries: 0 })` and a
  `test.step` per simulated week. CI's `retries: 2` would triple a failing
  6-minute journey.
- New workflow jobs must keep `workflowSupplyChainGuard` (SHA-pinned actions) and
  `workflowConcurrency` green.

**Account and onboarding**, two tiers:

- **Fidelity tier, about 30–60 s.** The real sign-up form → `verifySignupEmail` →
  drive Onboarding:
  - activity Both;
  - Race prep → Full;
  - `input[type=date]` set 52 weeks out;
  - equipment, experience, injuries, body inputs.

  Then "Start my plan", with `completeOnboarding` routed into its real handler
  (the `guide.capture` code). This proves what onboarding builds.

- **Fast tier.** Admin `createUser`, then call `completeOnboarding.run(payload, { auth })`
  with the page's payload, or `buildPlan` plus direct writes (the
  `trainingDecisions` and `seed:fellbehind` pattern).

**Advancing time.**

- Per simulated day or week: `page.clock.setFixedTime(localNoon(day))`, then
  `page.goto(route)`. Measured: about 2 s for the client rollover to catch up,
  including a 14-week jump. Poll Firestore programState for
  `runDays[0].weekKey === localWeekKey(day)`, and for `liftWeekKey`; mind the
  Thursday-to-Sunday long first week.
- Keep Node `TZ` and browser `timezoneId` equal; existing specs use UTC. A
  TZ/locale matrix is possible with `test.use({ timezoneId, locale })` plus the
  Playwright process's `TZ`.
- Use `page.clock.install()` only for scoped timer work (the treadmill elapsed
  time, the 15 s GPS-acquire fallback, rest timers), never for the whole journey.
- **Node side:** handlers run in-process read `Date.now()` and `new Date()`, for
  example `computeAndWritePerformanceForUser` → `getComputeKey(new Date())` and
  `_runDailyRaceReconciliationForUser`. **No steppable Node clock exists**:
  `fake-clock.cjs` is a fixed offset. Add one, such as a mutable offset read by a
  Date shim, or a scoped `@sinonjs/fake-timers` around the call. **Verify ID
  tokens before shifting**: `admin.auth().verifyIdToken` checks `exp` and `iat`
  against the Node clock, and the emulator mints tokens at real time.
- **Server timestamps:** `serverTimestamp()` stays at emulator real time. The
  lift and run save paths write client Timestamps, and `firestore.rules` has
  **no `request.time` checks**, so a client months ahead is accepted. Watch the
  sites that do use `serverTimestamp` for staleness comparisons: `auth.tsx`
  profile docs, `useMeals`, `weightEntry`, `socialApi`, saved routines and
  routes, `Home.tsx`.

**Finishing workouts quickly.**

- **Through the UI: 8 s per full session, measured.** 48 lifts over 16 weeks would
  be about 6.5 minutes on their own. Suggested mix: one UI-driven lift per week
  (or the first week, the deload week, the race weeks and any week whose
  assertion depends on the UI), with the rest **fast-forwarded through the real
  engine** from Node. That means `applySessionProgression` on the normalised and
  migrated state in an Admin transaction, plus a workout doc shaped like
  `completeLift` writes (the `calibrateProgramme` pattern).
- This bypasses the client's `commitWorkoutCompletion` transaction, which is an
  ADR-0008 risk, so keep at least one UI session per simulated week.
- "Finish early" → "Review completed work" is faster but changes progression;
  sets left undone are judged as such.

**Logging runs without GPS**, in order of speed:

1. Seed run docs through the Admin SDK with `computePlanMetadata(…)` spread in
   (the `run-coaching` pattern), with `completedAt` as a Timestamp, because the
   runs query orders by `completedAt`.
2. RunSummary router-state injection, about 1 s, but no `scheduledRunId`.
3. **The manual or treadmill path** from `/run?scheduledRunId=<id>` with
   `page.clock.install()` and `runFor`. This is the only high-fidelity UI path
   for a planned run; it needs a helper and should be checked once by hand.

`context.setGeolocation` is too slow for distance.

**Callables during the journey.** Route `configurePlan` and `applyProgramCommand`
(and `completeOnboarding`) through **one shared helper**, for example
`e2e/helpers/realCallables.ts`; it is copied per spec today. The alternative is
adding `functions` to the emulator set, so `onWorkoutCreated` and `onRunCreated`
(performance, recovery entry) fire as in production. That was **not tried here**:
it needs `defineSecret` values (`STRIPE_*`, `RESEND_API_KEY`,
`BILLING_HMAC_SECRET`, `MAPBOX_DIRECTIONS_TOKEN`) through `.secret.local` or
similar, and more boot time. Otherwise write performance docs each week by
calling the `computePerformanceWeek` handler (rate-limited to 10 per 10 minutes
per uid) or the engine, under the shifted Node clock, or Home's Performance row
never moves.

**Weekly checks** (selectors exist today; pin new ones against real components,
as `runHudCaptureSelectors.test.tsx` and `weekStripCaptureSelector.test.tsx` do):

- **Home:**
  - `getByLabel("Today’s training")`, with the button
    `Open <dayName> in Train` and `Start workout`;
  - week-strip day buttons with labels like `^Monday 7 September…, completed run`;
  - "Performance Index N" (needs perf docs).
- **Train:**
  - the `/program` heading is the day name;
  - text such as `Target: 3×8 @ 100 kg`;
  - `Last time 100 × 8. Use it for set 1`;
  - "Start next week".
- **Run tab:**
  - `/program?tab=run` tablist "Run week" with tabs like `9, today`;
  - `getByLabel("Weekly running goal")` reading `0 / 3`;
  - "Review easier week".
- **History:**
  - `history?view=lifting|running|body`;
  - `history?tab=prs` showing "Lift PRs" and "Longest run";
  - `/history/exercise/:name`;
  - no `[class*="animate-pulse"]` left.
- **Firestore truth** each week through the Admin SDK: `weekNumber`,
  `liftWeekKey`, `currentPhase`, `runPlan.currentWeek/totalWeeks`, the runDays
  templates, main-lift loads, and the workouts and runs per week.
- **Page errors:** collect `pageerror` and assert none (the `coldstart` pattern).

**Budget estimate**, from measured parts:

| Part                                                | Cost                                                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed costs                                         | e2e build ~22 s (plus `tsc -b`), emulator boot ~10 s, sign-up and onboarding ~30–60 s                                                          |
| Per simulated week                                  | clock move + rollover ~2–3 s; one UI lift 8 s; runs by seed or state injection ~1–2 s; fast-forwarded lifts <1 s; checks on 3–4 screens ~4–6 s |
| Total per week                                      | about 15–20 s                                                                                                                                  |
| One persona, 16 weeks                               | about 4–6 minutes                                                                                                                              |
| Two personas (bench; marathon plus lifting), serial | about 10 minutes                                                                                                                               |

### 4(c) Seams: what exists and what is missing

**Exists today:**

- **Engine and view-model APIs:** `buildPlan` (pure with `currentDate`),
  `normalizeProgramState`, `migrateProgramState(state, weekKey)`,
  `applySessionProgression`, `advanceWeek`, `generateRacePlanV2`,
  `weekRolloverAnchor`, `raceBlockWeek`, `todaySession({ nowMs })`,
  `trainingWeek`, `runDocument(run, now)`, `computePlanMetadata`, the
  `scheduledRunCompletion` claim map, `computePerformanceIndex`, and the server
  pure deciders.
- **Unit tooling:** the Firestore fake and harness (whole client write paths
  incl. transactions), `vi.setSystemTime`, `localeGrouping`, and the
  `planSweep` golden plus `KNOWN_DEFECTS` pattern.
- **Browser and emulator:**
  - `page.clock.setFixedTime`, verified to +16 weeks;
  - Admin SDK accounts in specs;
  - Auth and Firestore REST with `Bearer owner`;
  - `verifySignupEmail`;
  - callable → real handler routing;
  - `configurePlan.run` directly;
  - `calibrateProgramme`-style engine replay;
  - RunSummary state injection;
  - the `navigator.onLine` override;
  - `GUIDE_UNDER_AUTOMATION_KEY` (the guide is hidden under webdriver by default);
  - `settleHeight` and `settleImages`;
  - `PW_CHROMIUM`.
- **Seeds:** `buildPlan`-based seeds and the season seed (history only).

**Needs adding**, roughly in priority order:

1. A pure `rolloverProgramme(…)` extracted from `useProgram`'s two rollover
   effects, exporting `nextRunWeek`. Without it, the simulation tests a copy.
2. A simulation harness (`src/test/sim/`): persona and adherence model, shared
   `prng.ts`, trace recorder, invariant library, and a deterministic id source
   for `generateInstanceId`.
3. A clock parameter, or the session's own `date`, for
   `applyProgression`/`recorded` `performanceHistory` dates. Until then,
   simulations must fake `Date`.
4. `e2e/helpers/realCallables.ts`: route `completeOnboarding`, `configurePlan` and
   `applyProgramCommand`, and call `computePerformanceWeek`. Optionally a
   Functions emulator with test secrets, so triggers run.
5. A steppable Node clock for in-process handlers (verify tokens first).
6. Journey helpers: `createPersona(goal)`, `advanceTo(day)`, `finishLiftViaUi()`,
   `fastForwardLift()`, `logRun({ via: "seed" | "summary-state" | "manual" })`,
   `assertWeek(…)`, with selectors pinned in unit tests.
7. A manual or treadmill run helper using `page.clock.install()`; no spec covers
   this path yet.
8. A `journeys` CI job with its own budget, `retries: 0`, and serial steps.
9. Optionally: run the nine signed-out specs somewhere (they gate nothing today).

---

## 5. Baseline: `npm run verify`

**What it runs:** `npm run lint` (eslint, `--max-warnings 0`) →
`check:form-art` → `check:form-drafts` → `check:cycles` (madge) →
`npm run build` (`tsc -b && vite build && stamp-sw`) → `check:dist-size` →
`npm run test`. It does not run CI's Python verifier unit tests or the eight
matrix variants.

**Result: PASS (exit 0), 603 s wall**, from 20:07:44 to 20:17:47 UTC on 4 vCPU.

| Step                                                  | Result                                                                                                                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| lint, form-art, form-drafts, cycles, build, dist-size | 147 s together. Vite built in 21.7 s. Form-art and form-draft audits report `errors: []`. "✔ No circular dependency found!"                                                                                              |
| `check:dist-size`                                     | **OK.** 5,967.1 kB against a 5,951.4 kB baseline. Advisory: new small chunks `ios` (0.6 kB), `raceRest` (0.3 kB) and `SessionLengthLabel` (3.9 kB); `ProgrammeSettings` is 14% under its baseline.                       |
| Unit suite                                            | **455 s.** 1,075 files (1,067 passed, 8 skipped); 12,156 tests (11,784 passed, 372 skipped). Breakdown: transform 41 s, setup 76 s, import 361 s, tests 288 s, environment 441 s. Load average was about 5–6 throughout. |

The tree was clean when the suite collected files. Two `zz_scratch_*` tests from
another agent appeared later, at 20:17 and 20:18, so they were not part of this
run.
