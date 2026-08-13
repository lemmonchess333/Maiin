/**
 * Run programme view model — pure, testable derivation for the
 * Programme Run cockpit primitives (RaceCockpitCard, SessionCommandCard,
 * ProgrammeWeekSelector / DayActionSheet).
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

import type { RunTemplate } from "@/lib/workoutTemplates";
import {
  getRacePhaseLabel,
  isCurrentWeekInTaper,
} from "@/features/program/runScheduler";
import { parseLocalDate } from "@/lib/dateHelpers";

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
 * Compact run label for the week-selector day cell. Full names truncate
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
      const km = template.config.targetDistanceKm;
      return km ? `${km}K` : "Long";
    }
    case "race":
      return "Race";
    default:
      return template.name;
  }
}

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

export interface RaceCockpitViewModel {
  /** Readable distance — "Marathon". */
  distanceLabel: string;
  /** Optional user-entered event name ("London Marathon 2026"); null when
   *  the user hasn't named the race — the card falls back to the distance
   *  heading. */
  eventName?: string | null;
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
  /** The plan fell below the taper-safe floor, so its weeks are the
   *  finish-safely shape — all easy, no hard sessions. `belowFloor` implies
   *  `compressed`, but the two must be surfaced DIFFERENTLY: the compressed
   *  copy says "interval work is trimmed and the long-run build is packed
   *  into fewer weeks", and a below-floor plan has neither intervals nor a
   *  long-run build (measured 2026-08-04: a marathon 3 weeks out emits
   *  `easy_30` x3 in every non-race week). Carrying only `compressed` to the
   *  cockpit means that plan describes training it does not contain.
   *
   *  STATUS 2026-08-13 — this comment, and the matching one at the section's
   *  read site, were both written in the past tense while the bug was still
   *  live: the field reached the section but was never passed to
   *  RaceCockpitCard, so the card fell through to the compressed branch for
   *  every below-floor plan. Now wired, and pinned by a section-level test
   *  rather than a card-level one (the card's own suite passes the prop
   *  directly, which is what let the gap survive).
   *
   *  The quoted copy above was also stale: it cited "the long-run
   *  progression shortened", wording RUN-EV-05 replaced because it described
   *  the compressed band backwards. Requoted from the live string. */
  belowFloor: boolean;
}

/**
 * Build the race-cockpit view model. Returns null when there's no race
 * goal (caller should not render the cockpit). `todayKey` is passed in
 * for a deterministic countdown.
 */
export function buildRaceCockpitViewModel(args: {
  raceGoal:
    | { distance: string; targetDate: string; eventName?: string }
    | null
    | undefined;
  currentWeek: number | null | undefined;
  totalWeeks: number | null | undefined;
  compressed: boolean;
  /** Optional so existing callers compile; absent reads as false, which is
   *  the correct degenerate answer — a caller that does not know cannot claim
   *  the plan is below the floor. */
  belowFloor?: boolean;
  todayKey: string;
}): RaceCockpitViewModel | null {
  const {
    raceGoal,
    currentWeek,
    totalWeeks,
    compressed,
    belowFloor = false,
    todayKey,
  } = args;
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
    eventName: raceGoal.eventName ?? null,
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
    belowFloor,
  };
}
