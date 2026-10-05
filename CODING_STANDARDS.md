# Coding standards

What a change in this repo is held to at review: the corrections that kept coming back, and how the app's words read. `code-review-matt` reads this file for its Standards axis, and an implementer reads the section for the area they are changing. Mechanical rules belong in a check (a lint rule or a guard test) rather than here; several rules below already have one, and each names it.

Moved out of CLAUDE.md on 2026-10-05. Code comments that cite "CLAUDE.md's recurring-mistake rule" or "CLAUDE.md's house voice" mean these sections.

## Recurring-mistake rules (mined from git history, 2026-06-02)

These are distilled from the project's own rework history — classes of mistake that got fixed **more than once** across different PRs/arcs. Each is a standing rule, not a one-off. Cited shas are the corrections that prove the pattern recurred. (This repo's PRs are self-merged via Claude Code with no GitHub review dialogue, so the rework commits — not review comments — are where recurring corrections live.)

- **The tested copy does not prove the running copy.** When the same business rule lives in two places — client `src/lib/*` vs `functions/*` (e.g. `performanceEngine.ts` ↔ `performanceEngine.js`), or any value re-derived in a second module instead of read from where it's already computed — treat the non-canonical copy as the prime drift suspect. Consolidate to one source of truth, or add a test that pins the copy that actually runs; never assume green client tests prove the server's behaviour. (`62a9cfa` server engine diverged from the tested client engine and inflated new-user PI; `a169336` deleted a `useHomeData` re-derivation; `e1b0296` nutrition-phase regression; Run9 3b server mirror of `resolveRecoveryExit`.)
- **Persist every mirrored and derived field in the same write.** A persisted field usually has consumers that read it from a _different_ location, or derive other fields from it. Enumerate them before you write. A write to `programState` must mirror into `profile.program.*` (consumers read the profile copy); writing `raceGoal` must materialize `runMode`; changing goal/rate must materialize the nutrition phase. Don't leave a parallel store stale for "something else" to reconcile later. (`5caad06` equipment/injuries/split not persisted to profile; `e1b0296` editor wrote `programState.goal` but macros read `profile.program.goal`; `3087ac5` `raceGoal` written without derived `runMode`; `4db6cb7` goal-weight didn't drive the phase.)
- **Never call raw `setDoc`/`addDoc`/`updateDoc`/`deleteDoc`.** Always route through the guarded wrappers in `src/lib/firestoreWrite.ts` — they strip `undefined` (which Firestore rejects outright) and survive offline-queue replay (a raw write that fails online fails forever on every flush). Any **new persisted profile field** must also be added to the `functions/profileSanitizer.js` allow-list, or the Cloud-Function write silently drops it. (`5061046` migrated ~25 raw call sites + fixed safeSave/safeMerge re-failing on every offline flush.)
- **Treat every Firestore trigger as at-least-once and concurrent.** `onCreate`/`onWrite` handlers re-fire on retry and can run in parallel. Any read-modify-write inside one must run in a `runTransaction` AND guard re-delivery with a per-source idempotency marker — MIN/MAX-style updates are the only naturally-safe exception. `syncChallengeProgress` had to be fixed twice: once for a lost-update race (`23369ef`), once for double-counting on retry (`dc3e4a6`).
- **Never mix local-date and UTC operations in one calculation.** Use the existing `localWeekKey()` / local-midnight helpers consistently for any day/week bucketing, and pin scheduled functions to explicit **UTC** — a Europe/London schedule anchor silently shifts an hour under BST. (`5ad5794` bucketed weekly run-stats into the wrong week near midnight in non-UTC zones; PR #815 BST shifted the rollup/refresh schedules; `8b856fa` captures `profile.timezone` on boot.)
- **A negative assertion under `waitFor` proves nothing unless something anchors it.** `await waitFor(() => expect(x).toBeNull())` is satisfied on its FIRST poll by the initial state and returns before the awaited work has landed — so it passes at t=0, and a value that becomes wrong _asynchronously_ is invisible to it. Anchor on a positive first (wait for `loading` to flip, or for the other account's value to appear), or hold the read with `deferReads()` / `releaseRead()` and assert after releasing. Two instances so far, both pinning documented security properties that nothing was actually holding: `usePushSettings` uid-safety passed with EVERY uid guard deleted, and 5 of `useLastRunType`'s 7 tests passed while the hook offered a repeat row to every user including signed-out ones. Both were found by mutating the hook to go wrong AFTER the read — the mutation shape a synchronous probe misses.

- **An absence assertion that is the ONLY assertion in a test stops
  testing anything the moment its mechanism stops being the one in use.**
  The sibling of the `waitFor` row above, and the failure is quieter: the
  test keeps passing, so nothing ever points at it. Six instances, all in
  `useProgramWriters.test.ts`, all
  `expect(setDocCalls().length).toBe(0)` on writers that had moved behind
  the ADR-0011 command boundary and no longer write documents on ANY
  path — so the assertion was true whatever the guard did. **Deleting the
  guard outright left every one of them green**, including the two that
  stop a user erasing a scheduled race by swapping it to an easy run.
  Fixed by asserting the absence of the COMMAND KIND in `sentCommands`
  (#2424: `overrideRunDay`, `markManualComplete`; #2425:
  `restoreWorkoutDay`, `restoreRunDay`, `setNextWorkout` x2) — the
  pattern the three `moveRunDay` refusal tests in the same file already
  used, having been repaired when THAT writer moved and nothing swept the
  rest.
  The discriminator is not "don't assert on writes". Seven other no-write
  sites in the repo are sound, and not because their writers still write
  documents (`workoutCompletionQueue` writes through a `runTransaction`).
  They are sound because in each, the empty log is a SECOND assertion:
  `workoutCorrection` anchors on two `rejects.toThrow(...)`,
  `workoutCompletionQueue` on the flush return plus both queue lengths,
  `WeightLogSheetRecovery` on a visible control and an alert's text, and
  `firestoreFake`'s two are testing `deferWrites` itself, where the empty
  log IS the behaviour. Anchor an absence on something positive and the
  write check can stay as corroboration.
  Only mutation settles it: remove the guard and re-run. If the test
  still passes it was never testing the guard, and reading the test
  cannot tell you that.

- **Scope a mutation run across BOTH sides of a mirror, or it will lie to
  you — in the direction that invents work.** The standing rule is that a
  green client suite does not prove the server; the inverse is just as
  true and less obvious. Mutating a `functions/` constant and running only
  `functions/__tests__/` reports "unpinned" for anything whose pin lives
  in a `src/` cross-test. Hit twice in one sitting on 2026-09-14:
  `RECENT_AUTH_MAX_AGE_SECONDS` (the 5-minute re-auth freshness gate on
  account deletion) and `MAX_FOCUS_SUPPORTERS` both read as unheld
  server-side and are in fact pinned — the first by
  `src/lib/__tests__/accountDeletionAuth.test.ts` with a literal plus
  both boundary seconds, the second by
  `src/features/goalSpace/__tests__/weeklyFocus.cross.test.ts`. Both were
  a sentence away from being written up as security findings. Run the
  mutation against `npm run test` from the repo root as well as the
  `functions/` suite before concluding anything is unpinned, and grep the
  constant's NAME across `src/` — the cross-tests are named for the
  feature, not the constant, so a suite-name scan misses them.

- **A precondition signature must be computed from data BOTH sides can see.** The programme command boundary signs a workout day as `dayName|instanceId|…` on both sides, but the client normalised a loaded row that lacked an `instanceId` by inventing a random UUID, while the server signed the stored `undefined`. Until the client's write-back landed — and on every cache-first paint and refetch before it did — no command on that day could ever pass, and eleven writers collapsed the server's precise reason into "Couldn't X. Refreshing." (owner: "some things don't work", 2026-09-02). Two rules: any value that feeds a client↔server agreement check must be derived deterministically from the same stored bytes on both sides (`legacyInstanceId`, mirrored and pinned by `programCommands.cross.test.ts`); and a rejection's server message is diagnostic data — surface the user-fit part (`describeRejection`) and capture the rest, never flatten it to a generic toast.
- **`onAuthStateChanged` fires several times per sign-in.** Debounce one-time / side-effecting work (maintenance backfills, etc.) behind a settle timer — a bare `firedRef` guard has a race window during the sign-in settle. Scope any queued or cached writes (offline queue, share queue) by `uid` so they can't leak across an account switch on a shared device. (`9ae1247` debounced the maintenance backfill; PR #820 uid-scoped the offline + share queues.)
- **Deleting a test file is a documentation change too — grep for prose that cites it.** A header saying "this is exhaustively covered by X" keeps steering people away from writing tests long after X is gone, and it reads as authoritative because it names a file and a test count. `useClaimMap.test.ts` claimed the completion predicate was "exhaustively covered by" `functions/__tests__/scheduledRunCompletion.test.js` (29 tests) + a cross-test; **both were deleted in #1733** and nothing replaced them. So nobody wrote rejection cases, and the locked 70% distance gate ran for months comparing **metres to kilometres** — a marathon slot completable by a 29.5-metre run — with a fully green suite (`b525af6f` fixed the unit, `051e7765` the header). Same shape as PR #1775's `templateId === "race"`: on both, the accept path was fiction and nothing asserted a rejection. When you delete or rename a spec, `rg` its filename across the repo; when you inherit a "covered elsewhere" claim, open the file it names before trusting it.
- **A centrality or cohesion score is a question, not a defect.** Graph metrics (graphify communities, "god nodes") cannot distinguish a deployment manifest or a shared vocabulary from tangled logic. `functions/index.js` scores the worst cohesion in the codebase (0.023) purely because every deployed function must be exported from one entrypoint — the split has now been re-derived and declined **four** times; the standing hold + its reasoning live in `functions/__tests__/triggerMetadata.test.js`. `RUN_TEMPLATES` bridges seven run communities because a shared run vocabulary is exactly what it should be. ADR-0001 already bars the size argument; treat these scores as prompts to go **read**, and expect the answer to often be "correct as-is". (The 2026-08-02 graph run's value was entirely in what reading turned up while chasing its questions — both of its own headline verdicts were "change nothing".)
- **A label must name what the number under it actually IS — and when it
  does not, the right word is usually already on the same screen.** Four
  corrections in one arc, all on History/Analytics, all the same shape:
  copy asserting something the data does not support. "Fastest 5K" over a
  bare `M:SS` that was a per-kilometre pace, not a 5K result (#2335).
  "Fastest 1K" / "Fastest 5K" over `avgPace` — a WHOLE run's average from
  a pool filtered by a distance floor, so a 10 km runner held a record
  for a distance they had never covered alone, and both rows printed the
  same figure and date whenever one pool contained the other (#2346).
  "Rep-range PRs" over buckets matched EXACTLY, so 2/4/6/7/8/9/11/12 reps
  produced nothing at all (#2349). A bodyweight metric pill rendering its
  internal `Metric` key, "1RM", over a chart of total reps (#2353).
  The tell that makes these quick: in THREE of the four the correct
  wording already sat a few lines away — "Max reps" in the header stat
  beside the 1RM pill, "Personal bests by reps" on the bodyweight side of
  the very ternary that said "Rep-range PRs", `"Seconds"` in the
  `isTimed` branch of the pill that said "1RM". Find the sibling that got
  it right before inventing wording. Two guards hold parts of this —
  `prRowUnits.test.ts` (a row's value carries its unit; a label may not
  name a race distance for a whole-run average) and
  `bodyweightMetricLabel.test.ts` (the pill says Reps, the union keeps
  its key) — and the rest is judgement, deliberately: a guard that looked
  like it covered the class would be worse than none. An internal key, a
  storage field name or a metric id is not copy, and a label that reads
  as a claim will be read as one.
- **Verify the three design-system invariants that keep drifting back, per-PR — not in periodic sweeps.** Before committing any UI: every numeric display uses `font-mono` + `tabular-nums`; every colour is a `THEME`/token (no hex literals); every interactive element clears 44px via the `Button`/`IconButton`/`Toggle` primitives (44 CSS px is a Tropos product target, NOT the WCAG AA floor — SC 2.5.8 is 24x24 and 44x44 is the AAA criterion; clearing the size is also not by itself an accessibility pass. DESIGN_GUIDE.md §10 carries the three units and their exceptions). These three regress constantly and keep getting swept up after the fact. (`2dec467` + `97a783d` mono/font audits; `9ef01a1` + `82b5266` tokenized stray hex; `f89d34b` whole-app consistency pass; touch-target policy shipped in 5 parts.)

## House voice — how Tropos talks (app-wide, 2026-08-22)

The rubric has lived in `src/lib/performanceInsights.ts`'s header since it
was written; the 2026-08-22 copy sweep found the rest of the app was never
held to it, so it is now the APP-WIDE standard, not an insights-file local:

- **Observational, not judgmental.** "Load is high" ✓ · "You're crushing
  it!" ✗. State what the data shows; pair it with what to consider next.
- **No exclamation-mark cheer in UI chrome.** Confirmations, toasts,
  banners, summaries: "Saved", "Meal logged", never "Saved!". The
  checkmark carries the success.
- **No AI-tells.** "Your plan knows…" (anthropomorphised app), "unlock /
  elevate / seamless / your journey", motivational-poster tails glued
  onto clean sentences ("…that's what drives progress"), a literal "+"
  in prose, and the every-sentence-ends-in-an-epigram cadence (one strong
  line is a coach; ten out of ten is a language model — the coachPrompts
  trim was exactly this).
- **No system-speak.** Users search for a food, not "accurate data"; a
  planned run is not a "scheduled slot"; nothing "occurred unexpectedly".
- **Genre exceptions are real and stay.** Spoken mid-run audio cues are
  NRC-register coach speech ("Last one — leave nothing!" is correct
  THERE); kudos quick-chips are the USER'S voice to a friend ("Nice
  run!" stays); badge names are Fitbit-era vernacular ("Week Warrior"
  stays); share-card fun facts are playful by design. Do not flatten
  these into the calm-chrome register.
- **Buttons are sentence case** ("Start workout", "Add exercise") — the
  Title Case strays kept reading unpolished next to the majority.
- Reference register when unsure: Strava (data-forward, terse), Hevy
  (minimal utility), MyFitnessPal (plain), MacroFactor (never shames a
  high day), Happy Scale (a stall reads as "expected", not failure).
