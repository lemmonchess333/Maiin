/**
 * A long run's race-pace finish (A2, Run21 (2)): whether a planned long run
 * closes at the goal race pace, and how much of it. One gate, for the
 * launch (`runPlanMetadata`'s prefill, which builds the run's segments from
 * it) and for every surface that names the run before it starts: Home's
 * cards, Train's card, the day sheet and the launch card.
 *
 * It sits apart from `runPlanMetadata` so Home can read it without loading
 * the segment builders and their cue copy.
 */
import { getPhaseForWeek } from "@/features/program/runPlanTiming";
import type { RunPlan } from "@/features/program/runScheduler";
import {
  paceTableFromFitness,
  raceTargetBand,
  vdotFromRace,
  type RunFitnessInput,
} from "./runPaces";
import type { RunTemplate } from "./workoutTemplates";

/**
 * A2 — the user's race goal WITH a target time, from `profile.raceGoal`.
 * When present (and the plan is race-prep, half/marathon, in the right
 * phase), the goal time turns into training: race-pace blocks closing
 * build-phase long runs, and tempo sessions run at goal pace through build
 * and taper.
 */
export interface RaceTarget {
  distance: "5k" | "10k" | "half" | "marathon";
  targetTimeS: number;
  /**
   * A2 feasibility gate — the runner's current VDOT from the FULL
   * fitness read (`paceTableFromFitness(...)?.vdot`), the same tier the
   * verdict surface uses, so the verdict's "long shot" and this gate's
   * "decline the pace" can never disagree for the same user. When the
   * gap lands `long_shot` on the shared band scale, enrichment is
   * withheld entirely (Daniels: train from current fitness, not
   * aspiration — Garmin Coach refuses such targets outright). Null /
   * absent = no benchmark = nothing to judge the goal against, so the
   * goal pace stands (Runna's cold-start behaviour).
   */
  currentVdot?: number | null;
}

/**
 * A2 — the resolved "train at your goal pace" context. Non-null only when
 * ALL of these hold: race-prep mode, a half/marathon goal with a target
 * time, a live plan (not recovery), and week/total counts to place the
 * phase. 5k/10k goals never enrich — their goal pace is faster than
 * threshold, so it belongs in interval work (Daniels), not in tempo
 * sessions or long-run blocks; prescribing it there would be wrong in
 * both directions.
 *
 * Consent note (RUN-EV-08): the goal pace derives from the USER'S OWN
 * declared target time, not from an auto-derived benchmark — consented
 * by construction, so no `pendingConfirmation` gate applies here.
 */
export interface RaceEnrichment {
  distance: "half" | "marathon";
  /** s/km — targetTimeS spread over the race distance. */
  goalPaceS: number;
  phase: "base" | "build" | "taper" | "race";
}

/** Physical race distances, km. Mirrors raceGoalPlanner's DISTANCE_METERS —
 *  physical constants, not business logic; only the enriching distances. */
const RACE_GOAL_KM = { half: 21.0975, marathon: 42.195 } as const;

export function resolveRaceEnrichment(
  /** The profile's run mode: only a race plan enriches. */
  planMode: string,
  target: RaceTarget | null | undefined,
  plan: RunPlan | null | undefined
): RaceEnrichment | null {
  if (planMode !== "race_prep" || !target || !plan) return null;
  if (plan.phase === "recovery") return null;
  if (target.distance !== "half" && target.distance !== "marathon") {
    return null;
  }
  if (!target.targetTimeS || target.targetTimeS <= 0) return null;
  if (
    typeof plan.currentWeek !== "number" ||
    typeof plan.totalWeeks !== "number" ||
    plan.totalWeeks <= 0
  ) {
    return null;
  }
  // Feasibility gate (see `RaceTarget.currentVdot`): a long-shot goal
  // must not set training paces. Sessions fall back to their
  // fitness-derived / template paces; the verdict line in the race-plan
  // editor tells the user this is happening.
  if (typeof target.currentVdot === "number" && target.currentVdot > 0) {
    const targetVdot = vdotFromRace(
      RACE_GOAL_KM[target.distance] * 1000,
      target.targetTimeS
    );
    if (raceTargetBand(targetVdot - target.currentVdot) === "long_shot") {
      return null;
    }
  }
  return {
    distance: target.distance,
    goalPaceS: target.targetTimeS / RACE_GOAL_KM[target.distance],
    phase: getPhaseForWeek(plan.currentWeek, plan.totalWeeks, target.distance),
  };
}

/**
 * A2 — race-pace block sizing for a build-phase long run (Pfitzinger's
 * marathon/half-marathon-pace long runs). One third of the run at goal
 * pace, whole kilometres, floored at 3K and capped per distance so the
 * dose stays conservative relative to the book prescriptions (Pfitzinger
 * runs up to ~16K at MP inside a 29K run; we stop well short of that).
 */
export function racePaceBlockKm(
  totalKm: number,
  distance: "half" | "marathon"
): number {
  const cap = distance === "marathon" ? 12 : 8;
  return Math.min(cap, Math.max(3, Math.round(totalKm / 3)));
}

/**
 * A long run's race-pace finish: its last `blockKm` at the goal pace. The
 * run screen plays it as the closing segment; every surface that names the
 * run before it starts says so (Run21 (2)).
 */
export interface RacePaceFinish {
  /** The closing block, km (`racePaceBlockKm`). */
  blockKm: number;
  /** The goal pace, s/km. */
  goalPaceS: number;
}

/**
 * Whether a long run finishes at race pace: in the build of a half or
 * marathon plan with a goal time, once the run is 12 km or more, so it
 * holds an easy majority and a block worth running. A taper long run stays
 * easy (the taper cuts load).
 */
export function longRunRacePaceFinish(
  tmpl: Pick<RunTemplate, "type" | "config">,
  race: RaceEnrichment | null | undefined
): RacePaceFinish | null {
  const km = tmpl.config.targetDistanceKm ?? 0;
  if (!race || tmpl.type !== "long" || race.phase !== "build" || km < 12) {
    return null;
  }
  return {
    blockKm: racePaceBlockKm(km, race.distance),
    goalPaceS: race.goalPaceS,
  };
}

/** The profile fields the race-pace gate reads. */
export interface RaceTargetProfile {
  runMode?: string | null;
  raceGoal?: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetTimeS?: number;
  } | null;
  runFitness?: RunFitnessInput | null;
}

/**
 * The profile's race goal as the launch reads it (`RaceTarget`): the goal
 * with its time, and the runner's current VDOT from the FULL fitness read
 * for the feasibility gate. Null without a goal time. The run screen and
 * the plan's surfaces both read it from here, so the launch and the plan
 * agree.
 */
export function raceTargetFromProfile(
  profile: RaceTargetProfile | null | undefined
): RaceTarget | null {
  const goal = profile?.raceGoal;
  if (!goal?.targetTimeS) return null;
  return {
    distance: goal.distance,
    targetTimeS: goal.targetTimeS,
    currentVdot:
      paceTableFromFitness(profile?.runFitness ?? null)?.vdot ?? null,
  };
}

/**
 * A planned run's race-pace finish, for the surfaces that name it before it
 * starts: the launch's gate on the launch's inputs. The plan's current week
 * sets the phase, as it does for "Why this run" and at the launch; the plan
 * holds only the current week's runs.
 */
export function racePaceFinishFor(
  tmpl: Pick<RunTemplate, "type" | "config"> | null | undefined,
  profile: RaceTargetProfile | null | undefined,
  runPlan: RunPlan | null | undefined
): RacePaceFinish | null {
  if (!tmpl) return null;
  return longRunRacePaceFinish(
    tmpl,
    resolveRaceEnrichment(
      profile?.runMode ?? "freeform",
      raceTargetFromProfile(profile),
      runPlan
    )
  );
}
