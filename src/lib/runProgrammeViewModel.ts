/**
 * Run programme view model — pure, testable derivation for the
 * Programme Run cockpit primitives (RaceCockpitCard, SessionCommandCard,
 * HybridWeekRail).
 *
 * Locked model (Run9a): freeform is the always-on substrate and a RACE
 * GOAL is the only active "plan" overlay. There is NO user-facing
 * freeform / structured / race_prep toggle. This module models the Run
 * surface as exactly two states:
 *
 *   { kind: "freeform" }                  — base state, no race goal
 *   { kind: "race_goal"; race: ... }      — race-goal overlay active
 *
 * Everything here is a pure function of (profile, programState, claimMap,
 * date keys). No React, no hooks, no `new Date()` reads — callers pass
 * the local date keys in so the output is deterministic and unit-testable.
 */

import { RUN_TEMPLATES, type RunTemplate } from "@/lib/workoutTemplates";
import { DAY_LABELS_SHORT } from "@/lib/scheduleUtils";
import {
  resolveTrainingDayForDate,
  type LiftSlotStatus,
} from "@/lib/trainingResolver";
import {
  getCompletionKind,
  type ClaimState,
} from "@/lib/scheduledRunCompletion";
import {
  getRacePhaseLabel,
  isCurrentWeekInTaper,
} from "@/features/program/runScheduler";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";

export type RunPlanSurfaceKind = "freeform" | "race_goal";

/** The two-state surface model. The race-goal overlay carries its own
 *  sub-states (race-today, recovery, no-show) but those are resolved by
 *  the consuming component — this is the top-level branch only. */
export type RunPlanSurfaceState =
  | { kind: "freeform"; hasRaceGoal: false }
  | { kind: "race_goal"; hasRaceGoal: true };

/**
 * Two-state resolver. A race overlay is active when the user is in
 * race_prep mode AND a race goal is present (matches every gated read of
 * `raceGoal` in ProgrammeRunSection). Everything else — including a
 * legacy structured user mid-migration — collapses to freeform.
 */
export function resolveRunPlanSurface(
  profile: Pick<UserProfile, "runMode"> | null | undefined,
  programState: ProgramState | null | undefined
): RunPlanSurfaceState {
  const raceGoal = programState?.runPlan?.raceGoal;
  if (profile?.runMode === "race_prep" && raceGoal) {
    return { kind: "race_goal", hasRaceGoal: true };
  }
  return { kind: "freeform", hasRaceGoal: false };
}

type RaceDistance = "5k" | "10k" | "half" | "marathon";

/** Readable race distance — "Marathon", not "MARATHON" or "marathon". */
export function raceDistanceLabel(distance: string): string {
  switch (distance) {
    case "5k":
      return "5K";
    case "10k":
      return "10K";
    case "half":
      return "Half Marathon";
    case "marathon":
      return "Marathon";
    default:
      return distance;
  }
}

/**
 * Compact run label for the HybridWeekRail tile. Full names truncate
 * badly in a 7-column grid, so each template collapses to a short,
 * glanceable token. The full name still appears in the DayCommandSheet.
 *
 *   Easy 30          → 30m
 *   20 Min Tempo     → Tempo
 *   5×1K Intervals   → 5×1K
 *   8×400m Speed     → 8×400
 *   Long 10K         → 10K
 *   Long 15K         → 15K
 *   Marathon Race    → Race
 */
export function compactRunLabel(
  template: RunTemplate | null | undefined
): string {
  if (!template) return "Run";
  switch (template.type) {
    case "easy":
      return `${template.estimatedDuration}m`;
    case "tempo":
      return "Tempo";
    case "intervals":
      // "5×1K Intervals" → "5×1K"; "8×400m Speed" → "8×400". Take the
      // leading "N×D" token off the name (up to the first space) and drop a
      // trailing metre unit so it fits the rail tile alongside "5×1K".
      return (template.name.split(" ")[0] ?? "Intervals").replace(/m$/, "");
    case "long": {
      const km = template.config.targetDistance;
      return km ? `${km}K` : "Long";
    }
    case "race":
      return "Race";
    default:
      return template.name;
  }
}

/** Compact lift label — strip the qualifier after an em/en dash or middot
 *  ("Push — Chest Focus" → "Push") and cap length so it fits a tile. */
export function compactLiftLabel(dayName: string | null | undefined): string {
  if (!dayName) return "Lift";
  const head = dayName.split(/[—–·-]/)[0]?.trim() || dayName.trim();
  return head.length > 8 ? `${head.slice(0, 7)}…` : head;
}

function templateForRunDay(
  templateId: string | undefined,
  userOverride: string | undefined
): RunTemplate | null {
  const id = userOverride || templateId;
  if (!id) return null;
  return RUN_TEMPLATES.find((t) => t.id === id) ?? null;
}

export interface RaceCockpitViewModel {
  /** Readable distance — "Marathon". */
  distanceLabel: string;
  /** Local target date "YYYY-MM-DD" (formatted by the card). */
  targetDate: string;
  daysToRace: number;
  /** Stored 0-based week index. */
  currentWeek: number | null;
  totalWeeks: number | null;
  /** "Base" | "Build" | "Taper" | "Race" (null when no progress). The engine
   *  (getPhaseForWeek) never emits a "Peak" phase — the rail is Base→Build→
   *  Taper→Race. */
  phaseLabel: string | null;
  inTaper: boolean;
  compressed: boolean;
}

/**
 * Build the race-cockpit view model. Returns null when there's no race
 * goal (caller should not render the cockpit). `todayKey` is passed in
 * for a deterministic countdown.
 */
export function buildRaceCockpitViewModel(args: {
  raceGoal: { distance: string; targetDate: string } | null | undefined;
  currentWeek: number | null | undefined;
  totalWeeks: number | null | undefined;
  compressed: boolean;
  todayKey: string;
}): RaceCockpitViewModel | null {
  const { raceGoal, currentWeek, totalWeeks, compressed, todayKey } = args;
  if (!raceGoal) return null;
  const distance = raceGoal.distance as RaceDistance;

  let daysToRace = 0;
  try {
    const target = parseLocalDate(raceGoal.targetDate);
    const today = parseLocalDate(todayKey);
    daysToRace = Math.max(
      0,
      Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
    );
  } catch {
    daysToRace = 0;
  }

  const hasProgress = currentWeek != null && totalWeeks != null;
  const phaseLabel = hasProgress
    ? getRacePhaseLabel(currentWeek!, totalWeeks!, distance)
    : null;

  return {
    distanceLabel: raceDistanceLabel(raceGoal.distance),
    targetDate: raceGoal.targetDate,
    daysToRace,
    currentWeek: currentWeek ?? null,
    totalWeeks: totalWeeks ?? null,
    phaseLabel,
    inTaper: isCurrentWeekInTaper(
      currentWeek ?? undefined,
      totalWeeks ?? undefined,
      distance
    ),
    compressed,
  };
}

export type HybridRunStatus =
  | "planned"
  | "done"
  | "manual"
  | "skipped"
  | "race_no_show";
export type HybridLiftStatus = "planned" | "done" | "skipped";

export interface HybridWeekRailItem {
  dateKey: string;
  dayIndex: number;
  dayLabel: string;
  isToday: boolean;
  run?: {
    title: string;
    shortLabel: string;
    status: HybridRunStatus;
    isRace: boolean;
  };
  lift?: {
    title: string;
    shortLabel: string;
    status: HybridLiftStatus;
  };
}

function mapLiftStatus(status: LiftSlotStatus): HybridLiftStatus {
  if (status === "completed") return "done";
  if (status === "skipped") return "skipped";
  return "planned";
}

/**
 * Build the 7-day hybrid rail items (run lane + lift lane per day).
 *
 * Anchored on `anchorWeekKey` (the week the runDays were generated for,
 * or today's week for a lift-only week) so it doesn't drift past
 * midnight. Reuses `resolveTrainingDayForDate` — the same source of
 * truth Home and the DayCommandSheet use — so the rail agrees with every
 * other surface about what's scheduled.
 *
 * Crucially this does NOT invent runs for freeform users: the run lane is
 * populated only from `programState.runDays`, which is empty for freeform.
 */
export function buildHybridWeekItems(args: {
  profile: UserProfile | null;
  programState: ProgramState | null;
  claimMap: Map<string, ClaimState>;
  currentWeekKey: string;
  todayKey: string;
  anchorWeekKey: string;
}): HybridWeekRailItem[] {
  const {
    profile,
    programState,
    claimMap,
    currentWeekKey,
    todayKey,
    anchorWeekKey,
  } = args;
  const weekStart = parseLocalDate(anchorWeekKey);

  return Array.from({ length: 7 }, (_unused, dayIndex) => {
    const date = addLocalDays(weekStart, dayIndex);
    const dateKey = localDateString(date);
    const resolved = resolveTrainingDayForDate({
      dateKey,
      profile,
      programState,
      currentWeekKey,
      claimMap,
    });

    const item: HybridWeekRailItem = {
      dateKey,
      dayIndex,
      dayLabel: DAY_LABELS_SHORT[dayIndex],
      isToday: dateKey === todayKey,
    };

    const runDay = resolved.run.runDay;
    if (runDay) {
      const template = templateForRunDay(
        runDay.templateId,
        runDay.userOverride
      );
      const isRace = template?.type === "race";
      let status: HybridRunStatus;
      if (resolved.run.isCompleted) {
        const kind = runDay.id
          ? getCompletionKind(runDay.id, claimMap)
          : "real";
        status = kind === "manual" ? "manual" : "done";
      } else if (resolved.run.status === "skipped") {
        status = "skipped";
      } else if (resolved.run.status === "race_no_show") {
        status = "race_no_show";
      } else {
        status = "planned";
      }
      item.run = {
        title: template?.name ?? "Run",
        shortLabel: compactRunLabel(template),
        status,
        isRace,
      };
    }

    const liftWorkout = resolved.lift.workout;
    if (liftWorkout && resolved.lift.index !== null) {
      item.lift = {
        title: liftWorkout.dayName || "Lift",
        shortLabel: compactLiftLabel(liftWorkout.dayName),
        status: mapLiftStatus(resolved.lift.status),
      };
    }

    return item;
  });
}
