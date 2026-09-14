/**
 * Plate-Club badge rule, client copy — so the seal can crack the moment the
 * workout saves instead of after a Cloud Function round-trip.
 *
 * The server awards these too: `onWorkoutCreated` →
 * `functions/lib/badgeRules.js` `liftWeightMilestoneBadges(doc.exercises)`.
 * That path stays authoritative and idempotent; this one only lets the
 * client award the same ids first. Both writes go through a transaction on
 * `streaks/data`, so whichever lands second sees `earnedAt` set and no-ops.
 *
 * TWO COPIES OF ONE RULE is this repo's #1 recurring mistake, so this file
 * is pinned to the server module the way ADR-0008 asks — against the
 * RUNNING copy, not prose: `liftWeightMilestones.cross.test.ts` loads
 * `functions/lib/badgeRules.js` and `functions/lib/workoutSetRecord.js`
 * via createRequire and asserts the id list, the thresholds, the predicate
 * over a fixture matrix, and the set projection are identical. Change a
 * threshold or add a compound lift on either side and that test is red
 * until the other side matches.
 */

/** Compound lifts whose heaviest set counts. Mirrors COMPOUND_LIFT_IDS in
 *  functions/lib/badgeRules.js (pinned by the cross-test). */
export const COMPOUND_LIFT_IDS: ReadonlySet<string> = new Set([
  // Press (horizontal)
  "bench-press",
  "incline-bench",
  "decline-bench",
  "barbell-floor-press",
  "close-grip-bench",
  // Pull (hinge / row)
  "deadlift",
  "sumo-deadlift",
  "trap-bar-deadlift",
  "rack-pull",
  "romanian-deadlift",
  "barbell-row",
  "pendlay-row",
  "t-bar-row",
  "meadows-row",
  // Press (vertical)
  "overhead-press",
  "landmine-press",
  // Squat / hip
  "squat",
  "front-squat",
  "zercher-squat",
  "landmine-squat",
  "hip-thrust",
  "barbell-step-ups",
  // Full-body
  "clean-and-press",
  "thrusters",
]);

/** Heaviest-set thresholds in kg, ascending. Mirrors LIFT_WEIGHT_MILESTONES. */
export const LIFT_WEIGHT_MILESTONES: readonly { id: string; minKg: number }[] =
  [
    { id: "plate_club", minKg: 60 },
    { id: "two_plate", minKg: 100 },
    { id: "three_plate", minKg: 140 },
  ];

export interface BadgeExerciseInput {
  exerciseId?: string;
  sets?: readonly { weightKg?: number }[];
}

/**
 * The Plate-Club badge ids a single workout qualifies for: every tier the
 * heaviest COMPOUND set clears. Same input shape the server reads off the
 * saved doc (`{ exerciseId, sets: [{ weightKg }] }`); same tolerance of
 * missing / malformed input (returns []).
 */
export function liftWeightMilestoneBadges(
  exercises: readonly BadgeExerciseInput[] | null | undefined
): string[] {
  if (!Array.isArray(exercises)) return [];
  let maxKg = 0;
  for (const ex of exercises) {
    if (
      !ex ||
      !COMPOUND_LIFT_IDS.has(ex.exerciseId ?? "") ||
      !Array.isArray(ex.sets)
    )
      continue;
    for (const set of ex.sets) {
      const w = Number(set && set.weightKg) || 0;
      if (w > maxKg) maxKg = w;
    }
  }
  return LIFT_WEIGHT_MILESTONES.filter((m) => maxKg >= m.minKg).map(
    (m) => m.id
  );
}

/**
 * Project a live session's logs into the shape the SERVER will evaluate.
 *
 * The client never writes the workout doc itself — the completion command
 * carries `setLogs`, and the server builds `exercises[i].sets` from
 * `setLogs[i]` positionally via `projectWorkoutSets` in
 * functions/lib/workoutSetRecord.js: completed logs only, `weightKg` taken
 * from `weight` with no unit conversion. This reproduces exactly that for
 * the fields the badge rule reads, so the client is scoring the same sets
 * the server will (pinned by the cross-test).
 *
 * `logs` is what the session hands the command — i.e. AFTER
 * `toCompletionSetLogs` has stripped warm-ups — so warm-ups are already
 * gone by the time this runs, on both sides.
 *
 * Deliberately narrower than the server in one respect: when an exercise
 * has NO log array at all, `projectWorkoutSets` falls back to the planned
 * sets at the planned weight (a day marked done without a session). A live
 * session always has a log array per exercise, so that branch is
 * unreachable here; if it ever were reached this returns no sets — an
 * under-award the server still repairs, never an over-award.
 */
export function exercisesForLiftBadges(
  exercises: readonly { exerciseId: string }[],
  logs: readonly (readonly { weight: number; completed: boolean }[])[]
): BadgeExerciseInput[] {
  return exercises.map((ex, i) => ({
    exerciseId: ex.exerciseId,
    sets: (logs[i] ?? [])
      .filter((l) => l.completed)
      .map((l) => ({ weightKg: l.weight })),
  }));
}
