/** Saved race-row reconciliation. The load path repairs current-week template
 * mismatches; auto-rollover owns older weeks and their history. Callers carry
 * completions and the original block's week count through regeneration. */

import {
  localWeekKey,
  parseLocalDate,
  startOfLocalWeek,
} from "@/lib/dateHelpers";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  raceCalendarWeeks,
  getPhaseForWeek,
  getRaceMinWeeks,
} from "@/features/program/runPlanTiming";
import type { ScheduledRunDay } from "@/features/program/programTypes";
import type { ScheduleDay } from "@/lib/scheduleUtils";

type RaceDistance = "5k" | "10k" | "half" | "marathon";

/** True when this runDay resolves to a race-type template. Mirrors the
 *  canonical id-agnostic gate (`type === "race"`), never `templateId ===
 *  "race"` (real ids are `5k_race` … `marathon_race`). */
function isRaceRunDay(rd: ScheduledRunDay): boolean {
  const id = rd.userOverride || rd.templateId;
  return RUN_TEMPLATES.find((t) => t.id === id)?.type === "race";
}

export interface RaceRunDaysStaleArgs {
  /** Stored `programState.runDays`. */
  runDays: ScheduledRunDay[] | undefined;
  /** Canonical race goal (from `profile.raceGoal` / `runPlan.raceGoal`). */
  raceGoal: { distance: string; targetDate: string } | null | undefined;
  /** User weekly schedule — drives the fresh generation comparison. */
  weekSchedule: ScheduleDay[];
  /** Runs-per-week target. */
  weeklyRunDays: number;
  /** Local "YYYY-MM-DD" for today (injected for determinism). */
  todayKey: string;
}

/**
 * Decide whether an active race plan's stored `runDays` are stale and need
 * regenerating for the current week. Pure — no Firestore, no `new Date()`.
 *
 * Returns false (not stale) when there's no race goal, no runDays, or the
 * stored week already matches a fresh today-anchored generation.
 */
export function areRaceRunDaysStale(args: RaceRunDaysStaleArgs): boolean {
  const { runDays, raceGoal, weekSchedule, todayKey } = args;
  if (!raceGoal) return false;
  if (!runDays || runDays.length === 0) return false;

  const thisWeekKey = localWeekKey(parseLocalDate(todayKey));

  // (a) Anchor drift — the cheap, common signal. runDays were generated
  // for a week other than the current one and never rolled forward.
  const storedWeekKey = runDays[0]?.weekKey;
  if (storedWeekKey && storedWeekKey !== thisWeekKey) return true;

  // (b) Phase/template mismatch — generate THIS week fresh and compare the
  // race-template presence. If the stored week and the fresh week disagree
  // on whether this is a race week, the stored content drifted (the
  // "race in base week 1" signature).
  // The scheduler places a race in the final calendar week whenever there
  // is at least one run slot. Share its timing calculation instead of
  // generating every session merely to read that fact.
  const totalWeeks = raceCalendarWeeks(
    startOfLocalWeek(parseLocalDate(todayKey)),
    parseLocalDate(raceGoal.targetDate)
  );
  const hasRunSlot = weekSchedule.some(
    (day) => day.type === "run" || day.type === "both"
  );
  const storedHasRace = runDays.some(isRaceRunDay);
  const freshHasRace =
    hasRunSlot &&
    getPhaseForWeek(0, totalWeeks, raceGoal.distance as RaceDistance) ===
      "race";
  return storedHasRace !== freshHasRace;
}

/** The honest 0-based week index for a race plan today, clamped to
 *  `[0, totalWeeks - 1]`. Replaces a stale stored `currentWeek` that
 *  drifted out of sync with `runDays`.
 *
 *  Derivation, in the scheduler's own week-index space: a fresh plan's
 *  `weeks[0]` is the week containing today and the race sits in
 *  `weeks[totalWeeks - 1]`, so the race's index is the number of whole
 *  calendar weeks between this week's first day and the race's, and the
 *  current index is `totalWeeks - 1 - raceWeekIndex`. That is 0 for any
 *  race still ahead of this week and 0 on race week itself. Before this it was
 *  `totalWeeks - ceil((raceDate - today) / 7d)`, which agreed with the
 *  scheduler only while `totalWeeks` was ALSO counted from today; now that
 *  the scheduler sizes the block from the week's first day the two counts
 *  differ by one whenever today sits later in its week than the race does
 *  in its own, and the subtraction reported a phantom week 1 for a plan
 *  created that morning. */
export function honestRaceWeekIndex(args: {
  raceGoal: { distance: string; targetDate: string };
  todayKey: string;
}): { currentWeek: number; totalWeeks: number } {
  const { raceGoal, todayKey } = args;
  const totalWeeks = raceCalendarWeeks(
    startOfLocalWeek(parseLocalDate(todayKey)),
    parseLocalDate(raceGoal.targetDate)
  );

  const raceWeekStart = startOfLocalWeek(parseLocalDate(raceGoal.targetDate));
  const thisWeekStart = startOfLocalWeek(parseLocalDate(todayKey));
  // Calendar days between the two local midnights (a DST hour would
  // otherwise sit inside the rounding), then whole weeks.
  const utcDay = (d: Date) =>
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const raceWeekIndex = Math.max(
    0,
    Math.round((utcDay(raceWeekStart) - utcDay(thisWeekStart)) / 86_400_000) / 7
  );
  const currentWeek = Math.max(
    0,
    Math.min(totalWeeks - 1, totalWeeks - 1 - raceWeekIndex)
  );
  return { currentWeek, totalWeeks };
}

/**
 * Convenience: does this plan still have a usable build (race in the
 * future)? When the race date is in the past, reconciliation should NOT
 * regenerate a "current week" — the elapsed-race / no-show / recovery
 * machinery owns that case. The caller gates on this so reconciliation
 * only fires for live, future-dated plans.
 */
export function raceIsInFuture(
  raceGoal: { targetDate: string } | null | undefined,
  todayKey: string
): boolean {
  if (!raceGoal) return false;
  try {
    return raceGoal.targetDate > todayKey; // YYYY-MM-DD lexicographic == chronological
  } catch {
    return false;
  }
}

/** Re-export the minimum-build helper so callers/tests can reason about
 *  whether a reconciled plan is compressed. Thin pass-through. */
export function raceMinWeeks(distance: string): number {
  return getRaceMinWeeks(distance as RaceDistance);
}
