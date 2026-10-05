import { toExperience } from "./experienceModel";
import { generateProgram } from "./programEngine";
import {
  judgementLandmark,
  weeklyVolumeByJudgementMuscle,
  JUDGEMENT_MUSCLE_ORDER,
  type JudgementMuscle,
  type VolumeLandmark,
} from "./volumeModel";
import type { Experience, PrimaryGoal } from "./programTypes";

/**
 * What the Weekly volume card judges each muscle against (Lift4 (5): "the
 * Weekly volume card judges against what the days and time can fit").
 *
 * Time decides a plan's volume, so the weekly floor is only a target where
 * the days and session length can hold it. The target is the floor, or,
 * where less fits, what fits: the sets a plan freshly built for the same
 * days, focus, level and session length gives the muscle. A muscle under
 * that is short of what the week can hold, which is worth saying; one under
 * the floor but at what fits is not. The ceiling stays the band's own.
 */
export function weeklyVolumeTargets(input: {
  goal: PrimaryGoal | undefined;
  experience: Experience | undefined;
  days: number;
  sessionMinutes: number | undefined;
}): Map<JudgementMuscle, VolumeLandmark> {
  const reference = generateProgram(
    "recomp",
    input.days,
    undefined,
    input.goal,
    undefined,
    undefined,
    toExperience(input.experience),
    input.sessionMinutes
  ).workouts;
  const fits = new Map(
    weeklyVolumeByJudgementMuscle(reference).map((v) => [v.muscle, v.sets])
  );
  return new Map(
    JUDGEMENT_MUSCLE_ORDER.map((muscle) => {
      const band = judgementLandmark(
        input.goal,
        muscle,
        toExperience(input.experience)
      );
      return [
        muscle,
        { ...band, low: Math.min(band.low, fits.get(muscle) ?? 0) },
      ];
    })
  );
}
