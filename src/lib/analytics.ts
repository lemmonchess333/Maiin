/**
 * Shared analytics utilities for the app.
 * Exercise→muscle group map, 1RM calculations, adherence scoring,
 * volume computations, and strength trend helpers.
 */

/* ================================
   EXERCISE → MUSCLE GROUP MAP
================================ */

const CATEGORY_TO_MUSCLE: Record<string, string> = {
  Chest: "chest",
  Back: "back",
  Shoulders: "shoulders",
  Biceps: "arms",
  Triceps: "arms",
  Legs: "legs",
  Core: "core",
  "Full Body": "legs",
  Cardio: "cardio",
};

export function exerciseToMuscleGroup(category: string): string {
  return CATEGORY_TO_MUSCLE[category] ?? "other";
}

export const MUSCLE_GROUPS = ["chest", "back", "legs", "shoulders", "arms"] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/* ================================
   EPLEY 1RM
================================ */

export function epley1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

/* ================================
   STRENGTH TREND (slope over sessions)
================================ */

export interface StrengthPoint {
  date: string;
  e1rm: number;
}

/** Simple linear regression slope per session (not per day) */
export function strengthSlope(points: StrengthPoint[]): number {
  if (points.length < 2) return 0;
  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += points[i].e1rm;
    sumXY += i * points[i].e1rm;
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

export type MomentumDirection = "up" | "flat" | "down";

export function momentumDirection(slope: number): MomentumDirection {
  if (slope > 0.3) return "up";
  if (slope < -0.3) return "down";
  return "flat";
}

/** 4-week % change from first to last point */
export function fourWeekChange(points: StrengthPoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0].e1rm;
  const last = points[points.length - 1].e1rm;
  if (first === 0) return null;
  return Math.round(((last - first) / first) * 1000) / 10;
}

/* ================================
   VOLUME COMPUTATION
================================ */

export interface VolumeByMuscle {
  chest: number;
  back: number;
  legs: number;
  shoulders: number;
  arms: number;
}

export function emptyVolume(): VolumeByMuscle {
  return { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0 };
}

/**
 * Compute total sets per muscle group from an array of workout exercises.
 * Each exercise's total sets count toward the mapped muscle group.
 */
export function computeVolume(
  exercises: Array<{ category: string; sets: Array<unknown> }>
): VolumeByMuscle {
  const vol = emptyVolume();
  for (const ex of exercises) {
    const group = exerciseToMuscleGroup(ex.category);
    if (group in vol) {
      (vol as any)[group] += ex.sets.length;
    }
  }
  return vol;
}

/** Week-over-week % change per muscle */
export function volumeWoWChange(
  current: VolumeByMuscle,
  previous: VolumeByMuscle
): Record<MuscleGroup, number | null> {
  const result = {} as Record<MuscleGroup, number | null>;
  for (const g of MUSCLE_GROUPS) {
    const prev = previous[g];
    const curr = current[g];
    if (prev === 0) {
      result[g] = curr > 0 ? 100 : null;
    } else {
      result[g] = Math.round(((curr - prev) / prev) * 100);
    }
  }
  return result;
}

/* ================================
   MACRO ADHERENCE
================================ */

export interface AdherenceResult {
  caloriesHit: boolean;
  proteinHit: boolean;
  score: number; // 0-100
  band: "green" | "yellow" | "red";
}

export function dailyAdherence(
  actual: { calories: number; protein: number },
  target: { calories: number; protein: number }
): AdherenceResult {
  const calPct = target.calories > 0
    ? Math.abs(actual.calories - target.calories) / target.calories
    : 0;
  const proDiff = Math.abs(actual.protein - target.protein);

  const caloriesHit = calPct <= 0.05;
  const proteinHit = proDiff <= 10;

  let score = 100;
  // calorie penalty
  if (calPct > 0.05) score -= Math.min(40, Math.round(calPct * 100));
  // protein penalty
  if (proDiff > 10) score -= Math.min(30, Math.round((proDiff - 10) / 2));

  score = Math.max(0, Math.min(100, score));

  const band = score >= 80 ? "green" : score >= 50 ? "yellow" : "red";

  return { caloriesHit, proteinHit, score, band };
}

export function weeklyAdherenceScore(dailyScores: number[]): number {
  if (dailyScores.length === 0) return 0;
  return Math.round(dailyScores.reduce((a, b) => a + b, 0) / dailyScores.length);
}

/* ================================
   FATIGUE HEURISTIC
================================ */

export interface FatigueSignal {
  triggered: boolean;
  message: string;
}

export function detectFatigue(
  volumeChange: number | null,
  momentumDir: MomentumDirection
): FatigueSignal {
  if (
    volumeChange !== null &&
    volumeChange > 15 &&
    momentumDir === "down"
  ) {
    return {
      triggered: true,
      message: "Possible accumulated fatigue — consider reducing volume this week.",
    };
  }
  return { triggered: false, message: "" };
}

/* ================================
   PHASE-AWARE INSIGHT GENERATION
================================ */

export type Phase = "lean bulk" | "cut" | "recomp" | "strength peak";

export interface InsightData {
  phase: Phase;
  momentumDir: MomentumDirection;
  fourWeekPct: number | null;
  weeklyAdherence: number;
  avgCalorieDiff: number; // positive = surplus, negative = deficit
  bodyweightTrend: number; // positive = gaining, negative = losing
  volumeWoW: number | null; // total volume % change
}

export function generateInsight(data: InsightData): string {
  const { phase, momentumDir, fourWeekPct, weeklyAdherence, avgCalorieDiff, bodyweightTrend } = data;

  const parts: string[] = [];

  // Strength momentum
  if (fourWeekPct !== null) {
    if (momentumDir === "up") {
      parts.push(`Strength trending up ${fourWeekPct > 0 ? `+${fourWeekPct}%` : ""} over 4 weeks.`);
    } else if (momentumDir === "down") {
      parts.push(`Strength declining ${fourWeekPct !== null ? `${fourWeekPct}%` : ""} — review load management.`);
    } else {
      parts.push("Strength stable. Push intensity on compounds to progress.");
    }
  }

  // Phase-specific
  switch (phase) {
    case "lean bulk":
      if (avgCalorieDiff < 100) {
        parts.push("Surplus is low for a bulk — aim for +200-300 cal/day.");
      } else if (bodyweightTrend < 0) {
        parts.push("Weight is dropping despite bulking intent — increase intake.");
      } else if (momentumDir === "up") {
        parts.push("Volume and strength growing — bulk is working well.");
      }
      break;
    case "cut":
      if (momentumDir === "down") {
        parts.push("Strength loss during cut — prioritize protein and recovery.");
      } else {
        parts.push("Maintaining strength during cut — execution is solid.");
      }
      if (bodyweightTrend > 0.1) {
        parts.push("Weight trending up during cut — verify deficit.");
      }
      break;
    case "recomp":
      if (weeklyAdherence >= 80) {
        parts.push("Macro adherence strong — recomp conditions are favorable.");
      } else {
        parts.push("Consistency needed for recomp — hit macros more tightly.");
      }
      break;
    case "strength peak":
      if (momentumDir === "up") {
        parts.push("Peak phase progressing well — keep intensity high.");
      } else {
        parts.push("Consider strategic deload to prime next peak attempt.");
      }
      break;
  }

  // Adherence
  if (weeklyAdherence < 50) {
    parts.push(`Macro adherence at ${weeklyAdherence}% — this limits results.`);
  }

  return parts.join(" ");
}
