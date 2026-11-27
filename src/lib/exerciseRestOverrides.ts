import { readJson, scopedKey, writeJson } from "@/lib/localStore";

const REST_OVERRIDE_KEY = "tropos-exercise-rest-overrides";

/** Common rest-timer choices offered per exercise (seconds). */
export const EXERCISE_REST_PRESETS = [
  45, 60, 75, 90, 120, 150, 180, 240,
] as const;

export type ExerciseRestOverrides = Record<string, number>;

export function readExerciseRestOverrides(
  uid: string | null | undefined
): ExerciseRestOverrides {
  if (!uid) return {};
  const raw = readJson<Record<string, unknown>>(
    scopedKey(REST_OVERRIDE_KEY, uid),
    {}
  );
  if (!raw || typeof raw !== "object") return {};
  const out: ExerciseRestOverrides = {};
  for (const [id, seconds] of Object.entries(raw)) {
    if (
      typeof seconds === "number" &&
      Number.isFinite(seconds) &&
      seconds >= 15 &&
      seconds <= 600
    ) {
      out[id] = Math.round(seconds);
    }
  }
  return out;
}

export function writeExerciseRestOverride(
  uid: string | null | undefined,
  exerciseId: string,
  seconds: number | null
): ExerciseRestOverrides {
  const current = readExerciseRestOverrides(uid);
  const next: ExerciseRestOverrides = { ...current };
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    delete next[exerciseId];
  } else {
    next[exerciseId] = Math.max(15, Math.min(600, Math.round(seconds)));
  }
  if (uid) {
    writeJson(scopedKey(REST_OVERRIDE_KEY, uid), next);
  }
  return next;
}

/** Compact human-readable rest label, e.g. "75s", "2:00", "2:30". */
export function formatRestChipLabel(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 90) return `${whole}s`;
  const mins = Math.floor(whole / 60);
  const rem = whole % 60;
  return `${mins}:${rem.toString().padStart(2, "0")}`;
}
