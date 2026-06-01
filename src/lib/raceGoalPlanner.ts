/**
 * Race Goal Planner — pure derivation of the pre-save preview shown in the
 * Programme Settings race-prep editor (see RaceGoalPlanner.tsx).
 *
 * The editor used to take a distance + target date and save with only a
 * future-date check. This helper answers, BEFORE save, what that date means
 * for the plan: how many weeks out, whether that's healthy / compressed /
 * too-tight for the distance, the first-week phase, the weekly structure the
 * engine will build, and post-race recovery.
 *
 * SINGLE SOURCE OF TRUTH — every number here is read from the SAME engine the
 * save commits. `planBuilder.buildRunPlan` calls `generateRacePlanV2` with
 * `weekStart = localWeekKey(parseLocalDate(currentDate))` and the same
 * `currentDate`; this helper mirrors that derivation exactly, so the preview's
 * weeks / compressed / belowFloor match the saved plan. The status is taken
 * straight from the engine's own `compressed` / `belowFloor` booleans rather
 * than a parallel re-classification.
 *
 * No medical warnings, no performance promises (Run9 / design system).
 */
import { generateSchedule } from "./scheduleUtils";
import { localWeekKey, parseLocalDate } from "./dateHelpers";
import {
  generateRacePlanV2,
  getRaceMinWeeks,
  getRaceFloorWeeks,
  recoveryWeeksForDistance,
  getRacePhaseLabel,
} from "@/features/program/runScheduler";
import { raceDistanceLabel } from "./runProgrammeViewModel";

export type RaceDistance = "5k" | "10k" | "half" | "marathon";

/**
 * Five states, not four. `below-floor` (finish-safely) is DISTINCT from
 * `compressed`: below the taper-safe floor, compress-to-keep-date stops being
 * the safe default and the plan becomes mostly-easy "finish safely". `empty`
 * and `invalid` are UI-only states the engine never sees.
 */
export type RacePlannerStatus =
  | "empty"
  | "invalid"
  | "healthy"
  | "compressed"
  | "below-floor";

export interface RaceGoalPlannerInput {
  distance: RaceDistance;
  /** Local "YYYY-MM-DD"; "" when no date chosen yet. */
  targetDate: string;
  /** Local "YYYY-MM-DD" — injected for determinism, never read from wall clock here. */
  currentDate: string;
  liftDays: number;
  weeklyRunDays: number;
}

export interface RaceGoalPlannerState {
  status: RacePlannerStatus;
  /** Natural (unclamped) weeks until the race, for display. 0 on race day. */
  weeksOut: number;
  /** Calendar days until the race, for display. 0 on race day. */
  daysOut: number;
  /** Ideal build length for this distance (5k=4, 10k=6, half=8, marathon=12). */
  idealWeeks: number;
  /** Taper-safe floor for this distance (5k=2, 10k=2, half=3, marathon=4). */
  floorWeeks: number;
  /** "5K" | "10K" | "Half Marathon" | "Marathon". */
  distanceLabel: string;
  /** Phase of week 0 ("Base" for healthy plans). "" for empty/invalid. */
  firstWeekPhase: string;
  /** Run days the plan will build (= the engine's first-week run count). */
  recommendedRunDays: number;
  /** Lift+run days that share a calendar day (liftDays + runDays - 7). */
  doubleDays: number;
  /** Hard runs (long/tempo/intervals/race) the engine flags as clashing with a lift day, in week 0. */
  hardClashDays: number;
  /** Post-race easy weeks (5k=1, 10k=2, half=3, marathon=4). */
  recoveryWeeks: number;
  compressed: boolean;
  belowFloor: boolean;
  statusTitle: string;
  statusDescription: string;
  /** Status-aware save CTA; "" for empty/invalid (editor keeps "Fix race date"). */
  ctaLabel: string;
}

/**
 * Compute the planner preview for the current draft inputs. Pure — safe to call
 * from a useMemo on every keystroke.
 */
export function getRaceGoalPlannerState(
  input: RaceGoalPlannerInput
): RaceGoalPlannerState {
  const { distance, targetDate, currentDate, liftDays, weeklyRunDays } = input;

  // Distance-only fields are valid in every state (no date needed).
  const distanceLabel = raceDistanceLabel(distance);
  const idealWeeks = getRaceMinWeeks(distance);
  const floorWeeks = getRaceFloorWeeks(distance);
  const recoveryWeeks = recoveryWeeksForDistance(distance);
  const doubleDays = Math.max(0, liftDays + weeklyRunDays - 7);

  const emptyBase: RaceGoalPlannerState = {
    status: "empty",
    weeksOut: 0,
    daysOut: 0,
    idealWeeks,
    floorWeeks,
    distanceLabel,
    firstWeekPhase: "",
    recommendedRunDays: weeklyRunDays,
    doubleDays,
    hardClashDays: 0,
    recoveryWeeks,
    compressed: false,
    belowFloor: false,
    statusTitle: "",
    statusDescription: "Choose your race date to preview the plan.",
    ctaLabel: "",
  };

  // ── State A — no date chosen.
  if (!targetDate) return emptyBase;

  // ── State B — past date (mirrors ProgrammeSettings `raceDateInvalid`:
  // past-or-empty only, so a date == currentDate is VALID and falls through).
  if (targetDate < currentDate) {
    return {
      ...emptyBase,
      status: "invalid",
      statusDescription: "Pick a future race date.",
    };
  }

  // Truthful display values (natural, unclamped). The engine clamps totalWeeks
  // to a floor of 2, so we never surface that as the headline.
  const now = parseLocalDate(currentDate);
  const target = parseLocalDate(targetDate);
  const daysOut = Math.max(
    0,
    Math.round((target.getTime() - now.getTime()) / 86400000)
  );
  const weeksOut = Math.ceil(daysOut / 7);

  // Build the plan through the SAME engine + derivation the save path uses.
  const weekSchedule = generateSchedule(liftDays, weeklyRunDays);
  const weekStart = localWeekKey(now);
  const plan = generateRacePlanV2({
    weekSchedule,
    raceGoal: { distance, targetDate },
    weeklyRunDays,
    currentDate,
    weekStart,
  });

  // Status straight from the engine's own booleans (belowFloor ⊂ compressed).
  const status: RacePlannerStatus = plan.belowFloor
    ? "below-floor"
    : plan.compressed
      ? "compressed"
      : "healthy";

  const firstWeek = plan.weeks.find((w) => w.length > 0) ?? [];
  const recommendedRunDays = firstWeek.length || weeklyRunDays;
  const week0 = plan.weeks[0] ?? [];
  const hardClashDays = week0.filter((rd) => rd.clashesWithLift).length;
  const firstWeekPhase = getRacePhaseLabel(0, plan.totalWeeks, distance);

  const lower = distanceLabel.toLowerCase();
  let statusTitle: string;
  let statusDescription: string;
  let ctaLabel: string;
  if (status === "healthy") {
    statusTitle = "Good runway";
    statusDescription = `Full Base → Build → Taper → Race progression for your ${lower}.`;
    ctaLabel = "Save race plan";
  } else if (status === "compressed") {
    statusTitle = "Short runway";
    statusDescription =
      "Tropos will compress the plan — fewer hard sessions, a shorter long-run progression.";
    ctaLabel = "Save compressed plan";
  } else {
    statusTitle = "Very tight";
    statusDescription = `Too soon for a full ${lower} build. Tropos can create a finish-safely plan — mostly easy running, no hard sessions.`;
    ctaLabel = "Save finish-safely plan";
  }

  return {
    status,
    weeksOut,
    daysOut,
    idealWeeks,
    floorWeeks,
    distanceLabel,
    firstWeekPhase,
    recommendedRunDays,
    doubleDays,
    hardClashDays,
    recoveryWeeks,
    compressed: plan.compressed,
    belowFloor: plan.belowFloor,
    statusTitle,
    statusDescription,
    ctaLabel,
  };
}
