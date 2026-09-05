# Master improvement brief — implementation log

## Scope and baseline

Started 2026-09-05 on `codex/master-improvement-batch-1`, from
`2a78febedac1044ca050e58bd5f358fe123ba7d0`. The initial worktree was clean.
This is a first local implementation batch, not a completed app/security audit.
No push, PR, deployment, production configuration change or production data
mutation is part of this batch.

The owner's master improvement brief and six-frame exercise image specification
govern the work. Preserve the canonical athlete and fixed camera within each
exercise, and obtain pilot approval before a library-wide art rollout. Existing
files are not automatically approved against the new specification.

## Implemented defects

### FORM-001 — stale requests could display the wrong exercise instructions

- Surface: `ExerciseFormContent`, shared form-guide content.
- Reproduction: request Row, switch to Squat, resolve Squat, then resolve Row.
  The old response replaced the current instructions. Closing and reopening a
  guide also allowed the previous session's response to overwrite the new one.
- Fix: invalidate each effect's response on exercise/session change; prevent an
  old response from ending the current loading state; reset the selected beat.
- Evidence: three failing regression cases before the fix; all four lifecycle
  cases pass afterward (including inactive guides not loading).
- Verification level: mocked component tests, not a live-device walkthrough.

### FORM-002 — local form guides waited for an unused external photo database

- Surface: `getExerciseDemo` and its form-guide caller.
- Reproduction: a stalled photo-database fetch prevented authored local guidance
  from resolving even when the surface already owned its rig/placard visual.
- Fix: the caller requests local guidance when a rig is available; reviewed
  catalogue media also returns without that optional remote lookup. Unknown
  exercises retain the existing reference-photo fallback.
- Evidence: two failing local-resolution cases before the fix; all three pass
  afterward. A separate component assertion verifies the production caller
  actually opts into the local path.
- No external photos have been reclassified as approved animation frames.

## Catalogue and screen coverage

Regenerate the source-derived ledger with:

```sh
node scripts/audit-app-coverage.mjs
```

See [INVENTORY.md](INVENTORY.md) for canonical IDs, current render paths, template
usage, frame paths and route declarations.

- 152 canonical exercises; 7 have reachable six-frame placards with local files
  present, and 145 do not. All 152 currently resolve a body demo, including aliases.
- Existing complete sets: bench press, barbell row, overhead press, lateral
  raise, rope tricep pushdown, skull crushers and dips.
- Deadlift, pull-ups and squat have six authored beats but no complete live set.
- 41 distinct literal route patterns were found. Routes are not an exhaustive
  inventory of sheets, nested tabs, controls, roles or conditional states.
- Live screens tested this batch: **0**. New-standard artwork approvals: **0**.
- No exercise images were generated or replaced in this batch.

## Verification and environmental blockers

The required `npm run verify` was attempted before editing. Lint and build passed
before it reached tests. Its test stage is **incomplete/blocked**, not a pass:
automatic safety review stopped continuation because the suite reached Firestore
over the network without an established destination or data scope. Do not rerun
the unmodified suite or route around this restriction. First establish a safely
isolated destination and inspect the affected tests, or obtain explicit authority
for the exact destination and operations. No tests were disabled to hide this.

The affected pure/component suites were separately inspected and run with mocked
data boundaries; no live Firebase is needed for these tests:

```sh
npx vitest run src/components/__tests__/ExerciseFormContent.lifecycle.test.tsx src/components/__tests__/ExerciseFormContent.test.tsx src/lib/__tests__/exerciseDemo.local.test.ts src/lib/__tests__/exerciseDemo.test.ts src/components/__tests__/ExerciseRigDemo.test.tsx src/components/__tests__/ExerciseDemoPlayer.test.tsx src/lib/__tests__/exerciseTempo.test.ts
```

Result: **7 test files, 91 tests passed**. This does not certify the full suite.

Other blockers:

- Firebase emulators could not start: the available Firebase tooling requires
  Java 21 or later; this environment has Java 17. No emulator fixture was seeded.
- The supported browser blocked navigation to the localhost preview with
  `ERR_BLOCKED_BY_CLIENT`. No alternate browser/routing bypass was attempted.
- Login, cross-account permissions, payments, native behavior, offline sync and
  screen-to-screen journeys remain unverified.

Post-change checks:

- `npm run lint`: passed, 0 errors and 99 warnings (same count as baseline).
- `npm run build`: passed; Vite production build completed in 14.51 seconds.
- `git diff --check`: passed.
- The seven scoped suites were rerun after formatting: 91 tests passed.
- The inventory generator completed successfully: 152 exercises, 7 wired
  complete placards, 41 distinct literal route patterns.

## Next bounded batches

1. Establish an approved reachable test preview, compatible emulator runtime and
   disposable accounts. Confirm all backend destinations, including callable
   functions, before seeding data or exercising authenticated mutations.
2. Walk each route and its actual UI states: loading/empty/error/offline, back
   navigation, interrupted workouts, validation, persistence, accessibility,
   reduced motion and supported screen sizes. Record expected versus observed
   results and evidence; keep blocked cases separate from passes.
3. Review existing art and establish one approved six-frame pilot against the
   supplied master reference. Build the body/joint/equipment state ladders first;
   verify the loop seam as well as individual frames. Keep six separate native
   high-quality sources, consistent captions and an accessible paused state.
   Vector-like raster art is not an actual SVG asset.
4. Migrate by canonical exercise ID in reviewable batches. Prioritize frequently
   referenced built-in exercises, but do not substitute a similar-looking motion
   or count six files as biomechanical/style approval. Preserve working fallbacks
   until replacements pass review, and track all 152 entries to closure.
5. Perform the scoped security/privacy review: authorization and cross-account
   isolation, server validation, secrets/log redaction, storage access, dependency
   exposure, device-local data retention, account deletion and operational
   recovery. Findings require source or controlled-test evidence; no exploit
   traffic or production policy changes are authorized by this log.
6. Prioritize feature proposals only after observing user friction. Evaluate
   equipment-aware substitutions, clearer progression explanations and faster
   in-workout logging against what already exists; these are hypotheses, not
   verified missing features or approved product changes.

Every subsequent batch should record changed files, regression evidence,
remaining risks and rollback scope. Do not claim whole-app completion based on
route enumeration, green unit tests or artwork file counts.

## Batch 2 — supplied screenshot review (2026-09-05)

Reviewed all 16 owner-supplied screenshots (eight surfaces, light/dark) and traced
the findings to source. See [CAPTURE_REVIEW_2026-09-05.md](CAPTURE_REVIEW_2026-09-05.md)
for the full per-surface evidence and limits.

Implemented: Analytics recovery-verdict consistency; a usable calorie override
draft with blur saving, persistent reset and target mirrors; an emulator-only
guard plus provenance/dialog/viewport metadata for future capture runs.

No new images, deployment, push or PR. No local authenticated walkthrough. The
modified capture harness still needs a CI run; the owner-supplied artifact
predates these edits. Full-suite verification remains blocked as documented above.

Verification for batch 2:

- **12 focused test files, 171 tests passed** (PerformanceTab states, shared
  performance helpers, NutritionSection editor, target recipes/status and capture
  destination guard). Data subscriptions and chart telemetry are mocked; capture
  guard tests are pure and never launch a browser or initialize Firebase.
- `node --check scripts/visual-capture.mjs`: passed.
- Main working-tree lint/build encountered an unterminated comment in
  `src/features/challenges/useChallenges.ts` (TS1010 / parsing error at line 81).
  That file was unchanged when this batch began and changed during the session;
  it is not authored by this batch and was left intact. This is a measured
  working-tree conflict, not a claim that the repository baseline was broken.
- Created detached verification checkout `/tmp/tropos-review-check.GYdxp0` at
  the original base and copied only the authored changes from batches 1 and 2.
  **Lint passed: 0 errors, 99 warnings. Production build passed: 24.65s.**
  Both original and verification checkout pass `git diff --check` for tracked
  whitespace changes. No full-suite or live-backend result is inferred from this.
- One initial scoped test invocation was interrupted by a cancelled network
  approval. The completed focused run used the installed local test executable
  with chart telemetry additionally mocked alongside data hooks. It reproduced
  five Performance regressions before their fix and passed after it.

Remaining gate: run the changed capture workflow on a separately approved testing
branch and review before/after light and dark viewport captures. A GitHub push
requires the owner's authorization under the master brief; none was performed.
