# Trusted app state — Milestone A

Implements F01–F08 from the whole-app audit of 13 September 2026. Based on
`main` at `325decb` (updated from `cb3a4ae` before the final gate), on branch `codex/trusted-app-state`.

## Result

- Workout sets, Undo and in-session corrections remain a draft until Save.
  Foreground saves and offline replay use the same idempotent transaction for
  the workout record, completion marker and eligible progression. A retry
  preserves the original receipt. A newer week, completed session or edited
  exercise target is preserved. Old queued per-set commands cannot change
  progression after a saved workout owns that day.
- The session retains its starting prescription, programme identity and local
  start date through resume and save. History records original planned values
  alongside the performed sets, even after the next target changes.
- History now offers **Correct workout** for weights, reps/hold seconds and
  duration. Corrections retain the workout ID, date and planned values, use a
  revision check, recompute volume/calories, and invalidate record caches in
  the same transaction. A failed save keeps the draft available for retry.
  Progression is revised only for an exercise still owned by that saved
  completion, with the same week, block and progression policy. A subsequent
  override is preserved. Legacy workouts without that provenance can still
  have their recorded facts corrected.
- Record caches rebuild from full workout history after invalidation, including
  valid records older than the usual 50-session preload. A session opened before
  a correction cannot write its stale cache over the invalidation.
- `onWorkoutUpdated` reconciles lifetime volume, volume/hybrid challenges,
  linked feed summaries and the current Performance Index, including baseline
  evidence. It reads the current workout rather than trusting event order;
  marker deltas make repeated corrections and deliveries idempotent. Creation
  also reconciles if correction arrived first. Deletion reverses the corrected
  amount. Feed captions, visibility and historical earned badges/streak events
  retain their existing policies.
- Programme generation and migration commit only changed top-level fields.
  Unrelated newer state survives; competing changes to the same array or field
  fail with an actionable conflict. Profile/layout and plan changes commit
  together, including Configure Plan's client/server boundary.
- A stale saved race template in the current week is repaired inline with
  programme load using current layoff evidence. Completed runs, lift progress,
  plan duration and week index survive. Previous weeks still use rollover.
- Home, Food and the daily nutrition snapshot share live, bounded meal and
  bodyweight evidence. Corrections and deletions update adaptive inputs.
  Shared local-date subscriptions refresh activity windows, day-type targets
  and daily snapshots after midnight or app focus. Existing adaptive caps,
  manual overrides and subscription gates remain in place.

## Validation

Regression coverage exercises actual source-state transitions, rollback,
idempotency, stale edits, full-history record rebuilding and correction retry UI.
The Firestore emulator checks the client transaction under the checked-in rules
and invokes the real Cloud Function handlers for correction, creation, deletion
and Configure Plan. Mobile browser checks cover both themes, reduced motion,
44px inputs, saving and reloading corrected history.

Measured checks:

- Lint: 0 errors, 98 warnings, within the repository's 99-warning budget.
- Production build and both form-art checks: passed.
- Server unit suite: 85 files, 1,384 tests passed. After the final legacy-command
  guard, the affected command suite passed all 202 tests, including the added
  regression.
- Real Firestore client checks: 2 passed. Real server integration and trigger
  metadata checks: 30 passed across 4 files.
- Mobile browser checks: 2 passed; light and dark screenshots visually reviewed.
- Final `npm run verify`: passed on the updated branch. The app suite passed
  8,948 tests across 766 files; 343 tests in 8 gated files were skipped.
  Lint, both asset checks and the production build passed in the same run.

Reproduce the emulator checks with the repository's local Firebase emulator
configuration and `demo-tropos` project. Invoke the root emulator suite with
`node node_modules/vitest/vitest.mjs run src/features/program/__tests__/trustedState.emulator.test.ts`:
the ordinary root unit runner deliberately blocks networking. The server
integration files are `workoutCorrection`, `configurePlan`, and
`activityDeleteReversal` under `functions/__tests__/integration`. Browser coverage
is `e2e/workoutCorrection.auth.spec.ts` in the `auth-emulator` project, using the
emulator build and test-user seed.

## Release scope

This branch contains implementation and local verification, not a deployment.
Ship the backend (`configurePlan`, `applyProgramCommand`, `onWorkoutCreated`, `onWorkoutUpdated`)
before or with the web build. The Configure Plan callable retains the legacy
payload path for already-installed clients; stale-write protection on that
path requires the updated client to send its editing baseline. Server-derived
correction totals and shared summaries require the new trigger to be deployed.

Saved-workout corrections require a connection for their revisioned transaction;
they do not blindly replay a stale edit offline. Original planned values cannot
be reconstructed for old workouts that never stored them. This milestone does
not change native packaging, introduce another running mode, or complete the
remaining whole-app roadmap.
