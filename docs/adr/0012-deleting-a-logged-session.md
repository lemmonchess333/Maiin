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
