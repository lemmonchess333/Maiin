---
Status: accepted
---

# Mirror parity must pin the RUNNING copy: reachability over prose, and non-mirrors classified

## Context

Tropos maintains hand-written TS↔JS _equality mirrors_ between `src/` and
`functions/` (`perfScoring`, `runModeResolution`, `runEligibility`,
`validatePlanPayload`, `challengeTiers`, `partnerStreakEngine`). CLAUDE.md
names the failure they defend against as the project's #1 recurring mistake:
**"the tested copy does not prove the running copy."** The defence is a
`*.cross.test` per mirror plus `mirrorCrossTestGate.test.ts`, which greps
`functions/*.js` for mirror-declaring prose and fails CI if a flagged module
isn't pinned or consciously classified.

A 2026-07-11 `/improve-codebase-architecture` audit found the defence had a
hole large enough to drive the original bug through.

### What was actually shipped

`functions/lib/scheduledRunCompletion.js` — a 352-line server port of the
client's run-completion rule — was covered by **two** suites: a 510-line unit
test (`functions/__tests__/scheduledRunCompletion.test.js`) and an equality
cross-test (`src/lib/__tests__/scheduledRunCompletion.cross.test.ts`). It was
`require`d by **nothing**.

The rule that actually ran was a **third** implementation, inlined in
`functions/index.js` (`RACE_STRICT_DISTANCE_RATIO_FNS`,
`PLANNED_RACE_DISTANCE_METERS_FNS`, `_hasStrictRaceMatch`) and re-derived a
**fourth** time inside `_decideRecoveryEntry`. Neither was pinned by anything.

Worse, the pinned port could never have replaced it. The client rule reads
`saved.templateId` and works because `useClaimMap` **normalises** each
Firestore row into a `SavedRunLike`. The server has no such adapter: raw docs
carry `actualTemplateId` (what `RunSummary` writes). Wiring the pinned port in
would have matched nothing and read **every race as a no-show**. The
cross-test never caught this because its fixtures were written in the
normalised shape only the client produces.

So: green CI, two test suites, a parity pin — and zero protection on the
running code.

### The second finding: they aren't the same rule anyway

- **Client** asks _"is this plan slot complete?"_ — over a normalised
  `SavedRunLike`, resolved through a **claim map** (which run this runDay
  claimed).
- **Server** asks _"was this race actually run?"_ — over **raw docs**, as a
  date-scoped **ANY** question.

They disagree by construction: with two race-templated runs on one date, the
client resolves whichever the slot claimed; the server accepts either. An
equality pin between them is wrong in exactly the way an equality pin on
`dateUtils.js` (UTC server / local client) would be wrong.

## Decision

**1. Classify server race-day completion as a deliberate non-mirror.** The
running rule is extracted to `functions/lib/raceDayCompletion.js`, pinned by
**golden fixtures written in the raw-doc shape**
(`functions/__tests__/raceDayCompletion.test.js`), and registered in the
gate's `NOT_EQUALITY_MIRROR` with the reason. The dead port, its unit suite
and its cross-test are deleted. The live client module is untouched.

**2. The gate keys on reachability, not prose.** A domain module under
`src/lib`, `src/features` or `functions/lib` must be referenced by at least
one non-test source file, or carry a marker. Detection is a shallow
specifier scan, not a transitive graph — that is precisely what surfaced
every instance here, it needs no build step, and the cases it misses (code
reachable only from other dead code) would need special-casing in a graph
walk anyway.

**3. Two markers, because "test-only" has two honest meanings.**

| Marker               | Meaning                                                                                                                                                                       | Expiry                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `@oracle`            | test-only **by design, permanently** — a declaration or reference implementation whose job is to be read by a parity test (`profileFieldRegistry.ts`, `pathFilterMatcher.js`) | none; no follow-up owed          |
| `@unwired: <reason>` | written **ahead of its wiring**; debt. Reason is mandatory and enforced by the gate                                                                                           | owed work, including "delete me" |

Anything genuinely orphaned should be **deleted, not annotated**. Collapsing
these into one marker would let rot hide behind a legitimate annotation
forever, which is the same class of mistake as the dead port.

**4. `src/lib/performanceEngine.ts` stays as a reference implementation.** Its
scoring core (`scorePerformance`, `computePerformanceIndex`, `computeBaseline`,
`computeLoadBand`, `shouldRecommendDeload`) has **zero** production consumers —
the PI users see is read straight off Firestore by `usePerformance`. It is kept
deliberately: a readable TS reference whose interface _is_ its test surface,
pinning the server copy that does run. `CONTEXT.md` previously claimed it
"drives Home/analytics previews", which was false; that is corrected.

## Considered options

- **Wire the pinned port in and delete the inline rule.** Rejected: it reads a
  field raw docs don't have, so it is not a refactor — it would silently break
  race-day detection. Making it work needs a server-side normalisation adapter
  the server doesn't have and doesn't need for a question the client isn't
  asking.
- **Delete the dead port and leave the running rule inline.** Rejected: the
  cheapest option, but leaves a correctness-critical rule unpinned and
  duplicated across two derivations in one file.
- **Hard-fail reachability with no escape hatch.** Rejected: the repo
  deliberately lands modules ahead of their wiring (`raceRunDaysReconcile.ts`
  is emulator-gated by design), so a hard fail would fight an intentional
  practice and get worked around.
- **Report-only warning.** Rejected: this drift class is exactly what silent
  warnings don't fix — the `colorUtils.ts` header had already self-flagged
  "no production consumer" and nothing happened. (Epilogue, 2026-07-25: the
  gate did what the warning couldn't — `colorUtils.ts` and
  `getBestSetSummary.ts` were both deleted once the marker scoping made
  them visible. Deleted files, so this is the last mention of either.)
- **One `@unwired` marker with a mandatory reason.** Rejected: the gate then
  can't mechanically separate "fine forever" from "someone owes this", so
  nothing ever expires.

## Consequences

- Every future cross-test is only as good as the reachability of what it
  pins; the gate now says so in CI.
- Nine modules were surfaced as unreachable and marked (2 `@oracle`,
  7 `@unwired:`). Four of the seven are orphan candidates whose owed work is
  deletion; they are triaged separately rather than in this change.
- **Known limitation — the check is module-level, not symbol-level.** A live
  module with a dead core is invisible to it: `performanceEngine.ts` is
  reachable (production imports `getWeekKey`) while ~430 of its 501 lines are
  oracle-only. That case is handled by documentation (decision 4), not by the
  gate. A symbol-level check would need real type information; not worth it
  today.
- Unifying the two inline derivations resolved one behavioural disagreement
  between them (race-templated run with a non-numeric `distance` and a zero
  planned distance). The stricter reading was taken; the divergence is
  unreachable in production because `raceGoal.distance` is a closed enum.
  Recorded in the module header rather than resolved silently.
