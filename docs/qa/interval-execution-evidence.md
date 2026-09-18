# Interval execution evidence — 2026-09-18

Base: PR #2386 at 8137c97b0c251517035fa3c770a31fec5e2d851d.
The existing CI and Firebase Emulator Tests for that exact head both passed.
This continuation requires a new check run; earlier green checks do not
validate the new code.

## Implemented

The player now uses pure immutable transitions. Clock/odometer anchors and
segment results live together in state, so replaying a React updater cannot
mutate an anchor before the second calculation. Repeated identical ticks
return the same object, preventing the Run page's player-dependent effect
from repeatedly allocating state at unchanged elapsed time/distance.

The launched target and single pace target are copied by value. A partial
active segment appears as `in_progress` in the existing `state.results`
projection, which Run.tsx already passes to RunSummary and its durable save.
The record describes the latest observed timer/GPS sample, not an invented
exact finish sample. Completed/skipped records are retained separately.
Invalid/regressing counters do not advance a rep and mark evidence uncertain.

`intervalExecution.ts` adds a pure descriptive evaluator and summary formatter.
It validates saved targets, rep ordering, duplicate/gapped rows, capture
version, measurement validity and segment totals against the saved run.
It separates completed, skipped, partially recorded and unrecorded reps.
Unrecorded is not synonymous with skipped or failed. Pace differences use
only completed reps, good route confidence and the original saved pace target.
There is no invented tolerance band and no fitness/adaptation recommendation.

## Explicitly not yet integrated

The evaluator is not yet mounted in RunSummary/RunDetail and has no effect on
training plans. Its required `recordingContinuity` input must not be set to
confirmed just because segmentResults exists. Force-close resume storage
currently restores the timer/config/route, not a segment execution checkpoint.
That lifecycle must be completed (or the feedback withheld) before exposing
rep comparisons. Unknown continuity returns unavailable. Ordinary in-memory
pause/resume is covered; crash/reload restoration is not claimed fixed.

No versioned programme/profile shape changed. Segment-result additions are
optional on old documents; legacy records are not retroactively upgraded into
reliable evidence.

## Verification performed in this continuation

47 pure-logic test cases passed locally. Because a full checkout/dependency
installation could not be obtained (GitHub hostname resolution failed in the
local shell), these were TypeScript-transpiled test bodies executed through
Node's test runner with strict-assert equivalents of the Vitest matchers used.
This is not a claim that local Vitest, React or npm run verify passed.

Five local mutations were independently detected: remove unchanged-tick
identity (2 failures), drop partial evidence (4), turn skip into completion
(6), accept unknown continuity (1), accept patchy GPS for pace comparison (3).
All mutations were reverted and the pure tests rerun.

The repository tests include three additional real React integration cases:
Strict Mode updater replay, settling the page's player-dependent effect, and
partial evidence becoming a terminal record without duplication. These need
actual repository CI; they were not run in the local Node assertion harness.
Full typecheck, build, existing tests and emulator verification remain release
gates. No checks or thresholds were relaxed, and no deployment is claimed.
