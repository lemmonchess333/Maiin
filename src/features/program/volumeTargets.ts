import type { UserProfile } from "@/lib/auth";
import { toExperience } from "./experienceModel";
import { freshLiftWeek, type FreshLiftAnswers } from "./planBuilder";
import { sessionMinutesFor } from "./sessionFit";
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
 * where less fits, what fits: the sets a first plan built from the same
 * answers gives the muscle (`freshLiftWeek`), on the person's kit,
 * injuries and bodyweight as well as their days, focus, level and session
 * length, so their own plan, untouched, never reads below it. A muscle under
 * that is short of what the week can hold, which is worth saying; one under
 * the floor but at what fits is not. The ceiling stays the band's own.
 */
export function weeklyVolumeTargets(input: {
  goal: PrimaryGoal | undefined;
  experience: Experience | undefined;
  days: number;
  sessionMinutes: number | undefined;
  /** What the person trains with and around: the week that fits is built
   *  on them, as their own plan was. Absent: a full gym, no injuries. */
  equipment?: FreshLiftAnswers["equipment"];
  injuries?: readonly string[];
  barbellAtHome?: boolean;
  bodyweightKg?: number;
  sex?: string;
}): Map<JudgementMuscle, VolumeLandmark> {
  const experience = toExperience(input.experience);
  const reference = freshLiftWeek({
    primaryGoal: input.goal ?? "general",
    experience,
    liftDays: input.days,
    sessionMinutes: input.sessionMinutes,
    equipment: input.equipment ?? "full_gym",
    injuries: [...(input.injuries ?? [])],
    barbellAtHome: input.barbellAtHome,
    bodyweightKg: input.bodyweightKg,
    sex: input.sex,
  });
  const fits = new Map(
    weeklyVolumeByJudgementMuscle(reference).map((v) => [v.muscle, v.sets])
  );
  return new Map(
    JUDGEMENT_MUSCLE_ORDER.map((muscle) => {
      const band = judgementLandmark(input.goal, muscle, experience);
      const low = Math.min(band.low, fits.get(muscle) ?? 0);
      // The minimum below the floor comes down with it: a floor lowered to
      // what fits under a higher minimum still read the fitted week as low.
      return [muscle, { ...band, mv: Math.min(band.mv, low), low }];
    })
  );
}

/** What a profile says about the kit and body a person's week that fits is
 *  built on. */
export type TargetKit = Pick<
  UserProfile,
  "equipment" | "injuries" | "barbellAtHome" | "weightKg" | "sex"
>;

/** A profile's kit as `weeklyVolumeTargets` takes it. */
export function targetKit(profile: Partial<TargetKit> | null | undefined) {
  return {
    equipment: profile?.equipment,
    injuries: profile?.injuries,
    barbellAtHome: profile?.barbellAtHome,
    bodyweightKg: profile?.weightKg,
    sex: profile?.sex,
  };
}

/**
 * A person's targets from their profile alone, for a surface that doesn't
 * hold their plan: History's sets per muscle. The days and session length
 * are the profile's, read as the plan settings read them, so this matches
 * what Train's volume card judges the same person against.
 */
export function volumeTargetsFor(
  profile: TargetKit &
    Pick<
      UserProfile,
      | "primaryGoal"
      | "experience"
      | "weeklyWorkoutsTarget"
      | "liftTimeBudgetMinutes"
    >
): Map<JudgementMuscle, VolumeLandmark> {
  return weeklyVolumeTargets({
    goal: profile.primaryGoal as PrimaryGoal | undefined,
    experience: profile.experience,
    days: profile.weeklyWorkoutsTarget,
    sessionMinutes: sessionMinutesFor(profile.liftTimeBudgetMinutes),
    ...targetKit(profile),
  });
}
