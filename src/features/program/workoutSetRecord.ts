/**
 * The persisted per-set record, and the ONE projection that builds it.
 *
 * ── Why this module exists (D2 / handoff 11a) ────────────────────────────
 *
 * Two problems, one seam.
 *
 * **1. The app collected the evidence and deleted it on save.** A logged set
 * carries its RPE (on Helms's exact 6–10 half-point scale) and its set type
 * (working / warmup / dropset / failure). Both reach the localStorage draft.
 * Neither reached Firestore: `toCompletionSetLogs` projected every set to
 * `{weight, reps, completed}`, and the persisted record was three fields —
 * `{setNumber, reps, weightKg}`. `clearDraft()` then removed the local copy.
 * `src/lib/export.ts` has been reading `set.type || "working"` for some time:
 * a reader for a field no writer emitted, so every exported row said
 * "working".
 *
 * **None of it is backfillable.** Every workout document ever written has
 * three fields per set, and `applyProgression` mutates `ex.weight`/`ex.reps`
 * in place after each session, so the prescription-at-time-of-execution is
 * destroyed by the progression itself. Planned-vs-actual cannot be
 * reconstructed after the fact — it has to be captured at write time. Per
 * CLAUDE.md's design-for-the-user-base rule, "no evidence history" is not a
 * pre-launch inconvenience: it is the permanent day-one state of every future
 * user. That is why this ships alone, ahead of anything that reads it.
 *
 * **2. The projection was triplicated.** `useProgram` (programme sessions),
 * `Routine` (saved routines) and `functions/lib/programCommands.js` (the
 * server command path) each carried their own copy of the same
 * filter-then-renumber logic. Widening one and missing another is precisely
 * CLAUDE.md's "the tested copy does not prove the running copy". The server
 * copy is currently latent — the client only sends applyDeloadWeek /
 * revertDeloadWeek over the command boundary — but it is in the frozen
 * command vocabulary, so it is drift-in-waiting rather than dead code.
 * `functions/lib/workoutSetRecord.js` mirrors this file and
 * `workoutSetRecord.cross.test.ts` pins them equal.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────
 *
 * **No consumer.** Nothing in this change reads `rpe`, `type` or the planned
 * pair for any prescription decision. That is what makes it safe to land
 * first, and the point is the clock, not the feature: the evidence starts
 * accruing months before anything can calibrate against it.
 *
 * **No `eligibleForCalibration` predicate yet.** Helms p73 restricts RIR
 * accuracy to lifters who are advanced AND RPE-familiar AND near failure, so
 * a consumer will need that gate — but shipping an uncalled predicate is exactly the
 * written-ahead-of-its-wiring debt the reachability gate in
 * `mirrorCrossTestGate.test.ts` exists to discourage. The
 * *data* needed to answer it ships here (per-set RPE plus session-level
 * provenance); the predicate ships with its caller.
 *
 * **Incomplete sets are still filtered out.** Tempting to keep them — "planned
 * 4, completed 3, failed the third" is exactly the pairing the arc wants — but
 * every downstream reader assumes the array is completed-only:
 * `workoutBurn`'s `completedSetCount`, the volume tallies in `leaderboard`,
 * `personalTrajectory`, `History`, `DayPeekCard`, and the PR scan in
 * `prTracking`. Emitting incomplete sets would silently move calories,
 * tonnage and PRs for every user. The count is captured as
 * `plannedSetCount` on the exercise instead — additive, and no reader moves.
 */

import type { RepUnit } from "./programTypes";

/** How a set was performed. Mirrors `SetType` in the session UI. */
export type PersistedSetType = "working" | "warmup" | "dropset" | "failure";

/** A set as it reaches the projection, straight off the session tracker. */
export interface LoggedSet {
  weight: number;
  reps: number;
  completed: boolean;
  type?: string;
  rpe?: number;
}

/**
 * The persisted per-set record.
 *
 * `plannedReps` / `plannedWeightKg` are the PRESCRIPTION at the moment the set
 * was executed — `exercise.reps` and `exercise.weight` — not the previous
 * session's actuals. That distinction is the whole point: those two fields are
 * exactly what `applyProgression` compares the actual against
 * (`actualReps >= exercise.reps && actualWeight >= exercise.weight`), and
 * exactly what it overwrites immediately afterwards.
 */
export interface PersistedWorkoutSet {
  setNumber: number;
  reps: number;
  weightKg: number;
  type: PersistedSetType;
  rpe?: number;
  plannedReps: number;
  plannedWeightKg: number;
}

/** Session-level provenance for any RPE captured in it.
 *
 *  Session-level rather than per-set because it is constant for the session:
 *  duplicating it onto every set would cost bytes for no information and
 *  invite the copies to disagree. */
export interface RpeProvenance {
  /** Training age at capture time. Helms p139 keeps novices on %1RM rather
   *  than RPE for their first month, and p73 claims accuracy only for
   *  advanced, RPE-familiar lifters near failure — so a consumer must be able
   *  to tell whose number it is holding. */
  experience?: string;
  /** Whether the RPE control was shown by default rather than opted into.
   *  `experienceModel.showsRpeByDefault` gates it to advanced users today. */
  shownByDefault: boolean;
}

const SET_TYPES = new Set<PersistedSetType>([
  "working",
  "warmup",
  "dropset",
  "failure",
]);

function asSetType(t: string | undefined): PersistedSetType {
  return t !== undefined && SET_TYPES.has(t as PersistedSetType)
    ? (t as PersistedSetType)
    : "working";
}

/**
 * Project one exercise's logged sets into the persisted records.
 *
 * `planned` is the prescription the sets were executed against. When no logs
 * exist (a day completed without an active session) the fallback synthesises
 * `plannedSets` records from it, with actual === planned, matching the
 * pre-existing behaviour.
 */
export function projectWorkoutSets(
  logs: readonly LoggedSet[] | undefined,
  planned: {
    sets: number;
    reps: number;
    weightKg: number;
    repUnit?: RepUnit;
  }
): PersistedWorkoutSet[] {
  if (!logs) {
    return Array.from({ length: planned.sets }, (_, i) => ({
      setNumber: i + 1,
      reps: planned.reps,
      weightKg: planned.weightKg,
      type: "working" as const,
      plannedReps: planned.reps,
      plannedWeightKg: planned.weightKg,
    }));
  }
  return logs
    .filter((l) => l.completed)
    .map((l, i) => {
      const out: PersistedWorkoutSet = {
        setNumber: i + 1,
        reps: l.reps,
        weightKg: l.weight,
        type: asSetType(l.type),
        plannedReps: planned.reps,
        plannedWeightKg: planned.weightKg,
      };
      // Omitted rather than written as undefined — Firestore rejects
      // undefined outright, and `stripUndefined` should not have to care.
      if (typeof l.rpe === "number") out.rpe = l.rpe;
      return out;
    });
}
