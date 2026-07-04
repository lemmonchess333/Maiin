/**
 * Per-muscle recovery model (competitive doc Tier-2 #6, second half — the
 * visual muscle-recovery view; the progression-suggestion half shipped in
 * #1483). Fitbod's moat: show which muscle groups are still loaded from
 * recent sessions and which are ready to train, on the body diagram, where
 * today's session is chosen.
 *
 * Model — deliberately simple and honest at the data's real granularity:
 *  - Saved workouts carry per-exercise attribution only (no per-set RPE
 *    history at the muscle level), and dates are local day keys. So the
 *    model is DATE-based: each muscle recovers over a fixed per-muscle
 *    window (large groups ~72h, small ~48h, core ~24h — the standard
 *    between-sessions guidance), volume-blind by design. No fake precision.
 *  - An exercise loads its PRIMARY muscle for the full window and each
 *    SECONDARY muscle for half the window (the same 1.0/0.5 involvement
 *    convention `weeklyVolumeByMuscle` uses for volume).
 *  - A muscle's recovery fraction is the MOST-BINDING recent hit (min over
 *    hits), so a heavy primary session yesterday isn't washed out by a
 *    light secondary touch today.
 *
 * Statuses: fraction ≥ 1 → "ready"; ≥ 0.5 → "nearly"; else "recovering".
 * Muscles with no recent hits are "ready" (lastTrained null).
 *
 * Pure — the card (MuscleRecoveryCard) does the Firestore fetch and calls
 * `hitsFromWorkoutDocs` + `computeMuscleRecovery`.
 */

import {
  CANONICAL_MUSCLE_ORDER,
  canonicalMusclesForDbExercise,
  type CanonicalMuscle,
} from "@/features/program/volumeModel";
import { EXERCISES, getExerciseById } from "@/lib/exercises";

export type RecoveryStatus = "recovering" | "nearly" | "ready";

export interface MuscleHit {
  muscle: CanonicalMuscle;
  /** Local YYYY-MM-DD the session was logged. */
  date: string;
  involvement: "primary" | "secondary";
}

export interface MuscleRecoveryEntry {
  muscle: CanonicalMuscle;
  status: RecoveryStatus;
  /** 0..1 — 1 = fully recovered. */
  fraction: number;
  /** Most recent session date that loaded this muscle, or null. */
  lastTrained: string | null;
  /** Whole days until fully recovered (0 when ready). */
  readyInDays: number;
}

/** Full-recovery window per muscle, in days (primary involvement). */
export const RECOVERY_WINDOW_DAYS: Record<CanonicalMuscle, number> = {
  Chest: 3,
  Back: 3,
  Quads: 3,
  Hamstrings: 3,
  Glutes: 3,
  Shoulders: 2,
  Biceps: 2,
  Triceps: 2,
  Calves: 2,
  Core: 1,
};

/** Lookback the caller should fetch — beyond this every hit reads "ready". */
export const RECOVERY_LOOKBACK_DAYS = 7;

/** Noon-anchored local-date diff so DST can't shift the day count. */
function daysBetween(fromKey: string, toKey: string): number {
  return Math.round(
    (new Date(`${toKey}T12:00:00`).getTime() -
      new Date(`${fromKey}T12:00:00`).getTime()) /
      86_400_000
  );
}

/**
 * Map saved workout docs (users/{uid}/workouts shape) to muscle hits.
 * Attribution follows the volume tally's rules: DB exercise resolved by
 * exerciseId first, then by name (the saved `category` field has shipped
 * unreliable data — see History.tsx); unattributable lifts are skipped.
 */
export function hitsFromWorkoutDocs(
  docs: {
    date?: unknown;
    exercises?: {
      exerciseId?: unknown;
      exerciseName?: unknown;
    }[];
  }[]
): MuscleHit[] {
  const hits: MuscleHit[] = [];
  for (const doc of docs) {
    const date = typeof doc.date === "string" ? doc.date : null;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (const ex of doc.exercises ?? []) {
      const byId =
        typeof ex.exerciseId === "string"
          ? getExerciseById(ex.exerciseId)
          : undefined;
      const dbEx =
        byId ??
        (typeof ex.exerciseName === "string"
          ? EXERCISES.find((e) => e.name === ex.exerciseName)
          : undefined);
      if (!dbEx) continue;
      const { primary, secondary } = canonicalMusclesForDbExercise(dbEx);
      if (!primary) continue;
      hits.push({ muscle: primary, date, involvement: "primary" });
      for (const m of secondary) {
        hits.push({ muscle: m, date, involvement: "secondary" });
      }
    }
  }
  return hits;
}

export interface GroupRecovery {
  status: RecoveryStatus;
  /** Whole days until the group's most-loaded muscle is recovered. */
  readyInDays: number;
}

/**
 * The analytics MuscleHeatMap legend speaks the coarser EXERCISE_CATEGORIES
 * group taxonomy (plus legacy aliases); map each legend group to its
 * canonical muscles so recovery chips can sit on the existing rows. "Full
 * Body" is deliberately absent — a single readiness state for it would be
 * dishonest.
 */
const HEAT_MAP_GROUP_MUSCLES: Record<string, CanonicalMuscle[]> = {
  Chest: ["Chest"],
  Back: ["Back"],
  Shoulders: ["Shoulders"],
  Biceps: ["Biceps"],
  Triceps: ["Triceps"],
  Legs: ["Quads", "Hamstrings", "Glutes", "Calves"],
  Core: ["Core"],
  // Legacy alias rows (CATEGORY_DISPLAY translations of old workout docs).
  "Quads & Glutes": ["Quads", "Glutes"],
  "Hamstrings & Back": ["Hamstrings", "Back"],
  Lats: ["Back"],
  Calves: ["Calves"],
  Traps: ["Back"],
};

/**
 * Aggregate per-muscle recovery to the heat-map's legend groups, most-binding
 * member wins (a group is only as recovered as its least-recovered muscle).
 * Groups with no mapping (e.g. "Full Body") are omitted — the legend row
 * simply gets no chip.
 */
export function recoveryForHeatMapGroups(
  entries: MuscleRecoveryEntry[]
): Record<string, GroupRecovery> {
  const byMuscle = new Map(entries.map((e) => [e.muscle, e]));
  const result: Record<string, GroupRecovery> = {};
  for (const [group, muscles] of Object.entries(HEAT_MAP_GROUP_MUSCLES)) {
    let fraction = 1;
    let readyInDays = 0;
    for (const m of muscles) {
      const e = byMuscle.get(m);
      if (!e) continue;
      fraction = Math.min(fraction, e.fraction);
      readyInDays = Math.max(readyInDays, e.readyInDays);
    }
    const status: RecoveryStatus =
      fraction >= 1 ? "ready" : fraction >= 0.5 ? "nearly" : "recovering";
    result[group] = { status, readyInDays };
  }
  return result;
}

/**
 * Recovery state for every canonical muscle as of `todayKey`, in
 * CANONICAL_MUSCLE_ORDER. Future-dated hits (clock skew) clamp to 0 days.
 */
export function computeMuscleRecovery(
  hits: MuscleHit[],
  todayKey: string
): MuscleRecoveryEntry[] {
  const byMuscle = new Map<CanonicalMuscle, MuscleHit[]>();
  for (const hit of hits) {
    const list = byMuscle.get(hit.muscle);
    if (list) list.push(hit);
    else byMuscle.set(hit.muscle, [hit]);
  }

  return CANONICAL_MUSCLE_ORDER.map((muscle) => {
    const muscleHits = byMuscle.get(muscle) ?? [];
    if (muscleHits.length === 0) {
      return {
        muscle,
        status: "ready" as const,
        fraction: 1,
        lastTrained: null,
        readyInDays: 0,
      };
    }

    let fraction = 1;
    let readyInDays = 0;
    let lastTrained: string | null = null;
    for (const hit of muscleHits) {
      const daysSince = Math.max(0, daysBetween(hit.date, todayKey));
      const window =
        hit.involvement === "primary"
          ? RECOVERY_WINDOW_DAYS[muscle]
          : Math.max(1, Math.ceil(RECOVERY_WINDOW_DAYS[muscle] / 2));
      fraction = Math.min(fraction, Math.min(1, daysSince / window));
      readyInDays = Math.max(readyInDays, Math.max(0, window - daysSince));
      if (!lastTrained || hit.date > lastTrained) lastTrained = hit.date;
    }

    const status: RecoveryStatus =
      fraction >= 1 ? "ready" : fraction >= 0.5 ? "nearly" : "recovering";
    return { muscle, status, fraction, lastTrained, readyInDays };
  });
}
