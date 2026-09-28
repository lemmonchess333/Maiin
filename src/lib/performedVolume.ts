/**
 * The sets a lifter actually did, per muscle, per week, judged against
 * the same bands the programme plans to.
 *
 * Settings → Lift plan shows the PLANNED week against those bands
 * (`WeeklyVolumeCard`). Analytics had only a heat map of set shares, which
 * says what was trained most but not whether it was enough: 64 sets of
 * legs in a month reads as a lot until it is split over quads, hamstrings,
 * glutes and calves. This feeds performed sessions to the volume model's
 * own tally (`weeklyVolumeByJudgementMuscle`), so a muscle the plan would
 * flag as under-dosed is flagged here from what was done.
 *
 * Averaged over whole weeks: a range's current week is part-done and would
 * pull every muscle down, so it is left out; so is any week that started
 * before the user's first session, which would count as a week of nothing.
 * A week with no lifting in it after that counts as none: it happened.
 */
import {
  judgementLandmark,
  classifyVolume,
  weeklyVolumeByJudgementMuscle,
  JUDGEMENT_MUSCLE_ORDER,
  type JudgementMuscle,
  type VolumeDay,
  type VolumeLandmark,
  type VolumeStatus,
} from "@/features/program/volumeModel";
import { matchMovementCategory } from "./exerciseMovementCategory";
import { EXERCISES, getExerciseById } from "./exercises";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
  startOfLocalWeek,
} from "./dateHelpers";

export interface MuscleWeekVolume {
  muscle: JudgementMuscle;
  /** Sets a week, averaged over the weeks, to one decimal. */
  setsPerWeek: number;
  landmark: VolumeLandmark;
  status: VolumeStatus;
}

interface VolumeWorkout {
  date: string;
  exercises?: readonly {
    exerciseId?: string;
    exerciseName: string;
    sets?: readonly { reps: number; type?: string }[];
  }[];
}

/** A performed session in the shape the volume model tallies. An exercise
 *  the catalogue does not know and no rule recognises is left out rather
 *  than guessed at. */
function asVolumeDay(w: VolumeWorkout): VolumeDay {
  const exercises: VolumeDay["exercises"][number][] = [];
  for (const ex of w.exercises ?? []) {
    const id =
      ex.exerciseId && getExerciseById(ex.exerciseId)
        ? ex.exerciseId
        : (EXERCISES.find((e) => e.name === ex.exerciseName)?.id ??
          ex.exerciseId ??
          "");
    const movementCategory = matchMovementCategory(ex.exerciseName, id);
    if (!movementCategory) continue;
    exercises.push({
      exerciseId: id,
      movementCategory,
      sets: (ex.sets ?? []).filter((s) => s.type !== "warmup" && s.reps > 0)
        .length,
    });
  }
  return { exercises };
}

/**
 * The weeks (Monday keys) to average over: every week the range covers
 * whole, before the current one, that began on or after the user's first
 * session. A range too short to hold a whole week (the last 7 days) takes
 * the most recent complete week instead, so a week's view still answers.
 */
export function volumeWeekKeys({
  since,
  today,
  firstSessionKey,
}: {
  since: Date;
  today: Date;
  /** The user's first ever session, "YYYY-MM-DD"; none means no weeks. */
  firstSessionKey: string | null;
}): string[] {
  if (!firstSessionKey) return [];
  const currentWeek = startOfLocalWeek(today);
  const sinceKey = localDateString(since);
  const whole: Date[] = [];
  for (
    let cursor = startOfLocalWeek(since);
    cursor < currentWeek;
    cursor = addLocalDays(cursor, 7)
  ) {
    if (localDateString(cursor) >= sinceKey) whole.push(cursor);
  }
  const weeks = whole.length > 0 ? whole : [addLocalDays(currentWeek, -7)];
  return weeks
    .filter((start) => localDateString(start) >= firstSessionKey)
    .map((start) => localWeekKey(start));
}

export function performedWeeklyVolume(
  workouts: readonly VolumeWorkout[],
  {
    weekKeys,
    primaryGoal,
  }: { weekKeys: readonly string[]; primaryGoal: string | undefined }
): MuscleWeekVolume[] {
  if (weekKeys.length === 0) return [];
  const inWeeks = new Set(weekKeys);
  const byWeek = new Map<string, VolumeWorkout[]>();
  for (const w of workouts) {
    const key = localWeekKey(parseLocalDate(w.date));
    if (!inWeeks.has(key)) continue;
    const list = byWeek.get(key) ?? [];
    list.push(w);
    byWeek.set(key, list);
  }
  const totals = new Map<JudgementMuscle, number>();
  for (const list of byWeek.values()) {
    for (const { muscle, sets } of weeklyVolumeByJudgementMuscle(
      list.map(asVolumeDay)
    )) {
      totals.set(muscle, (totals.get(muscle) ?? 0) + sets);
    }
  }
  if (totals.size === 0) return [];
  return JUDGEMENT_MUSCLE_ORDER.map((muscle) => {
    const setsPerWeek =
      Math.round(((totals.get(muscle) ?? 0) / weekKeys.length) * 10) / 10;
    const landmark = judgementLandmark(primaryGoal, muscle);
    return {
      muscle,
      setsPerWeek,
      landmark,
      status: classifyVolume(setsPerWeek, landmark),
    };
  }).filter(
    // A group with no floor and no sets says nothing (front delts are
    // covered by pressing); one with a floor and no sets is the finding.
    (row) => row.setsPerWeek > 0 || row.landmark.low > 0
  );
}
