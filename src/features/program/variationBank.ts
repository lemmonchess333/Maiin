import type { MovementCategory } from "./programTypes";
import {
  allowsComplexity,
  type Experience,
  type MovementComplexity,
} from "./experienceModel";

/* ================================
   EXERCISE BANK BY MOVEMENT CATEGORY
   Maps movement categories to exercise IDs from src/lib/exercises.ts
================================ */

interface ExerciseOption {
  id: string;
  name: string;
  primary: boolean;
  /**
   * Trains the target muscle at a LONG muscle length (deep stretch under load) —
   * more hypertrophy per set (Maeo 2021/2023; Pedrosa 2022). Accessory
   * selection biases toward these (D-LIFT-2). Mains stay the canonical
   * compound (the progression anchor) regardless.
   */
  lengthened?: boolean;
  /**
   * What job this variation does when it replaces the category's main
   * (training-book backlog #11 — B6). Three sources categorise by ROLE
   * rather than by muscle: Hayes splits "exercises that teach me how to
   * lift" from brute-strength ones, Jenkins frames non-competition lifts as
   * "tools in the arsenal", and Green assigns each bench variant an explicit
   * job (paused = technique, wide-grip paused = bottom range, slingshot =
   * lockout, incline/OHP = size and base).
   *
   *   technique  — reinforces position and control; improves the parent lift
   *   weak_point — targets a sticking point (bottom range or lockout)
   *   size       — hypertrophy and base building
   *
   * Absent on the category primary, which is the lift being substituted FOR.
   */
  role?: "technique" | "weak_point" | "size";
  /**
   * Working weight relative to the category's PRIMARY lift, used to seed a
   * cold-start load (`startingWeightForExercise`). Absent = 1 (loads like the
   * primary).
   *
   * Added 2026-07-28 after an audit measured the cost of not having it: the
   * seed table is per-CATEGORY, so every variation inherited the compound's
   * number. A Romanian deadlift, a hip thrust and a leg curl are all
   * `hip_dominant`, and a beginner was handed the deadlift's 68 kg on all
   * three. That was tolerable while the builders only ever emitted the
   * primary; it stopped being tolerable once #10's overlap caps started
   * re-pointing slots to variations.
   *
   * These are conservative working-weight ratios, deliberately erring light —
   * the module's existing stance is that a light start self-corrects in a
   * session or two whereas a heavy one costs a failed first workout.
   */
  loadFactor?: number;
  /**
   * How much technique the movement demands (`experienceModel.ts`). Absent =
   * `simple`. Gates which VARIATIONS a lifter is offered — a category primary
   * is always allowed regardless, because it is the lift the programme is
   * built around and the one the form content covers most thoroughly.
   */
  complexity?: MovementComplexity;
}

export const exerciseBank: Record<MovementCategory, ExerciseOption[]> = {
  horizontal_push: [
    { id: "bench-press", name: "Bench Press", primary: true },
    {
      id: "incline-bench",
      loadFactor: 0.8,
      name: "Incline Bench Press",
      primary: false,
      role: "size",
    },
    {
      id: "db-bench",
      loadFactor: 0.35,
      name: "Dumbbell Bench Press",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "incline-db-press",
      loadFactor: 0.3,
      name: "Incline Dumbbell Press",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "close-grip-bench",
      complexity: "technical",
      loadFactor: 0.8,
      name: "Close Grip Bench Press",
      primary: false,
      role: "weak_point",
    },
    {
      id: "barbell-floor-press",
      loadFactor: 0.85,
      name: "Barbell Floor Press",
      primary: false,
      complexity: "advanced",
      role: "weak_point",
    },
  ],
  vertical_push: [
    { id: "overhead-press", name: "Overhead Press", primary: true },
    {
      id: "db-shoulder-press",
      loadFactor: 0.35,
      name: "Dumbbell Shoulder Press",
      primary: false,
      role: "size",
    },
    {
      id: "arnold-press",
      complexity: "technical",
      loadFactor: 0.3,
      name: "Arnold Press",
      primary: false,
      role: "size",
    },
    {
      id: "landmine-press",
      complexity: "technical",
      loadFactor: 0.5,
      name: "Landmine Press",
      primary: false,
      role: "technique",
    },
  ],
  horizontal_pull: [
    { id: "barbell-row", name: "Barbell Row", primary: true },
    {
      id: "db-row",
      loadFactor: 0.4,
      name: "Dumbbell Row",
      primary: false,
      role: "size",
    },
    {
      id: "t-bar-row",
      loadFactor: 0.8,
      name: "T-Bar Row",
      primary: false,
      role: "size",
    },
    {
      id: "seated-row",
      loadFactor: 0.9,
      name: "Seated Cable Row",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "chest-supported-db-row",
      complexity: "technical",
      loadFactor: 0.35,
      name: "Chest-Supported DB Row",
      primary: false,
      lengthened: true,
      role: "technique",
    },
    // ADVANCED (2026-07-28). Already in the catalog, never reachable from the
    // bank — the PR that added exercise ROLES noted these were "the natural
    // weak_point entries later". Later is now: they are what "experienced
    // lifters get access to all this other stuff" means concretely, and they
    // are gated so a novice never meets them.
    {
      id: "pendlay-row",
      loadFactor: 0.85,
      name: "Pendlay Row",
      primary: false,
      complexity: "advanced",
      role: "technique",
    },
  ],
  vertical_pull: [
    { id: "pull-ups", name: "Pull-Ups", primary: true },
    {
      id: "lat-pulldown",
      loadFactor: 0.6,
      name: "Lat Pulldown",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "chin-ups",
      loadFactor: 0,
      name: "Chin-Ups",
      primary: false,
      role: "size",
    },
    {
      id: "single-arm-lat-pulldown",
      complexity: "technical",
      loadFactor: 0.25,
      name: "Single-Arm Lat Pulldown",
      primary: false,
      lengthened: true,
      role: "technique",
    },
  ],
  knee_dominant: [
    { id: "squat", name: "Barbell Squat", primary: true },
    {
      id: "front-squat",
      complexity: "technical",
      loadFactor: 0.75,
      name: "Front Squat",
      primary: false,
      role: "technique",
    },
    {
      id: "leg-press",
      loadFactor: 1.6,
      name: "Leg Press",
      primary: false,
      role: "size",
    },
    {
      id: "hack-squat",
      loadFactor: 0.9,
      name: "Hack Squat",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "bulgarian-split",
      complexity: "technical",
      loadFactor: 0.25,
      name: "Bulgarian Split Squat",
      primary: false,
      lengthened: true,
      role: "technique",
    },
  ],
  hip_dominant: [
    { id: "deadlift", name: "Deadlift", primary: true },
    {
      id: "romanian-deadlift",
      complexity: "technical",
      loadFactor: 0.65,
      name: "Romanian Deadlift",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "hip-thrust",
      loadFactor: 0.9,
      name: "Hip Thrust",
      primary: false,
      role: "size",
    },
    {
      id: "sumo-deadlift",
      complexity: "technical",
      loadFactor: 0.95,
      name: "Sumo Deadlift",
      primary: false,
      role: "technique",
    },
    {
      id: "trap-bar-deadlift",
      complexity: "technical",
      loadFactor: 1.0,
      name: "Trap Bar Deadlift",
      primary: false,
      role: "technique",
    },
    // The only HAMSTRING-primary option in the whole bank, and the only hinge
    // with no spinal load at all. Added 2026-07-28: an audit measured the
    // 4-day and 6-day builds losing HALF their hamstring volume once #10's
    // per-session hinge cap demoted the Romanian deadlift, because there was
    // nothing back-sparing in the category to demote it TO — the cap had to
    // leave the category entirely. It also gives `balanceWeeklyVolume` an
    // accessory it can grow for hamstrings, which it previously never had.
    {
      id: "seated-leg-curl",
      loadFactor: 0.25,
      name: "Seated Leg Curl",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "rack-pull",
      loadFactor: 1.15,
      name: "Rack Pull",
      primary: false,
      complexity: "advanced",
      role: "weak_point",
    },
  ],
  arms_biceps: [
    { id: "barbell-curl", name: "Barbell Curl", primary: true },
    {
      id: "db-curl",
      loadFactor: 0.4,
      name: "Dumbbell Curl",
      primary: false,
      role: "size",
    },
    {
      id: "hammer-curl",
      loadFactor: 0.4,
      name: "Hammer Curl",
      primary: false,
      role: "size",
    },
    {
      id: "preacher-curl",
      loadFactor: 0.7,
      name: "Preacher Curl",
      primary: false,
      role: "size",
    },
    {
      id: "cable-curl",
      loadFactor: 0.8,
      name: "Cable Curl",
      primary: false,
      lengthened: true,
      role: "size",
    },
  ],
  arms_triceps: [
    { id: "rope-tricep-pushdown", name: "Rope Tricep Pushdown", primary: true },
    {
      id: "skull-crushers",
      complexity: "technical",
      loadFactor: 0.6,
      name: "Skull Crushers",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "overhead-extension",
      loadFactor: 0.6,
      name: "Overhead Tricep Extension",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "tricep-dips",
      complexity: "technical",
      loadFactor: 0,
      name: "Tricep Dips",
      primary: false,
      role: "size",
    },
  ],
  core: [
    { id: "cable-crunch", name: "Cable Crunch", primary: true },
    {
      id: "leg-raise",
      loadFactor: 0,
      name: "Hanging Leg Raise",
      primary: false,
      role: "size",
    },
    {
      id: "ab-wheel",
      complexity: "technical",
      loadFactor: 0,
      name: "Ab Wheel Rollout",
      primary: false,
      role: "size",
    },
    {
      id: "pallof-press",
      complexity: "technical",
      loadFactor: 0.5,
      name: "Pallof Press",
      primary: false,
      role: "technique",
    },
    {
      id: "russian-twist",
      complexity: "technical",
      loadFactor: 0.3,
      name: "Russian Twist",
      primary: false,
      role: "size",
    },
  ],
};

/**
 * Working weight of a variation relative to its category's primary lift.
 *
 * Unknown ids return 1 — that is exactly today's behaviour (the seed table is
 * per-category), so an exercise arriving from outside the bank (an injury or
 * equipment substitution) is no worse off than before.
 */
export function loadFactorFor(
  exerciseId: string | undefined,
  category: MovementCategory
): number {
  if (!exerciseId) return 1;
  const opt = (exerciseBank[category] ?? []).find((o) => o.id === exerciseId);
  return opt?.loadFactor ?? 1;
}

/**
 * Pick the primary exercise for a movement category,
 * or rotate to a different variation if plateaued.
 */
export function pickExercise(
  category: MovementCategory,
  plateauCount: number,
  currentExerciseId?: string,
  experience?: Experience
): { id: string; name: string } {
  // The category PRIMARY is always allowed — it is the lift the programme is
  // built around and the one the form content covers most thoroughly. What
  // experience gates is which VARIATIONS a lifter is offered instead of it.
  const options = exerciseBank[category].filter(
    (e) => e.primary || allowsComplexity(experience, e.complexity)
  );

  // No plateau — return primary or current
  if (plateauCount < 3) {
    if (currentExerciseId) {
      const current = options.find((e) => e.id === currentExerciseId);
      if (current) return { id: current.id, name: current.name };
    }
    const primary = options.find((e) => e.primary) ?? options[0];
    return { id: primary.id, name: primary.name };
  }

  // Plateau >= 3 — rotate to a PURPOSEFUL variation (backlog #11 — P4/B6/N5).
  //
  // This was `others[Math.floor(Math.random() * others.length)]`, which had
  // two problems. It picked an arbitrary sibling, when three sources say the
  // substitute should have a job (B6); and being random, it re-rolled on
  // every regenerate, so a plateaued main churned to a different exercise
  // each time the user changed a setting. Nippard (N5) is the third argument:
  // changing exercises flattens the progression curve, so when you DO change,
  // change to something that improves the parent lift.
  //
  // Ranked, deterministic, tie-broken by bank order. Technique first —
  // Hayes's "exercises that teach me how to lift", and a stall is more often
  // a position problem than a missing sticking-point. `weak_point` moves
  // ahead of it once the user can say WHERE the lift fails, which is the
  // other half of P4 and needs a UI question this doesn't have yet.
  const others = options.filter((e) => e.id !== currentExerciseId);
  if (others.length === 0) return { id: options[0].id, name: options[0].name };
  const rank = (o: ExerciseOption) =>
    o.role === "technique" ? 0 : o.role === "weak_point" ? 1 : 2;
  let pick = others[0];
  for (const o of others.slice(1)) {
    if (rank(o) < rank(pick)) pick = o;
  }
  return { id: pick.id, name: pick.name };
}

/**
 * Pick an accessory (non-primary) exercise. Biases toward LENGTHENED-position
 * options when the category has any (D-LIFT-2) — accessories are
 * isolation/hypertrophy work, where training at long muscle length yields more
 * growth per set. Falls back to the full non-primary pool when none are tagged.
 *
 * DETERMINISTIC as of 2026-07-28. This was
 * `pool[Math.floor(Math.random() * pool.length)]`, and it made the whole
 * generator nondeterministic: twelve `generateProgram` calls with byte-identical
 * inputs produced EIGHT different programmes. That is the same defect backlog
 * #11 already fixed one function up in this file (`pickExercise`'s plateau
 * rotation), for the same reasons, and it was left here:
 *
 *   - Nippard (N5): changing exercises flattens the progression curve.
 *     Novelty belongs at block boundaries, which is what
 *     `rotateUntrainedAccessories` is for — not at every build.
 *   - A regenerate is what a settings change triggers. Before any history
 *     exists to carry, changing days-per-week re-rolled the user's accessories
 *     into different exercises for no reason they could see.
 *   - Every claim in this arc about the pipeline being deterministic (#10,
 *     #11, #17) was false while this stood, and every measurement taken
 *     against generated output was a sample rather than a fact.
 *
 * Variety across the week is not lost: `dedupeDayExercises` removes in-day
 * duplicates, `capRepeatedLifts` re-points anything appearing more than twice,
 * and `excludeId` keeps an accessory off its own category primary.
 *
 * `experience` gates the pool by movement COMPLEXITY (`experienceModel.ts`) —
 * a novice is not handed a Bulgarian split squat as their leg accessory.
 */
export function pickAccessory(
  category: MovementCategory,
  excludeId?: string,
  experience?: Experience
): { id: string; name: string } {
  const eligible = exerciseBank[category].filter(
    (e) => !e.primary && e.id !== excludeId
  );
  // Experience gates the pool, but never empties it: a level with nothing
  // left falls back to the full non-primary list rather than returning the
  // category primary, which would duplicate the day's main lift.
  const allowed = eligible.filter((e) =>
    allowsComplexity(experience, e.complexity)
  );
  const options = allowed.length > 0 ? allowed : eligible;
  const lengthened = options.filter((e) => e.lengthened);
  const pool = lengthened.length > 0 ? lengthened : options;
  const pick = pool[0] ?? exerciseBank[category][0];
  return { id: pick.id, name: pick.name };
}
