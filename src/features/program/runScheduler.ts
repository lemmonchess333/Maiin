/* ─────────────────────────────────────────────
   Run Day Scheduler
   Auto-distributes run types across the week,
   or generates a periodized race-prep plan.
   ───────────────────────────────────────────── */

import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { ScheduledRunDay, RunPlan } from "./programTypes";
import {
  generateScheduledRunId,
  localDateString,
  localWeekKey,
  addLocalDays,
  parseLocalDate,
} from "@/lib/dateHelpers";

// Re-export so existing imports of these types from runScheduler keep
// working. The single source of truth lives in programTypes (P0-A spec v7).
export type { ScheduledRunDay, RunPlan };

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
  liftDayIndices?: number[],
  /**
   * Reference date for `totalWeeks` calculation. Defaults to wall-clock
   * `new Date()` for back-compat — but `planBuilder` (P0-C) always
   * passes this explicitly so plan generation stays deterministic /
   * testable. Once P0-3 lands the full runScheduler refactor this
   * back-compat default goes away.
   */
  currentDate?: string,
): { totalWeeks: number; weeks: ScheduledRunDay[][] } {
  const config = RACE_CONFIGS[distance];
  const clampedLift = Math.max(0, Math.min(6, liftDayCount));
  const clampedRun = Math.max(1, Math.min(7 - clampedLift, runDaysPerWeek));
  const now = currentDate ? new Date(currentDate) : new Date();
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
        // Race week: just easy + race day. PR-0a — route through
        // pickRaceTemplateId so the race-day template matches the
        // user's actual race distance instead of collapsing to a
        // 5K. `distance` is the function parameter at line 138.
        week.push({
          dayIndex: remaining[0],
          templateId: pickRaceTemplateId(distance),
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

/* ═══════════════════════════════════════════════════════════════
   P0-3 · v2 SCHEDULER API · spec v7
   ═══════════════════════════════════════════════════════════════

   The V2 functions below take `weekSchedule` directly (instead of
   deriving lift days from a count + cap) and emit ScheduledRunDay
   in v2 shape (id / date / weekKey / status native — no
   post-processing bridge in planBuilder).

   Key changes from V1:
   - Accept the weekSchedule the caller already has (single source
     of truth — same array Home/Programme render against).
   - Run-eligible slots = days with type "run" or "both". No more
     `7 - liftDayCount` cap that previously prevented hybrid users
     from having scheduled runs on lift days.
   - Stress-aware long-run placement: prefer non-Both slots so the
     hardest run isn't accidentally paired with a lift day. If only
     Both slots are available, accept the pairing (UI can flag it).
   - Native v2 ScheduledRunDay output: id / date / weekKey / status
     populated at construction time, not bolted on after.
   - Compressed-plan rules in race-prep mode: cap hard runs / softer
     long-run progression / skip intervals when below race-distance
     minimum weeks. Honest "compressed" labelling.

   V1 functions stay for back-compat with useProgram.ts callers.
   Migration to V2 happens in P0-5 (onboarding) + Configure Plan. */

/** Helper: enrich a v1-shaped runDay with v2 identity fields.
 *  Exported so external callers can post-process v1 outputs if
 *  needed during migration. Internal v2 functions construct
 *  runDays in this shape directly. */
export function enrichRunDayV2(
  rd: ScheduledRunDay,
  weekStart: Date,
): ScheduledRunDay {
  // Already enriched? Don't double-process.
  if (rd.id && rd.date && rd.weekKey && rd.status) return rd;
  const weekKey = rd.weekKey ?? localWeekKey(weekStart);
  const date = rd.date ?? localDateString(addLocalDays(weekStart, rd.dayIndex));
  const id = rd.id ?? generateScheduledRunId({ dayIndex: rd.dayIndex, templateId: rd.templateId }, weekKey);
  return {
    ...rd,
    id,
    weekKey,
    date,
    status: rd.status ?? (rd.completed ? "completed_exact" : "planned"),
  };
}

/** Pick a long-run slot from available run-eligible day indices.
 *  Stress-aware: prefer single-modality "run" slots over "both"
 *  slots so the hardest session isn't paired with a lift day by
 *  default. Falls back to any available slot (with the same
 *  weekend bias as V1) when no run-only slots exist. */
function pickLongRunSlot(
  runEligibleSlots: number[],
  weekSchedule: ScheduleDay[],
): number {
  // Categorise: run-only (no lift on that day) vs both (lift+run)
  const runOnlySlots = runEligibleSlots.filter((d) => weekSchedule[d]?.type === "run");
  const bothSlots = runEligibleSlots.filter((d) => weekSchedule[d]?.type === "both");

  // Preference: weekend run-only > any run-only > weekend both > any both
  const weekendRunOnly = runOnlySlots.find((d) => d === 0 || d === 6);
  if (weekendRunOnly !== undefined) return weekendRunOnly;
  if (runOnlySlots.length > 0) return runOnlySlots[0];
  const weekendBoth = bothSlots.find((d) => d === 0 || d === 6);
  if (weekendBoth !== undefined) return weekendBoth;
  return bothSlots[0] ?? runEligibleSlots[0];
}

/** Build a runDay in v2 shape directly. */
function buildRunDayV2(args: {
  dayIndex: number;
  templateId: string;
  type: string;
  weekStart: Date;
}): ScheduledRunDay {
  const weekKey = localWeekKey(args.weekStart);
  const date = localDateString(addLocalDays(args.weekStart, args.dayIndex));
  return {
    id: generateScheduledRunId({ dayIndex: args.dayIndex, templateId: args.templateId }, weekKey),
    weekKey,
    date,
    dayIndex: args.dayIndex,
    templateId: args.templateId,
    type: args.type,
    completed: false,
    status: "planned",
  };
}

/** Resolve a long-run template ID by phase + race-distance peak.
 *  Centralised here so both structured + race-prep schedules pick
 *  the same way. */
function pickLongTemplateId(peakLongKm: number, phase: "base" | "build" | "taper" | "race"): string {
  if (phase === "taper" || phase === "race") return "easy_30";
  return peakLongKm >= 15 ? "long_15k" : "long_10k";
}

export interface StructuredWeekV2Input {
  /** The user's weekly type structure. Must be 7 entries. */
  weekSchedule: ScheduleDay[];
  /** 1-indexed week number (drives even/odd quality alternation). */
  weekNumber: number;
  /** Local-date "YYYY-MM-DD" representing the Sunday of the target
   *  week. Used to populate `date` + `weekKey` on every runDay. */
  weekStart: string;
}

/** V2 structured-week scheduler. Drives from `weekSchedule`, emits
 *  v2-shaped runDays. */
export function scheduleStructuredWeekV2(input: StructuredWeekV2Input): ScheduledRunDay[] {
  const runEligibleSlots = input.weekSchedule
    .filter((d) => d.type === "run" || d.type === "both")
    .map((d) => d.day);
  if (runEligibleSlots.length === 0) return [];

  const weekStart = parseLocalDate(input.weekStart);
  const longSlot = pickLongRunSlot(runEligibleSlots, input.weekSchedule);
  const remaining = runEligibleSlots.filter((d) => d !== longSlot);
  const result: ScheduledRunDay[] = [];

  // Long run (single — even at 4+ runs/week structured users get one
  // long, one quality, rest easy).
  result.push(buildRunDayV2({
    dayIndex: longSlot,
    templateId: "long_10k",
    type: "long",
    weekStart,
  }));

  if (remaining.length > 0) {
    // Quality session — tempo on even weeks, intervals on odd.
    const isTempoWeek = input.weekNumber % 2 === 0;
    const qualityType = isTempoWeek ? "tempo" : "intervals";
    const qualityTemplateId = isTempoWeek
      ? "tempo_20"
      : input.weekNumber % 4 < 2
        ? "5x1k"
        : "8x400";
    result.push(buildRunDayV2({
      dayIndex: remaining[0],
      templateId: qualityTemplateId,
      type: qualityType,
      weekStart,
    }));

    // Remaining → easy
    for (let i = 1; i < remaining.length; i++) {
      result.push(buildRunDayV2({
        dayIndex: remaining[i],
        templateId: "easy_30",
        type: "easy",
        weekStart,
      }));
    }
  }

  return result.sort((a, b) => a.dayIndex - b.dayIndex);
}

export interface RacePlanV2Input {
  weekSchedule: ScheduleDay[];
  raceGoal: { distance: "5k" | "10k" | "half" | "marathon"; targetDate: string };
  /** Total runs target per week. Used in v1 as the slot cap; in v2
   *  the weekSchedule is authoritative — this only seeds the structure
   *  for the race-prep generator's internal planning. */
  weeklyRunDays: number;
  /** Local "YYYY-MM-DD". REQUIRED — race-prep totalWeeks calc must
   *  be deterministic. */
  currentDate: string;
  /** Local "YYYY-MM-DD" Sunday of week 0. */
  weekStart: string;
}

export interface RacePlanV2Output {
  totalWeeks: number;
  /** True when totalWeeks < race-config minWeeks. UI flags this as
   *  "compressed" so user knows the plan was shortened from the
   *  ideal. */
  compressed: boolean;
  /** Week-by-week scheduled runs. weeks[0] is the current week. */
  weeks: ScheduledRunDay[][];
}

/** V2 race-prep generator. Drives from weekSchedule, applies
 *  compressed-plan safety rules, emits v2-shaped runDays. */
export function generateRacePlanV2(input: RacePlanV2Input): RacePlanV2Output {
  const config = RACE_CONFIGS[input.raceGoal.distance];
  const now = parseLocalDate(input.currentDate);
  const target = parseLocalDate(input.raceGoal.targetDate);
  const diffMs = target.getTime() - now.getTime();
  const naturalWeeks = Math.max(1, Math.ceil(diffMs / (7 * 86400000)));
  const totalWeeks = Math.max(naturalWeeks, 2); // hard floor: 2 weeks
  const compressed = totalWeeks < config.minWeeks;

  const runEligibleSlots = input.weekSchedule
    .filter((d) => d.type === "run" || d.type === "both")
    .map((d) => d.day);
  if (runEligibleSlots.length === 0) {
    // Shouldn't happen — race_prep requires at least 2 runs per week
    // and the UI enforces it. Defensive fallback: empty plan.
    return { totalWeeks, compressed, weeks: [] };
  }

  const weekStartDate = parseLocalDate(input.weekStart);
  const weeks: ScheduledRunDay[][] = [];

  for (let w = 0; w < totalWeeks; w++) {
    const phase = getPhaseForWeek(w, totalWeeks);
    // Each week's start advances by 7 days from week 0
    const weekStart = addLocalDays(weekStartDate, w * 7);
    const week: ScheduledRunDay[] = [];

    const longSlot = pickLongRunSlot(runEligibleSlots, input.weekSchedule);
    const remaining = runEligibleSlots.filter((d) => d !== longSlot);

    // Long run / race day
    if (phase === "race") {
      week.push(buildRunDayV2({
        dayIndex: longSlot,
        templateId: pickRaceTemplateId(input.raceGoal.distance),
        type: "race",
        weekStart,
      }));
    } else {
      week.push(buildRunDayV2({
        dayIndex: longSlot,
        templateId: pickLongTemplateId(config.peakLongKm, phase),
        type: phase === "taper" ? "easy" : "long",
        weekStart,
      }));
    }

    if (remaining.length > 0) {
      // Compressed-plan rule: cap hard sessions at 1/week (vs 1
      // long + 1 quality in standard plans during build). Also
      // skip intervals if heavily compressed (totalWeeks < minWeeks/2).
      const skipIntervals = compressed && totalWeeks < config.minWeeks / 2;
      const hardCapApplies = compressed;

      if (phase === "base") {
        // Base: all easy (compressed plans extend base proportionally
        // since there's no time for a real build phase)
        remaining.forEach((d) => week.push(buildRunDayV2({
          dayIndex: d,
          templateId: "easy_30",
          type: "easy",
          weekStart,
        })));
      } else if (phase === "build") {
        const allowQuality = !hardCapApplies || w % 2 === 0;
        if (allowQuality && !skipIntervals) {
          // 1 quality + rest easy (or all easy if compressed and
          // the long run already consumed the week's quality budget)
          const qualityType = w % 2 === 0 ? "tempo" : "intervals";
          const qualityId = qualityType === "tempo" ? "tempo_20" : "5x1k";
          week.push(buildRunDayV2({
            dayIndex: remaining[0],
            templateId: qualityId,
            type: qualityType,
            weekStart,
          }));
          remaining.slice(1).forEach((d) => week.push(buildRunDayV2({
            dayIndex: d,
            templateId: "easy_30",
            type: "easy",
            weekStart,
          })));
        } else {
          // Skip quality this week — all easy
          remaining.forEach((d) => week.push(buildRunDayV2({
            dayIndex: d,
            templateId: "easy_30",
            type: "easy",
            weekStart,
          })));
        }
      } else if (phase === "taper") {
        // Taper: 1 short quality + easy. Compressed plans skip the
        // taper quality entirely (already low volume).
        if (!compressed) {
          week.push(buildRunDayV2({
            dayIndex: remaining[0],
            templateId: "8x400",
            type: "intervals",
            weekStart,
          }));
          remaining.slice(1).forEach((d) => week.push(buildRunDayV2({
            dayIndex: d,
            templateId: "easy_30",
            type: "easy",
            weekStart,
          })));
        } else {
          remaining.forEach((d) => week.push(buildRunDayV2({
            dayIndex: d,
            templateId: "easy_30",
            type: "easy",
            weekStart,
          })));
        }
      } else {
        // Race week: 1 shakeout (the long slot already has the race),
        // rest easy
        remaining.forEach((d) => week.push(buildRunDayV2({
          dayIndex: d,
          templateId: "easy_30",
          type: "easy",
          weekStart,
        })));
      }
    }

    weeks.push(week.sort((a, b) => a.dayIndex - b.dayIndex));
  }

  return { totalWeeks, compressed, weeks };
}

/** Race template IDs by distance. Centralised to avoid scattering
 *  string literals through the scheduler. Each distance maps to
 *  its own race template in RUN_TEMPLATES — pre-PR-0a this
 *  fallback returned "5k_race" for every distance, which
 *  collapsed 10K / half / marathon race days to a 5K prefill. */
function pickRaceTemplateId(distance: "5k" | "10k" | "half" | "marathon"): string {
  switch (distance) {
    case "5k": return "5k_race";
    case "10k": return "10k_race";
    case "half": return "half_race";
    case "marathon": return "marathon_race";
  }
}
