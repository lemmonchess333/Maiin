import type { MovementCategory } from "./programTypes";

/* ================================
   EXERCISE BANK BY MOVEMENT CATEGORY
   Maps movement categories to exercise IDs from src/lib/exercises.ts
================================ */

interface ExerciseOption {
  id: string;
  name: string;
  primary: boolean;
}

export const exerciseBank: Record<MovementCategory, ExerciseOption[]> = {
  horizontal_push: [
    { id: "bench-press", name: "Bench Press", primary: true },
    { id: "incline-bench", name: "Incline Bench Press", primary: false },
    { id: "db-bench", name: "Dumbbell Bench Press", primary: false },
    { id: "incline-db-press", name: "Incline Dumbbell Press", primary: false },
    { id: "close-grip-bench", name: "Close Grip Bench Press", primary: false },
  ],
  vertical_push: [
    { id: "overhead-press", name: "Overhead Press", primary: true },
    { id: "db-shoulder-press", name: "Dumbbell Shoulder Press", primary: false },
    { id: "arnold-press", name: "Arnold Press", primary: false },
    { id: "landmine-press", name: "Landmine Press", primary: false },
  ],
  horizontal_pull: [
    { id: "barbell-row", name: "Barbell Row", primary: true },
    { id: "db-row", name: "Dumbbell Row", primary: false },
    { id: "t-bar-row", name: "T-Bar Row", primary: false },
    { id: "seated-row", name: "Seated Cable Row", primary: false },
    { id: "chest-supported-db-row", name: "Chest-Supported DB Row", primary: false },
  ],
  vertical_pull: [
    { id: "pull-ups", name: "Pull-Ups", primary: true },
    { id: "lat-pulldown", name: "Lat Pulldown", primary: false },
    { id: "chin-ups", name: "Chin-Ups", primary: false },
    { id: "single-arm-lat-pulldown", name: "Single-Arm Lat Pulldown", primary: false },
  ],
  knee_dominant: [
    { id: "squat", name: "Barbell Squat", primary: true },
    { id: "front-squat", name: "Front Squat", primary: false },
    { id: "leg-press", name: "Leg Press", primary: false },
    { id: "hack-squat", name: "Hack Squat", primary: false },
    { id: "bulgarian-split", name: "Bulgarian Split Squat", primary: false },
  ],
  hip_dominant: [
    { id: "deadlift", name: "Deadlift", primary: true },
    { id: "romanian-deadlift", name: "Romanian Deadlift", primary: false },
    { id: "hip-thrust", name: "Hip Thrust", primary: false },
    { id: "sumo-deadlift", name: "Sumo Deadlift", primary: false },
    { id: "trap-bar-deadlift", name: "Trap Bar Deadlift", primary: false },
  ],
  arms_biceps: [
    { id: "barbell-curl", name: "Barbell Curl", primary: true },
    { id: "db-curl", name: "Dumbbell Curl", primary: false },
    { id: "hammer-curl", name: "Hammer Curl", primary: false },
    { id: "preacher-curl", name: "Preacher Curl", primary: false },
    { id: "cable-curl", name: "Cable Curl", primary: false },
  ],
  arms_triceps: [
    { id: "rope-tricep-pushdown", name: "Rope Tricep Pushdown", primary: true },
    { id: "skull-crushers", name: "Skull Crushers", primary: false },
    { id: "overhead-extension", name: "Overhead Tricep Extension", primary: false },
    { id: "tricep-dips", name: "Tricep Dips", primary: false },
  ],
  core: [
    { id: "cable-crunch", name: "Cable Crunch", primary: true },
    { id: "leg-raise", name: "Hanging Leg Raise", primary: false },
    { id: "ab-wheel", name: "Ab Wheel Rollout", primary: false },
    { id: "pallof-press", name: "Pallof Press", primary: false },
    { id: "russian-twist", name: "Russian Twist", primary: false },
  ],
};

/**
 * Pick the primary exercise for a movement category,
 * or rotate to a different variation if plateaued.
 */
export function pickExercise(
  category: MovementCategory,
  plateauCount: number,
  currentExerciseId?: string,
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

  // Plateau >= 3 — rotate to a different variation
  const others = options.filter((e) => e.id !== currentExerciseId);
  const pick = others[Math.floor(Math.random() * others.length)] ?? options[0];
  return { id: pick.id, name: pick.name };
}

/**
 * Pick an accessory (non-primary) exercise for variety.
 */
export function pickAccessory(
  category: MovementCategory,
  excludeId?: string,
): { id: string; name: string } {
  const options = exerciseBank[category].filter(
    (e) => !e.primary && e.id !== excludeId,
  );
  const pick = options[Math.floor(Math.random() * options.length)]
    ?? exerciseBank[category][0];
  return { id: pick.id, name: pick.name };
}
