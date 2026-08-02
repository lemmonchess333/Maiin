---
Status: accepted
---

# The programme command boundary stops at the week engine

## Context

`users/{uid}/programState/current` was a last-write-wins document. Every writer
in `useProgram.ts` and `Program.tsx` rebuilt a whole `ProgramState` from a
possibly-stale React closure and `setDocGuarded`'d it back, so two devices, two
tabs, or a server reconciliation sweep could silently clobber one another.

P6 of `docs/proposals/lifting-v8-evaluation.md` set out to fix that by routing
every writer through `applyProgramCommand` — a validated command union applied
by one server transaction that dedupes on `commandId`.

**32 call sites at the start; 24 migrated; 8 remain.** The migration was worth
doing on its own evidence: it turned up a client-only race guard the server
lacked, a missing `restoreRunDay` transition, an absent easing-block hold in
`logExercise`, a `raceGoal: null` the profile sanitizer silently dropped, and —
the largest — seven already-migrated writers whose commands the validator
rejected on **every** call, because no client-side way to build the
`WorkoutDayPrecondition` existed. All were found by checking each reducer
against its client for equivalence before migrating, never by assuming the
command kinds matched the behaviour.

The remaining 8 are not more of the same work. Six of them route through
`advanceWeek` or the run scheduler, and both are engines rather than writers.

## Decision

**Stop the boundary at 24 writers. The remaining 8 sites stay document
writes, deliberately, and are recorded as such rather than left looking
unfinished.**

The blocking measurement, taken 2026-08-02 rather than estimated:
`advanceWeek`'s dependency closure is **12 of 16 helpers unmirrored**, and two
of them are data tables `functions/` has no form of at all.

- `musclesAtMrv` → `recoveryTrigger` → `volumeModel` → `muscleTaxonomy`, and
  then **per-exercise muscle attributions for ~300 exercises**. The server's
  `exerciseCatalog.js` is id → name only; no muscle data exists anywhere under
  `functions/`.
- `rotateUntrainedAccessories` → the **variation bank** (719 lines of variation
  data) plus experience gating.
- Plus `generateWeekPrescription`, `computeFatigueScore`,
  `countPlateauedExercises`, `resolveAdjustment`, `applyFatigue`,
  `applyAdjustment`, `dedupeDayExercises`.

Roughly 1,500–2,000 lines across 5–6 new modules, each needing a cross-test,
and **two new hand-maintained data mirrors that must change in lockstep with an
actively-edited catalogue**. That is the same standing maintenance cost that
already got the `startingLoads.ts` mirror declined once, at a larger scale.

## Considered options

- **Mirror the cheap parts, let the server skip recovery-detection and
  accessory rotation.** Rejected outright. The server's week would then differ
  from the client's, silently, on two axes — precisely the
  tested-copy-vs-running-copy failure every cross-test in this arc exists to
  prevent, and worse than not mirroring at all because it would _look_ pinned.

- **Move week rollover to a scheduled Cloud Function** (the PR-L precedent for
  calendar-driven `useEffect` transitions). Rejected as a way out: it changes
  who _triggers_ `advanceWeek`, not where the engine has to live. The scheduled
  function needs the identical closure. It remains a reasonable idea on its own
  merits, and is orthogonal to this ADR.

- **Do the full port.** Not rejected on difficulty — rejected on cost/benefit
  at this point in the arc. See below.

## Consequences

**What the boundary already bought.** The 24 migrated writers cover every
high-frequency and high-clobber-risk path: logging a set, completing a day,
skipping and restoring, every exercise mutation, the run-day cluster, settings,
deload, the recovery exit and the training-block lifecycle. These are the
writes a user issues many times a week, from a phone that may be offline, and
they are now idempotent, replayable and server-authoritative.

**What stays exposed.** The 8 remaining sites are low-frequency and mostly
non-concurrent: a week rollover fires once a week on app open, a plan
regeneration is a deliberate settings action, a race realign follows an
explicit prompt. Last-write-wins on those is a real but small window, and it is
the same window the app has always had.

**One site is not a gap at all.** `reorderDayExercises`' rejection fallback
writes directly on purpose: a legacy document whose `instanceId`s were never
persisted needs a write that both honours the reorder and persists the ids, so
the next one goes through the boundary. It self-heals in one use.

**Two are the wrong shape for a client command.** `regenerateProgram` and
`refreshRunSchedule` rebuild the plan from the generator. Those are
`configurePlan`-shaped — a private server transition with its own plan
validation — and giving them a public command kind would put whole-plan
authorship on the client command surface, which `replaceProgramme` is private
specifically to avoid.

**Revisit when there is evidence, not on principle.** The trigger for
finishing this is an observed clobber, or the exercise-muscle data needing to
exist server-side for an unrelated reason (a server-side volume or analytics
feature would pay for that mirror on its own, at which point the marginal cost
of the week engine drops sharply). Until then, a completed boundary is not
worth doubling the exercise-data maintenance surface.

**Do not "finish P6" as a tidiness exercise.** An agent reading
`docs/proposals/lifting-v8-evaluation.md` will see P6 listed with 8 sites
outstanding and may read that as unfinished work. It is not: the stopping point
is this decision, and §8.6 of that document carries the per-site triage.
