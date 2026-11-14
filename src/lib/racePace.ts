/**
 * A planned run's work at the goal race pace (A2, Run21 (2)): a long run's
 * closing block, or a tempo run at the goal pace. One gate, for the launch
 * (`runPlanMetadata`'s prefill, which builds the run's segments and target
 * from it) and for every surface that names the run before it starts:
 * Home's cards, Train's card, the day sheet and the launch card.
 *
 * It sits apart from `runPlanMetadata` so Home can read it without loading
 * the segment builders and their cue copy.
 */
import { getPhaseForWeek } from "@/features/program/runPlanTiming";
import type { RunPlan } from "@/features/program/runScheduler";
import {
  paceTableFromFitness,
  prescriptivePaceTableFromFitness,
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
  /** Where the pace came from: the goal time the person typed, or, for a
   *  marathon with none, the middle of the marathon band their confirmed
   *  benchmark gives (Run24 (9)). The words name each for what it is. */
  source?: RacePaceSource;
}

/** A typed goal time, or a marathon's band from a confirmed benchmark. */
export type RacePaceSource = "goal" | "band";

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
  /** The plan's week, from 0: build tempos alternate on it (Run24 (9)). */
  week: number;
  source: RacePaceSource;
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
    phase: getPhaseForWeek(
      plan.currentWeek,
      plan.totalWeeks,
      target.distance,
      plan.shortBase
    ),
    week: plan.currentWeek,
    source: target.source ?? "goal",
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
 * A planned run's work at the goal race pace (A2), which the run screen
 * plays and every surface that names the run before it starts says
 * (Run21 (2)):
 *
 * - `finish`: a long run's last `blockKm` at the goal pace, in the build of
 *   a half or marathon plan, once the run is 12 km or more, so it holds an
 *   easy majority and a block worth running. A taper long run stays easy
 *   (the taper cuts load).
 * - `blocks`: a long run's blocks at the goal pace (Run24 (5)), the
 *   session of its own a later build week holds in place of a plain long
 *   run (`racePaceBlocks`).
 * - `tempo`: a tempo run's blocks at the goal pace, in place of the pace
 *   the runner's fitness would set: every taper tempo (race rhythm is what
 *   the taper's sharpening is for), and in the build every other one
 *   (`buildTempoAtRacePace`), so threshold is trained too.
 *
 * Without a typed goal time a marathon's race pace is its marathon band
 * (`RaceTarget.source`).
 */
export type RacePaceWork =
  | {
      kind: "finish";
      blockKm: number;
      goalPaceS: number;
      /** Absent reads as a typed goal time. */
      source?: RacePaceSource;
    }
  | { kind: "tempo"; goalPaceS: number; source?: RacePaceSource }
  /** Run24 (5): a long run's blocks at race pace (`racePaceBlocks`), the
   *  session the plan holds in place of a plain long run in a later build
   *  week. */
  | { kind: "blocks"; goalPaceS: number; source?: RacePaceSource };

/**
 * Whether a build week's tempo runs at race pace (Run24 (9), deep dive D12):
 * they alternate with threshold tempos, which the runner's fitness sets, so
 * both are trained. Tempos come every other week, or every week when the
 * plan holds two quality sessions or only tempos, so pairs of weeks
 * alternate: every other tempo in the first case, every other two in the
 * second. A Tropos heuristic.
 */
export function buildTempoAtRacePace(week: number): boolean {
  return Math.floor(week / 2) % 2 === 0;
}

/** The gate: a session's race-pace work, given the plan's enrichment. */
export function racePaceWork(
  tmpl: Pick<RunTemplate, "type" | "config">,
  race: RaceEnrichment | null | undefined
): RacePaceWork | null {
  if (!race) return null;
  if (tmpl.type === "tempo") {
    // Run24 (5): a progression run's finish is threshold work, never a
    // goal pace; the blocks of a tempo, cruise intervals or a sharpener are
    // where race pace is run.
    if (!tmpl.config.tempo) return null;
    return race.phase === "taper" ||
      (race.phase === "build" && buildTempoAtRacePace(race.week))
      ? { kind: "tempo", goalPaceS: race.goalPaceS, source: race.source }
      : null;
  }
  // Run24 (5): a long run with race-pace blocks runs them at its own
  // race's pace, and never finishes at it as well. The plan holds one only
  // in a build week, so its phase is not asked.
  const blocks = tmpl.config.racePaceBlocks;
  if (blocks)
    return blocks.race === race.distance
      ? { kind: "blocks", goalPaceS: race.goalPaceS, source: race.source }
      : null;
  const km = tmpl.config.targetDistanceKm ?? 0;
  if (tmpl.type !== "long" || race.phase !== "build" || km < 12) return null;
  return {
    kind: "finish",
    blockKm: racePaceBlockKm(km, race.distance),
    goalPaceS: race.goalPaceS,
    source: race.source,
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
 * for the feasibility gate. Without a goal time, a marathon's band from a
 * confirmed benchmark, and null for any other race. The run screen and
 * the plan's surfaces both read it from here, so the launch and the plan
 * agree.
 */
export function raceTargetFromProfile(
  profile: RaceTargetProfile | null | undefined
): RaceTarget | null {
  const goal = profile?.raceGoal;
  if (!goal) return null;
  if (!goal.targetTimeS) {
    // Run24 (9): a marathon with no goal time runs its race-pace work at
    // the middle of the marathon band a confirmed benchmark gives
    // (RUN-EV-08: none while it waits to be confirmed). It is the runner's
    // own fitness, so the feasibility gate has nothing to judge.
    if (goal.distance !== "marathon") return null;
    const band = prescriptivePaceTableFromFitness(
      profile?.runFitness
    )?.marathon;
    if (!band) return null;
    return {
      distance: "marathon",
      targetTimeS: Math.round(
        ((band[0] + band[1]) / 2) * RACE_GOAL_KM.marathon
      ),
      currentVdot: null,
      source: "band",
    };
  }
  return {
    distance: goal.distance,
    targetTimeS: goal.targetTimeS,
    currentVdot:
      paceTableFromFitness(profile?.runFitness ?? null)?.vdot ?? null,
    source: "goal",
  };
}

/**
 * A planned run's race-pace work, for the surfaces that name it before it
 * starts: the launch's gate on the launch's inputs. The plan's current week
 * sets the phase, as it does for "Why this run" and at the launch; the plan
 * holds only the current week's runs.
 */
export function racePaceWorkFor(
  tmpl: Pick<RunTemplate, "type" | "config"> | null | undefined,
  profile: RaceTargetProfile | null | undefined,
  runPlan: RunPlan | null | undefined
): RacePaceWork | null {
  if (!tmpl) return null;
  return racePaceWork(
    tmpl,
    resolveRaceEnrichment(
      profile?.runMode ?? "freeform",
      raceTargetFromProfile(profile),
      runPlan
    )
  );
}
