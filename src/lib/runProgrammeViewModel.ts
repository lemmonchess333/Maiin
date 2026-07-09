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

// R4: the surface resolver + its types now live in `runPlanResolver`, which
// reconciles the profile↔programState race-goal drift. The old copy here gated
// the overlay on `programState.runPlan.raceGoal` alone while mode came from
// `profile.runMode`, so a transient store disagreement (profile written,
// mirror not yet regenerated) dropped the race overlay for a race-prep user.
// Re-exported so existing importers of `@/lib/runProgrammeViewModel` are
// transparently upgraded to the reconciliation-aware version.
export {
  resolveRunPlanSurface,
  type RunPlanSurfaceKind,
  type RunPlanSurfaceState,
} from "@/lib/runPlanResolver";

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
/**
 * Hybrid interference (2026-07 audit quick-fix): the run scheduler already
 * prefers non-Both slots for the hardest run, but accepts the pairing when
 * only Both slots exist — with the explicit note "the UI can flag it"
 * (runScheduler.ts). This is that flag: a QUALITY run (tempo / intervals /
 * long) sharing a day with a lift is worth a heads-up. Easy runs coexist
 * fine; race day has its own treatment and is deliberately excluded (race
 * day is race day — nagging it would be noise).
 */
export function hasHybridInterference(args: {
  hasLift: boolean;
  runType: "easy" | "tempo" | "intervals" | "long" | "race" | null | undefined;
}): boolean {
  if (!args.hasLift || !args.runType) return false;
  return (
    args.runType === "tempo" ||
    args.runType === "intervals" ||
    args.runType === "long"
  );
}

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
