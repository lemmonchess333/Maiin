/**
 * Race-day plan (roadmap A7) — pure view model for the pacing card shown
 * in the race overlay during taper + race week.
 *
 * Standard marathon coaching practice (Pfitzinger's race-execution
 * chapter): a split table with a slightly conservative start (the
 * negative split), and tiered A/B/C goals so a rough day still has a
 * target that counts.
 *
 * Honest-register rules this module keeps:
 *  - Splits never pace a long-shot target. The SAME band scale that
 *    gates goal-pace training (`raceTargetBand`, runPaces) decides here:
 *    a target more than 4 VDOT beyond the benchmark is paced from the
 *    fitness-implied time instead, and the note says so. Racing a
 *    long-shot from the gun is the classic blow-up.
 *  - Goal tiers are labelled by their source ("Your goal" / "What your
 *    recent running implies" / a named Tropos heuristic) — no promises.
 *  - Weather: deliberately NOT wired. `weather.ts` fetches CURRENT
 *    conditions; a race days out needs a forecast for the race date,
 *    which we don't have. A caution line from today's weather would be
 *    theater — the roadmap's weather-aware line waits on forecast data.
 *
 * Pure: no React, no Firestore, no Date.now() — callers pass everything.
 */
import {
  paceTableFromFitness,
  predictedRaceTimesFromFitness,
  raceTargetBand,
  vdotFromRace,
  type RunFitnessInput,
} from "./runPaces";
import { getPhaseForWeek } from "@/features/program/runScheduler";

export type RaceDistance = "5k" | "10k" | "half" | "marathon";

const DISTANCE_KM: Record<RaceDistance, number> = {
  "5k": 5,
  "10k": 10,
  half: 21.0975,
  marathon: 42.195,
};

/** Split-table checkpoint spacing: short races read per-km, long races
 *  per-5K — the table stays 5–10 rows either way. */
const CHECKPOINT_KM: Record<RaceDistance, number> = {
  "5k": 1,
  "10k": 2,
  half: 5,
  marathon: 5,
};

/** "1:44:30" / "44:30" — finish-time formatting for goals + cumulatives. */
export function raceTimeLabel(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
    : `${m}:${sec.toString().padStart(2, "0")}`;
}

export interface RaceSplitRow {
  /** "5 km" … "Finish". */
  label: string;
  /** Elapsed time at this checkpoint, seconds (rounded; the final row is
   *  exactly the plan time — conservation is pinned in tests). */
  cumulativeS: number;
  /** This segment's pace, s/km (rounded for display). */
  segmentPaceS: number;
}

export interface RaceGoalRow {
  tier: "A" | "B" | "C";
  /** "1:44:30", or "Finish" for the C tier. */
  label: string;
  /** Honest source line — "Your goal", "What your recent running
   *  implies", etc. */
  detail: string;
}

export interface RaceDayPlanVM {
  /** Which time the splits pace. "fitness" when there is no target OR
   *  the target is a long shot (see module header). */
  paceSource: "target" | "fitness";
  planTimeS: number;
  avgPaceS: number;
  goals: RaceGoalRow[];
  splits: RaceSplitRow[];
  /** One honest sentence under the table. */
  note: string;
}

/** The card belongs to race execution, not training — visible only in
 *  the taper and race-week phases. */
export function raceDayPlanVisible(
  currentWeek: number | null | undefined,
  totalWeeks: number | null | undefined,
  distance: RaceDistance
): boolean {
  if (currentWeek == null || totalWeeks == null || totalWeeks <= 0) {
    return false;
  }
  const phase = getPhaseForWeek(currentWeek, totalWeeks, distance);
  return phase === "taper" || phase === "race";
}

/**
 * The negative-split table: opens ~2% easier than the plan's average
 * pace, closes ~2% faster, linear in between — then normalised so the
 * segment times sum EXACTLY to the plan time (the bias shapes the race,
 * it never changes the total).
 */
function buildSplits(
  totalKm: number,
  planTimeS: number,
  checkpointKm: number
): RaceSplitRow[] {
  const ends: number[] = [];
  for (let k = checkpointKm; k < totalKm - 0.05; k += checkpointKm) {
    ends.push(k);
  }
  ends.push(totalKm);
  const n = ends.length;
  const avg = planTimeS / totalKm;
  const bias = (i: number) => (n === 1 ? 1 : 1.02 - 0.04 * (i / (n - 1)));
  const raw = ends.reduce((acc, end, i) => {
    const len = end - (i === 0 ? 0 : ends[i - 1]);
    return acc + len * avg * bias(i);
  }, 0);
  const norm = planTimeS / raw;
  let cumulative = 0;
  return ends.map((end, i) => {
    const len = end - (i === 0 ? 0 : ends[i - 1]);
    const pace = avg * bias(i) * norm;
    cumulative += len * pace;
    return {
      label: end === totalKm ? "Finish" : `${end} km`,
      cumulativeS:
        i === n - 1 ? Math.round(planTimeS) : Math.round(cumulative),
      segmentPaceS: Math.round(pace),
    };
  });
}

export function buildRaceDayPlan(input: {
  distance: RaceDistance;
  targetTimeS?: number | null;
  runFitness?: RunFitnessInput | null;
}): RaceDayPlanVM | null {
  const { distance } = input;
  const km = DISTANCE_KM[distance];
  const target =
    input.targetTimeS && input.targetTimeS > 0 ? input.targetTimeS : null;
  const predicted =
    predictedRaceTimesFromFitness(input.runFitness ?? null)?.[distance] ??
    null;
  if (!target && !predicted) return null;

  // Long-shot check — the same judgment the training gate makes
  // (runPlanMetadata.resolveRaceEnrichment), on the same band scale.
  const currentVdot = paceTableFromFitness(input.runFitness ?? null)?.vdot;
  const targetIsLongShot =
    target != null &&
    currentVdot != null &&
    raceTargetBand(vdotFromRace(km * 1000, target) - currentVdot) ===
      "long_shot";

  let paceSource: RaceDayPlanVM["paceSource"];
  let planTimeS: number;
  let note: string;
  if (target && !targetIsLongShot) {
    paceSource = "target";
    planTimeS = target;
    note =
      "Opens ~2% easier than goal pace and closes faster — the negative split (a Tropos heuristic, not a promise).";
  } else if (target && targetIsLongShot && predicted) {
    paceSource = "fitness";
    planTimeS = predicted;
    note =
      "Your goal reads well beyond your recent running, so the splits pace what that running implies — chasing a long shot from the gun is the classic blow-up.";
  } else if (target) {
    // Long-shot flag without a prediction can't happen (the flag needs a
    // benchmark), so this branch is target-with-no-benchmark.
    paceSource = "target";
    planTimeS = target;
    note =
      "Opens ~2% easier than goal pace and closes faster — the negative split (a Tropos heuristic, not a promise).";
  } else {
    paceSource = "fitness";
    planTimeS = predicted!;
    note =
      "Paced from what your recent running implies — set a goal time in the race plan to pace a target.";
  }

  // A/B tiers: the distinct candidate times, fastest first, each labelled
  // by its source. One candidate → B is a flat +2.5% back-off.
  const candidates: { timeS: number; detail: string }[] = [];
  if (target) candidates.push({ timeS: target, detail: "Your goal" });
  if (
    predicted &&
    (!target || Math.abs(predicted - target) / target > 0.01)
  ) {
    candidates.push({
      timeS: predicted,
      detail: "What your recent running implies",
    });
  }
  candidates.sort((a, b) => a.timeS - b.timeS);
  if (candidates.length === 1) {
    candidates.push({
      timeS: candidates[0].timeS * 1.025,
      detail: "A back-off if the day fights you (Tropos heuristic)",
    });
  }
  const goals: RaceGoalRow[] = [
    { tier: "A", label: raceTimeLabel(candidates[0].timeS), detail: candidates[0].detail },
    { tier: "B", label: raceTimeLabel(candidates[1].timeS), detail: candidates[1].detail },
    { tier: "C", label: "Finish", detail: "The goal that always counts" },
  ];

  return {
    paceSource,
    planTimeS,
    avgPaceS: Math.round(planTimeS / km),
    goals,
    splits: buildSplits(km, planTimeS, CHECKPOINT_KM[distance]),
    note,
  };
}
