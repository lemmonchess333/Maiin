---
Status: accepted
---

# Deleting a logged session reverses accumulators, not history

## Context

A user cannot delete a mis-logged workout or run. Meals are deletable —
`deleteMeal` is wired into `Food.tsx` at two call sites. `useWorkouts.deleteWorkout`
exists, is the only code path that deletes a workout, and is wired to nothing.
Runs have no delete path at all, not even a function. So a phone-in-pocket
accidental long "run" inflates the user's record permanently.

The reason it was never wired is real rather than an oversight.
`onWorkoutCreated` and `onRunCreated` are `onCreate` ONLY — there is no
`onDelete` anywhere in `functions/` — and the state they write is guarded by
markers that outlive the source document:

- challenge progress: `participants/{uid}/applied/{markerId}`, written in the
  same transaction as the `currentValue` increment
- lifetime totals: `users/{uid}/lifetime/applied_<kind>_<sourceId>`

Deleting the source doc fires nothing and leaves both accumulators standing.
The log shrinks; the derived values do not. That is the same shape as the
NUTR-EV family (a calorie target moved and its derived values did not), and it
is why "just add a delete button" would ship a known-wrong behaviour.

**Neither marker records the amount it applied.** The lifetime marker is
`{ kind, sourceId, appliedAt }`; the challenge marker is keyed for identity and
carries no delta. So a reversal cannot read back what was added — it has to
re-derive it. That is the fact that makes this an architecture decision rather
than a ticket.

## Decision

Delete is offered, and the four pieces of derived state get three different
answers, because they are three different kinds of thing.

**1. Performance Index — nothing to do.** `computeAndWritePerformanceForUser`
recomputes the index from the user's workouts and runs over a window. It is a
projection of the source data, not an accumulator, so it self-heals on the next
recompute (the next session, or `dailyPerformanceRefresh`). Do not write
reversal logic for it; there is nothing to reverse.

**2. Challenge progress and 3. lifetime totals — reverse on `onDelete`.**
Both are accumulators with a per-source marker. The `onDelete` trigger receives
the deleted document, so the contribution is recoverable by re-deriving it from
that snapshot. The trigger decrements by the re-derived amount and deletes the
marker, which also restores the correct behaviour if the user re-logs.

**The reversal MUST call the same function that computed the accrual, not a
copy of it.** This is the load-bearing constraint. Re-derivation is only exact
while the two agree, and a second implementation of "what did this run
contribute?" is precisely the drift this codebase pays for most often — the
mirror-parity rule, one level up. If a future change makes the accrual formula
unavailable to the delete path, store the delta on the marker instead and read
it back; do not re-implement the formula.

**4. Partner streaks — do not reverse.** `applyPartnerActivity(firestore, uid,
localDay)` takes a DAY, not a session. A shared day is a fact about a day, and
it stays true if the user logged two sessions and deleted one. Reversal would
have to ask "is any other qualifying activity left on this date?" — a query,
not a decrement — and the streak is a run of consecutive shared days, so
removing one from the middle splits it rather than decrementing it. A streak is
history, and deleting a mis-log is not a claim that the day did not happen.

**Server before UI.** The reversal ships and is verified before any delete
affordance appears. A delete button in front of an unreversed accumulator is
worse than no button, because the damage is silent and the user has been told
the record is gone.

## Consequences

- Two new `onDelete` triggers, which must carry `TRIGGER_CAP` like every other
  trigger, and must be idempotent: Firestore delivers at-least-once, so a
  re-delivered delete must not decrement twice. The marker is the guard — its
  absence means the reversal already ran.
- Deleting a session can lower a user's standing in a live challenge. That is
  the correct behaviour for a mis-log and the honest one for the leaderboard,
  but it is a visible consequence and the copy should not pretend otherwise.
- Partner streaks and PI will disagree about a deleted session for a while: PI
  drops at the next recompute, the streak never moves. That asymmetry is
  intended and is the point of this ADR.
- `deleteWorkout` stays pinned in `hookSurfaceReachability` until the UI lands.
  It is an unwired seam, not dead code, and the pin records why.
- Runs need a `deleteRun` written; only workouts have the client half today.

## Alternatives rejected

**Accept the drift.** Simplest, and wrong: challenge standing and lifetime
totals are user-visible and competitive. Silently overstating them is the kind
of inaccuracy that erodes trust in every other number the app shows.

**A short undo window instead of delete.** Appealing — most deletes are
seconds after a mis-save — but it does not help. The triggers fire on create,
so even a one-minute window has the same reversal problem. The window would be
a way of hiding the issue rather than solving it.

**Store the delta on the marker now, reverse later.** Rejected as a first step
because it ships a field nothing reads, on the same day this codebase deleted
two of those. It is the right fallback if re-derivation ever becomes
unavailable, and the constraint above says so — but it is not a reason to write
the field ahead of the need.

## Amendment 2026-08-12 — the reversal must not fire during account deletion

Appended rather than folded into the decision above, so the record shows
what the first pass missed.

The account-deletion executor sweeps `workouts` and `runs` (they are in
`USER_SUBCOLLECTIONS`), and it sweeps `lifetime` — the counters AND their
per-source markers — in the same run. So an `onDelete` trigger on those
collections fires once per document during every account deletion, for a
user whose accumulators are being erased alongside them.

Two consequences, the second serious:

1. **Fan-out.** A user with several hundred logged sessions produces that
   many trigger invocations, each opening a transaction, against
   `TRIGGER_CAP`. Deletion is already the slowest operation in the system.

2. **Resurrection.** `accrueLifetimeStat` writes `lifetime/totals` with
   `{ merge: true }`, so a reversal racing the sweep can RE-CREATE a
   document the executor has already deleted, leaving orphaned counters
   under a deleted user. That is the precise failure the swept-collection
   list exists to prevent, and it defeats erasure rather than merely
   making it untidy.

So: **both `onDelete` triggers MUST run the system-writer guard first**,
exactly as `onWorkoutCreated` already does —
`accountDeletionLocks.shouldSystemWriteProceed(...)`, whose own module
header names "onWorkout/onRunCreated triggers" as the case it exists for
and requires the check immediately before each write commit, not only at
function entry.

The guarded behaviour differs from the create side. `onWorkoutCreated`
performs a COMPENSATING DELETE when the guard fails — it removes the doc
that triggered it. On delete there is nothing to compensate: the document
is already gone, and the accumulators are being erased by the sweep. The
correct behaviour is a plain no-op.

This does not change the decision; it is a precondition the decision
assumed and did not state. It also means the reversal cannot be verified
by "delete a workout and watch the counter drop" alone — the account
deletion path needs its own test asserting the reversal does NOT run.

## Amendment 2026-08-12 (b) — what writing it found

Appended, not folded in, for the same reason as the first amendment: the
record should show which parts of the original reasoning survived contact
with the code. Three did not.

**The challenge marker DOES record the amount it applied.** The decision
above rests on "Neither marker records the amount it applied … So a
reversal cannot read back what was added — it has to re-derive it. That
is the fact that makes this an architecture decision rather than a
ticket." Half of it is wrong. `applyChallengeProgressIncrement` writes
`{ metric, incrementBy, activityDateKey, appliedAt }` — `incrementBy` has
been on every challenge marker all along. Only the LIFETIME marker
(`{ kind, sourceId, appliedAt }`) is amountless.

So the challenge reversal reads the applied figure back and never
re-derives anything, which is strictly stronger than the "call the same
function, not a copy" constraint it would otherwise be held to: exact even
if the increment formula changes between the accrual and the delete, and
exact even if the source document changed underneath it.

**Re-derivation is available but not always correct**, which is a
different problem from the one the decision anticipated. It assumed
re-derivation is exact "while the two agree" — i.e. that the only risk is
formula drift. The other input can drift too. Session ids are
deterministic (`programme-{completionId}`, `routine-{completionId}`), so a
resumed programme Finish re-`set`s the SAME workout document. That
overwrite is not a create, so it accrues nothing: the counter holds the
first figure while the document now shows the second, and a reversal
derived from the deleted snapshot subtracts the wrong number.

The alternative the decision rejected — "Store the delta on the marker
now, reverse later" — is therefore adopted for the lifetime marker, on
exactly the terms the decision set for it. It was rejected as a FIRST STEP
because it would have shipped a field nothing reads; it ships here with
its reader in the same change. `accrueLifetimeStat` now stamps
`appliedValue`, and the reversal prefers it.

Residue, stated rather than hidden: every lifetime marker written before
this takes the re-derivation path, so an overwritten pre-existing session
reverses by its latest figure rather than its applied one. Bounded, and
the alternative is a backfill over data with no way to recover the applied
amount.

The derivation itself moved to `functions/lib/lifetimeAccrual.js` and both
sides call it. Note that the constraint the decision names as
load-bearing — "the reversal MUST call the same function that computed the
accrual" — was not satisfiable when it was written: there was no such
function, only inline expressions in the two trigger bodies. Extracting
them is what made the constraint real rather than aspirational.

**`fastest_effort` cannot be reversed, and is not a fourth accumulator.**
The decision treats "challenge progress" as one uniform thing. It is two.
The SUM metrics (`workout_count`, `total_volume`, `total_km`,
`hybrid_score`) decrement cleanly. `fastest_effort` applies through a
separate MIN path, and its marker records the run's own time — never the
best it displaced. Nothing on the delete side knows what to restore;
recovering it would mean re-scanning the user's whole run history against
the challenge's target distance, which is a rebuild, not a reversal.

So it joins partner streaks on the "history, not an accumulator" side of
the line, and for a stronger reason than the streak has: the streak COULD
be recomputed and is deliberately not; this one has no information to
recompute from. Its marker is still deleted, because MIN is idempotent for
the same run — a re-log re-applies the same time and lands on the same
best, whereas a surviving marker would deny a genuine re-log forever.

**Milestone badges are not revoked either**, which the decision does not
mention at all. `awardMilestoneBadges` fires off lifetime totals and off
single-session thresholds (plate club, run distances). A badge is an
achievement that was genuinely reached; un-awarding it on a mis-log delete
is the same category error as breaking a streak. The lifetime total
dropping back below a threshold is harmless — the award is idempotent via
`earnedAt`, so a later re-crossing is a no-op rather than a duplicate.

That makes the final tally four kinds of thing, not three: reverse
(challenge SUM metrics, lifetime totals), recompute (Performance Index),
and leave standing as history (partner streaks, `fastest_effort` bests,
milestone badges).

## Third amendment (2026-08-15) — `fastest_effort` moves from "history" to "rebuild"

The second amendment classified `fastest_effort` as history because a
REVERSAL is impossible: the marker records the run's own time, never the
best it displaced, so the delete side has nothing to restore. That
reasoning stands unchanged. What it accepted as a consequence does not:
delete the mis-logged 12-minute "5K" a GPS glitch produced, and the bogus
time kept your challenge standing forever — the one place a mis-log
delete stayed visibly wrong.

The amendment itself named the honest fix ("re-scanning the user's whole
run history against the challenge's target distance, which is a rebuild,
not a reversal"), and `functions/lib/fastestEffortRebuild.js` is now that
rebuild. The reversal signals it only when the deleted run's
marker-recorded time is at or below the standing best — a slower run
cannot have set a MIN, so ordinary deletes cost nothing extra. The scan
re-derives the true best from surviving runs through the SAME window,
eligibility and target-distance gates as the live apply path and the
join-time backfill (one source of truth), and is a pure
recompute-and-write, so redelivery converges without a marker.

The tally therefore reads: reverse (challenge SUM metrics, lifetime
totals), recompute (Performance Index, and now `fastest_effort` when the
driver is deleted), and leave standing as history (partner streaks,
milestone badges — both still deliberate). The user-facing confirmation
copy needed no change: "your standing in a live challenge can go down"
was already the promise, and this makes it true for the fifth metric.
