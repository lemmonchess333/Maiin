/* ─────────────────────────────────────────────
   Run Day Scheduler
   Auto-distributes run types across the week,
   or generates a periodized race-prep plan.
   ───────────────────────────────────────────── */

import { RUN_TEMPLATES } from "@/lib/workoutTemplates";

export interface ScheduledRunDay {
  dayIndex: number; // 0=Sun … 6=Sat
  templateId: string;
  type: string; // easy, tempo, intervals, long, race
  completed: boolean;
  userOverride?: string;
}

export interface RunPlan {
  mode: "structured" | "race_prep";
  raceGoal?: { distance: string; targetDate: string };
  totalWeeks?: number;
  currentWeek?: number;
}

// Default lift day indices for common splits
function defaultLiftDays(count: number): number[] {
  // Mon=1,Tue=2,Wed=3,Thu=4,Fri=5,Sat=6,Sun=0
  if (count <= 0) return [];
  if (count === 1) return [1];
  if (count === 2) return [1, 4];
  if (count === 3) return [1, 3, 5];
  if (count === 4) return [1, 2, 4, 5];
  if (count === 5) return [1, 2, 3, 4, 5];
  return [1, 2, 3, 4, 5, 6]; // 6
}

function templateByType(type: string): string {
  const match = RUN_TEMPLATES.find((t) => t.type === type);
  return match?.id ?? "easy_30";
}

/**
 * Structured mode: auto-fill run days around lift days.
 * Pattern: 1 long (weekend), 1 quality (tempo/intervals alternating by week), rest easy.
 */
export function scheduleStructuredWeek(
  liftDayCount: number,
  runDaysTarget: number,
  weekNumber: number,
  liftDayIndices?: number[]
): ScheduledRunDay[] {
  if (runDaysTarget <= 0) return [];

  const clampedLift = Math.max(0, Math.min(6, liftDayCount));
  const clampedRun = Math.max(1, Math.min(7 - clampedLift, runDaysTarget));
  const liftDays = new Set(
    liftDayIndices && liftDayIndices.length > 0
      ? liftDayIndices
      : defaultLiftDays(clampedLift)
  );
  const available: number[] = [];
  // Prefer: Sun(0), Sat(6), Wed(3), Mon(1), Tue(2), Thu(4), Fri(5)
  for (const d of [0, 6, 3, 1, 2, 4, 5]) {
    if (!liftDays.has(d)) available.push(d);
  }

  const slots = available.slice(0, clampedRun);
  if (slots.length === 0) return [];

  const result: ScheduledRunDay[] = [];

  // First slot: long run (prefer weekend)
  const longSlot = slots.find((d) => d === 0 || d === 6) ?? slots[0];
  result.push({
    dayIndex: longSlot,
    templateId: templateByType("long"),
    type: "long",
    completed: false,
  });

  // Second slot (if available): quality — tempo on even weeks, intervals on odd
  const remaining = slots.filter((d) => d !== longSlot);
  if (remaining.length > 0) {
    const qualityType = weekNumber % 2 === 0 ? "tempo" : "intervals";
    const qualityTemplateId =
      qualityType === "tempo"
        ? "tempo_20"
        : weekNumber % 4 < 2
          ? "5x1k"
          : "8x400";
    result.push({
      dayIndex: remaining[0],
      templateId: qualityTemplateId,
      type: qualityType,
      completed: false,
    });

    // Remaining slots: easy runs
    for (let i = 1; i < remaining.length; i++) {
      result.push({
        dayIndex: remaining[i],
        templateId: "easy_30",
        type: "easy",
        completed: false,
      });
    }
  }

  return result.sort((a, b) => a.dayIndex - b.dayIndex);
}

/* ─────────────────────────────────────────────
   Race Prep Plan Generator
   ───────────────────────────────────────────── */

interface RaceConfig {
  peakLongKm: number;
  baseLongKm: number;
  minWeeks: number;
}

const RACE_CONFIGS: Record<string, RaceConfig> = {
  "5k": { peakLongKm: 8, baseLongKm: 4, minWeeks: 4 },
  "10k": { peakLongKm: 12, baseLongKm: 6, minWeeks: 6 },
  half: { peakLongKm: 20, baseLongKm: 10, minWeeks: 8 },
  marathon: { peakLongKm: 32, baseLongKm: 14, minWeeks: 12 },
};

function getPhaseForWeek(
  weekIndex: number,
  totalWeeks: number
): "base" | "build" | "taper" | "race" {
  if (weekIndex >= totalWeeks - 1) return "race";
  const pct = weekIndex / totalWeeks;
  if (pct < 0.4) return "base";
  if (pct < 0.75) return "build";
  return "taper";
}

export function generateRacePlan(
  distance: "5k" | "10k" | "half" | "marathon",
  targetDate: string,
  liftDayCount: number,
  runDaysPerWeek: number = 3,
  liftDayIndices?: number[]
): { totalWeeks: number; weeks: ScheduledRunDay[][] } {
  const config = RACE_CONFIGS[distance];
  const clampedLift = Math.max(0, Math.min(6, liftDayCount));
  const clampedRun = Math.max(1, Math.min(7 - clampedLift, runDaysPerWeek));
  const now = new Date();
  const target = new Date(targetDate);
  const diffMs = target.getTime() - now.getTime();
  const totalWeeks = Math.max(config.minWeeks, Math.ceil(diffMs / (7 * 86400000)));

  const liftDays = new Set(
    liftDayIndices && liftDayIndices.length > 0
      ? liftDayIndices
      : defaultLiftDays(clampedLift)
  );
  const available: number[] = [];
  for (const d of [0, 6, 3, 1, 2, 4, 5]) {
    if (!liftDays.has(d)) available.push(d);
  }
  const slots = available.slice(0, Math.max(clampedRun, 2));

  const weeks: ScheduledRunDay[][] = [];

  for (let w = 0; w < totalWeeks; w++) {
    const phase = getPhaseForWeek(w, totalWeeks);
    const week: ScheduledRunDay[] = [];

    const longSlot = slots.find((d) => d === 0 || d === 6) ?? slots[0];
    const remaining = slots.filter((d) => d !== longSlot);

    // Long run — distance progression by phase
    const longTemplate =
      phase === "taper"
        ? "easy_30"
        : config.peakLongKm >= 15
          ? "long_15k"
          : "long_10k";
    week.push({
      dayIndex: longSlot,
      templateId: longTemplate,
      type: phase === "taper" ? "easy" : "long",
      completed: false,
    });

    if (remaining.length > 0) {
      if (phase === "base") {
        // Base: all easy
        remaining.forEach((d) =>
          week.push({
            dayIndex: d,
            templateId: "easy_30",
            type: "easy",
            completed: false,
          })
        );
      } else if (phase === "build") {
        // Build: 1 quality + rest easy
        const qualityId = w % 2 === 0 ? "tempo_20" : "5x1k";
        week.push({
          dayIndex: remaining[0],
          templateId: qualityId,
          type: w % 2 === 0 ? "tempo" : "intervals",
          completed: false,
        });
        remaining.slice(1).forEach((d) =>
          week.push({
            dayIndex: d,
            templateId: "easy_30",
            type: "easy",
            completed: false,
          })
        );
      } else if (phase === "taper") {
        // Taper: 1 short quality + easy
        week.push({
          dayIndex: remaining[0],
          templateId: "8x400",
          type: "intervals",
          completed: false,
        });
        remaining.slice(1).forEach((d) =>
          week.push({
            dayIndex: d,
            templateId: "easy_30",
            type: "easy",
            completed: false,
          })
        );
      } else {
        // Race week: just easy + race day
        week.push({
          dayIndex: remaining[0],
          templateId: "5k_race",
          type: "race",
          completed: false,
        });
      }
    }

    weeks.push(week.sort((a, b) => a.dayIndex - b.dayIndex));
  }

  return { totalWeeks, weeks };
}

/** Get current week index from a race plan's start */
export function getCurrentRaceWeek(totalWeeks: number, targetDate: string): number {
  const target = new Date(targetDate);
  const now = new Date();
  const weeksLeft = Math.ceil((target.getTime() - now.getTime()) / (7 * 86400000));
  return Math.max(0, Math.min(totalWeeks - 1, totalWeeks - weeksLeft));
}

export function getRacePhaseLabel(weekIndex: number, totalWeeks: number): string {
  const phase = getPhaseForWeek(weekIndex, totalWeeks);
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}
