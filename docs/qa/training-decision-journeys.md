# Training decision journeys

Target: `b667e8a34ffc15063c595de24b32149bdd609fcc` (current main at start).
The owner approved testing complete training journeys and fixing demonstrated
gaps, following the narrower decision after the whole-app audit.
Rebased without conflicts onto `abe8896` (#2293) before the original validation.
Release preparation also integrates `29c4941` (#2294), preserving its shared
race-date helper and midnight-safe capture fixture alongside the explicit
Sunday/Monday block checks. The application code and browser journey are
unchanged from the verified batch.

## Bounded decision

The Programme easier-session recommendation reads a run's completion timestamp
instead of its saved training date and ignores the running subscription's
authoritative-evidence flag. The shared recovery projection also treats an
exercise saved with zero completed sets as performed work. Reproduce these at
their actual consumer/record boundaries, then correct the evidence projection.

The lifting handoff's adherence and monitoring principles (Helms, adherence and
progression chapters; Schoenfeld, programme design and concurrent training) and
the running handoff's input qualification principles (Magness chapters 10–12
and 16) support separating performed work from plans. They do not establish a
new physiological threshold. Preserve the existing recovery windows, hard-run
definition, last eligible working-set progression, RPE holds, and deload rules.

Trace full, partial, usual-time, express and easier sessions through completion,
saved correction, and the next prescription. If existing safeguards pass,
retain them. An upcoming run alone does not authorize silently moving a
split-ordered lift or reducing its targets. A broader weekly planner and an
automatic repeated-incompletion adjustment are outside this decision.

Tracing the later advice also exposed a separate mismatch: the existing
`detectStall` compares only weights for loaded lifts, ignores saved variant and
planned-set evidence, and admits warm-ups/drop sets. Consequently increasing
reps or deliberately reducing a session can still offer a plateau calorie
adjustment although the progression transaction behaved correctly. Qualify
those observations and compare both load and reps. Keep its three-session
window, explicit review action and existing adjustment policy. A known shorter
or incomplete occurrence breaks that sequence; do not skip backwards to revive
an older plateau. No new nutrition recommendation is added.

## Owners, preview and rollback

Run/workout documents own performed facts. `useRunningStats` owns run evidence
freshness. Programme chooses the actual cursor/chooser day. Extract its existing
recommendation into a hook so tests exercise the same live consumer. Shared
`hitsFromWorkoutDocs` keeps Programme and History aligned. Completion and
correction transactions remain the only owners of their existing progression
updates. No new saved fields, migration, server policy, or automatic plan write.

The existing easier-session chooser remains the preview/action. Advice by
itself cannot mutate the plan. A code revert restores the old projection; no
data rollback is required.

## Verification

Record baseline reproductions, then verify live corrections/deletions, cache
and pending-sync gates, account/date transitions, actual completed sets, chosen
session variants, correction replay, newer-target protection and explanations.
Run the required full verify gate and an authenticated emulator browser journey.
Measured results are recorded below.

### Measured reproductions and focused checks

- The existing Programme decision was extracted unchanged into its real hook
  before testing. Seven of twelve new consumer cases failed: both directions
  of midnight misattribution, zero distance/duration, pending correction, an
  empty exercise, and preparation-only work. All twelve pass after the fixes.
- The existing plateau detector failed thirteen added checks, including the
  actual three-session completion/correction sequence. Reps increasing at a
  fixed load, added load on weighted pull-ups, shorter variants, incomplete
  work, set types, changed saved targets and exercise identity were covered.
  These now pass; positive unchanged-working-set controls still pass.
- The combined focused run passed 86 tests across seven files. Cached and
  pending snapshots cannot drive the actual lifting recommendation. Live
  corrections, deletion, account switches and app-resume date changes update
  its result.
- Existing completion/correction policies passed: shorter execution retains
  its saved target, omitted exercises retain history, full working sets use
  the last eligible set, RPE holds survive corrections, repeated incomplete
  sessions do not accumulate failures, and corrected performance carries into
  the next week. A later edit to old history does not overwrite that newer
  prescription. No progression-engine change was needed.
- The authenticated emulator browser journey passed in 1.4 minutes with
  retries disabled, starting with empty emulators. It creates its own account
  and uses the real plan builder, so CI's authentication job needs no capture
  fixture. It uses real login, Firestore listeners, workout logging,
  correction and next-week controls. A full three-set squat session first
  advances the load; correcting its last set from eight reps to six returns
  the next target to 100 kg. After advancing the week and reloading, the live
  session shows that target and `100×6` in each previous-performance row.
- The same browser journey checks upcoming run identity and unchanged lifting
  prescriptions while suggestions appear/disappear, midnight attribution,
  invalid runs, empty/performed lifts, shorter-session plateau suppression,
  rep progression and live deletion/correction. The original saved target
  and start date remain intact. Both themes were visually inspected.
- Two browser-fixture assumptions were corrected before the passing run: the
  seed now includes the existing `baseSets` anchor rather than invoking its
  repair migration, and the test follows the automatic review screen after
  the final set rather than waiting for an extra Finish button. No app
  assertion, action timeout or retry allowance was relaxed. The final
  self-contained browser fixture also passed ESLint and the full TypeScript
  check, and its screenshots were inspected in both themes.
- The production bundle gate passed: 298 chunks, 5,656.7 kB against the
  unchanged 5,656.1 kB baseline from #2293. The dependency check processed
  1,579 source files and found no circular imports.
- The first complete unit run reported 9,130 passes, 344 skips and one
  failure in the existing race-refresh writer test. The exact failing case
  also failed on clean `abe8896` (one failed, 56 filtered out). Its fixture
  derived the race weekday from the current date but assumed six calendar
  weeks always meant six training weeks. A Monday race needs an additional
  calendar week under the existing planner rules. The fixture now explicitly
  covers Sunday and Monday races, retains the uncompressed-plan assertion,
  and also checks that refresh preserves the original block length and
  position. No race-planner production code changed. The complete writer
  and plateau files then passed 78 tests, with one existing skipped test.
- The original `npm run verify -- -- --maxWorkers=4 --reporter=dot` exited zero.
  ESLint reported zero errors and 97 warnings within the unchanged 99-warning
  ceiling. Both artwork audits, TypeScript and the production build passed.
  The complete unit suite passed 9,132 tests, with 344 skipped; 788 test files
  passed and eight were skipped. No test assertions, timeouts or retry
  allowances were weakened to obtain this result.
- After integrating #2294, the same full verification command exited zero:
  9,136 tests passed, 344 skipped; 789 test files passed and eight skipped.
  Lint, both artwork audits, TypeScript and the production build passed.
  The application code and authenticated browser test remain identical to
  the already verified versions; the rebase combines the test-fixture changes.
