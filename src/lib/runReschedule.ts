import { HARD_RUN_TYPES } from "@/features/program/programTypes";
import type { ScheduledRunDay } from "@/features/program/programTypes";
import {
  parseLocalDate,
  addLocalDays,
  localDateString,
} from "@/lib/dateHelpers";
import { isScheduledRaceRunDay } from "@/lib/workoutTemplates";
import {
  getScheduledRunStatus,
  isScheduledRunEditable,
} from "@/lib/scheduledRunStatus";

/**
 * RUN-RESCHEDULE-01 — pure logic for the one-off "move a scheduled run to
 * another day within the same generated Sunday-start week" feature.
 *
 * Locked invariants (from the audit): the stable `id`, `templateId`,
 * `userOverride`, `status`, completion truth, race identity (`type`), the
 * `manualCompletions` map, and the ORIGINAL first-scheduled date all survive
 * a move. Only the instance `date` + `dayIndex` and the truthful clash
 * metadata change; returning to the origin clears the move markers. This
 * module owns the "which days are legal targets" decision and the field
 * patch; the writer (`moveRunDay`) just applies it. Nothing here mutates the
 * recurring `weekSchedule` or regenerates the plan.
 */

type WeekScheduleDay = { day: number; type: "lift" | "run" | "both" | "rest" };

/** Why a candidate destination day can't accept the move. */
export type MoveBlockReason =
  | "same" // the run's current day — a no-op
  | "past" // earlier than today — you can't reschedule into the past
  | "occupied" // another run already sits on this day
  | "race" // a race is anchored on this day — its date is immutable
  | "post_race" // after the week's race — can't train past the event
  | "malformed"; // can't resolve a date for this day

/** A selectable-but-flagged destination (the move is allowed with a trade-off). */
export type MoveWarning =
  | "clashes_lift" // a hard run onto a lift day
  | "beside_hard"; // a hard run immediately next to another hard run

export interface RunMoveOption {
  dayIndex: number;
  /** Local YYYY-MM-DD of this day in the run's week ("" when malformed). */
  date: string;
  available: boolean;
  blockReason?: MoveBlockReason;
  /** Present on an available day that carries a coaching trade-off. */
  warning?: MoveWarning;
}

export interface RunMovePatch {
  date: string;
  dayIndex: number;
  /** The original first-scheduled date; omitted when snapping back to origin. */
  movedFromDate?: string;
  /** The new instance date; omitted when snapping back to origin. */
  movedToDate?: string;
  clashesWithLift: boolean;
}

/** Only a planned, non-race slot can be moved. Terminal (completed_* /
 *  skipped / race_no_show) and race slots are immovable. */
export function canRescheduleRun(source: ScheduledRunDay): boolean {
  if (isScheduledRaceRunDay(source)) return false;
  return isScheduledRunEditable(getScheduledRunStatus(source));
}

/** The date a run snaps back to — its original first-scheduled date. Once
 *  moved, `movedFromDate` holds that origin; before any move it's `date`. */
export function runOriginDate(source: ScheduledRunDay): string {
  return source.movedFromDate ?? source.date ?? "";
}

function dateForDay(weekKey: string, dayIndex: number): string | null {
  try {
    return localDateString(addLocalDays(parseLocalDate(weekKey), dayIndex));
  } catch {
    return null;
  }
}

/**
 * Classify every day of the run's week as a move target. `todayKey` is
 * passed in (not read from the clock) so this stays pure/testable.
 */
export function resolveRunMoveOptions(args: {
  source: ScheduledRunDay;
  runDays: ScheduledRunDay[];
  weekSchedule: WeekScheduleDay[];
  todayKey: string;
}): RunMoveOption[] {
  const { source, runDays, weekSchedule, todayKey } = args;
  const weekKey = source.weekKey;
  const sourceHard = HARD_RUN_TYPES.has(source.type);

  // Earliest race date in this week, if any — you can't schedule past it.
  const raceDate = runDays
    .filter((rd) => isScheduledRaceRunDay(rd) && typeof rd.date === "string")
    .map((rd) => rd.date)
    .sort()[0];

  const typeForDay = (dayIndex: number) =>
    weekSchedule.find((d) => d.day === dayIndex)?.type ?? "rest";

  return Array.from({ length: 7 }, (_, dayIndex): RunMoveOption => {
    if (!weekKey) {
      return { dayIndex, date: "", available: false, blockReason: "malformed" };
    }
    const date = dateForDay(weekKey, dayIndex);
    if (date === null) {
      return { dayIndex, date: "", available: false, blockReason: "malformed" };
    }
    if (dayIndex === source.dayIndex) {
      return { dayIndex, date, available: false, blockReason: "same" };
    }
    if (date < todayKey) {
      return { dayIndex, date, available: false, blockReason: "past" };
    }
    // Another run already occupies this day — a race takes precedence in the
    // reason (its date is immutable), otherwise it's a plain occupancy block.
    const other = runDays.find(
      (rd) => rd.id !== source.id && rd.dayIndex === dayIndex
    );
    if (other) {
      return {
        dayIndex,
        date,
        available: false,
        blockReason: isScheduledRaceRunDay(other) ? "race" : "occupied",
      };
    }
    if (raceDate && date > raceDate) {
      return { dayIndex, date, available: false, blockReason: "post_race" };
    }

    // Available — but a hard run may carry a coaching trade-off.
    let warning: MoveWarning | undefined;
    if (sourceHard) {
      const dayType = typeForDay(dayIndex);
      if (dayType === "lift" || dayType === "both") {
        warning = "clashes_lift";
      } else if (
        runDays.some(
          (rd) =>
            rd.id !== source.id &&
            HARD_RUN_TYPES.has(rd.type) &&
            Math.abs(rd.dayIndex - dayIndex) === 1
        )
      ) {
        warning = "beside_hard";
      }
    }
    return { dayIndex, date, available: true, warning };
  });
}

/**
 * The field patch for moving `source` to `targetDayIndex` within its week.
 * Returns null when the date can't be resolved. Preserves the original
 * first-scheduled date across repeated moves, and clears the move markers
 * when snapping back to origin. Recomputes `clashesWithLift` so the
 * consumers that count clashes (raceGoalPlanner, dayIntensity) stay correct.
 */
export function computeRunMove(
  source: ScheduledRunDay,
  targetDayIndex: number,
  weekSchedule: WeekScheduleDay[]
): RunMovePatch | null {
  const weekKey = source.weekKey;
  if (!weekKey) return null;
  const date = dateForDay(weekKey, targetDayIndex);
  if (date === null) return null;

  const origin = runOriginDate(source);
  const returnToOrigin = date === origin;
  const dayType =
    weekSchedule.find((d) => d.day === targetDayIndex)?.type ?? "rest";
  const clashesWithLift =
    HARD_RUN_TYPES.has(source.type) &&
    (dayType === "both" || dayType === "lift");

  return {
    date,
    dayIndex: targetDayIndex,
    movedFromDate: returnToOrigin ? undefined : origin,
    movedToDate: returnToOrigin ? undefined : date,
    clashesWithLift,
  };
}
