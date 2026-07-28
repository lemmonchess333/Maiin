import type { MovementCategory } from "./programTypes";

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
}

export const exerciseBank: Record<MovementCategory, ExerciseOption[]> = {
  horizontal_push: [
    { id: "bench-press", name: "Bench Press", primary: true },
    {
      id: "incline-bench",
      name: "Incline Bench Press",
      primary: false,
      role: "size",
    },
    {
      id: "db-bench",
      name: "Dumbbell Bench Press",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "incline-db-press",
      name: "Incline Dumbbell Press",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "close-grip-bench",
      name: "Close Grip Bench Press",
      primary: false,
      role: "weak_point",
    },
  ],
  vertical_push: [
    { id: "overhead-press", name: "Overhead Press", primary: true },
    {
      id: "db-shoulder-press",
      name: "Dumbbell Shoulder Press",
      primary: false,
      role: "size",
    },
    { id: "arnold-press", name: "Arnold Press", primary: false, role: "size" },
    {
      id: "landmine-press",
      name: "Landmine Press",
      primary: false,
      role: "technique",
    },
  ],
  horizontal_pull: [
    { id: "barbell-row", name: "Barbell Row", primary: true },
    { id: "db-row", name: "Dumbbell Row", primary: false, role: "size" },
    { id: "t-bar-row", name: "T-Bar Row", primary: false, role: "size" },
    {
      id: "seated-row",
      name: "Seated Cable Row",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "chest-supported-db-row",
      name: "Chest-Supported DB Row",
      primary: false,
      lengthened: true,
      role: "technique",
    },
  ],
  vertical_pull: [
    { id: "pull-ups", name: "Pull-Ups", primary: true },
    {
      id: "lat-pulldown",
      name: "Lat Pulldown",
      primary: false,
      lengthened: true,
      role: "size",
    },
    { id: "chin-ups", name: "Chin-Ups", primary: false, role: "size" },
    {
      id: "single-arm-lat-pulldown",
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
      name: "Front Squat",
      primary: false,
      role: "technique",
    },
    { id: "leg-press", name: "Leg Press", primary: false, role: "size" },
    {
      id: "hack-squat",
      name: "Hack Squat",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "bulgarian-split",
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
      name: "Romanian Deadlift",
      primary: false,
      lengthened: true,
      role: "size",
    },
    { id: "hip-thrust", name: "Hip Thrust", primary: false, role: "size" },
    {
      id: "sumo-deadlift",
      name: "Sumo Deadlift",
      primary: false,
      role: "technique",
    },
    {
      id: "trap-bar-deadlift",
      name: "Trap Bar Deadlift",
      primary: false,
      role: "technique",
    },
  ],
  arms_biceps: [
    { id: "barbell-curl", name: "Barbell Curl", primary: true },
    { id: "db-curl", name: "Dumbbell Curl", primary: false, role: "size" },
    { id: "hammer-curl", name: "Hammer Curl", primary: false, role: "size" },
    {
      id: "preacher-curl",
      name: "Preacher Curl",
      primary: false,
      role: "size",
    },
    {
      id: "cable-curl",
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
      name: "Skull Crushers",
      primary: false,
      lengthened: true,
      role: "size",
    },
    {
      id: "overhead-extension",
      name: "Overhead Tricep Extension",
      primary: false,
      lengthened: true,
      role: "size",
    },
    { id: "tricep-dips", name: "Tricep Dips", primary: false, role: "size" },
  ],
  core: [
    { id: "cable-crunch", name: "Cable Crunch", primary: true },
    {
      id: "leg-raise",
      name: "Hanging Leg Raise",
      primary: false,
      role: "size",
    },
    { id: "ab-wheel", name: "Ab Wheel Rollout", primary: false, role: "size" },
    {
      id: "pallof-press",
      name: "Pallof Press",
      primary: false,
      role: "technique",
    },
    {
      id: "russian-twist",
      name: "Russian Twist",
      primary: false,
      role: "size",
    },
  ],
};

/**
 * Pick the primary exercise for a movement category,
 * or rotate to a different variation if plateaued.
 */
export function pickExercise(
  category: MovementCategory,
  plateauCount: number,
  currentExerciseId?: string
): { id: string; name: string } {
  const options = exerciseBank[category];

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
 * Pick an accessory (non-primary) exercise for variety. Biases toward
 * LENGTHENED-position options when the category has any (D-LIFT-2) — accessories
 * are isolation/hypertrophy work, where training at long muscle length yields
 * more growth per set. Falls back to the full non-primary pool when none are
 * tagged, preserving variety.
 */
export function pickAccessory(
  category: MovementCategory,
  excludeId?: string
): { id: string; name: string } {
  const options = exerciseBank[category].filter(
    (e) => !e.primary && e.id !== excludeId
  );
  const lengthened = options.filter((e) => e.lengthened);
  const pool = lengthened.length > 0 ? lengthened : options;
  const pick =
    pool[Math.floor(Math.random() * pool.length)] ?? exerciseBank[category][0];
  return { id: pick.id, name: pick.name };
}
