/**
 * Every muscle at least twice a week on a plan of two or more days
 * (Lift4 (5)).
 *
 * A muscle is worked on a day when one of the day's lifts counts sets toward
 * it, as the volume model counts them (ADR-0010): its primary muscle and each
 * secondary, so a row works the biceps and a press the triceps. The builders'
 * compound lifts give every big muscle two days; the small ones nothing else
 * reaches — side delts, calves and abs — come once a week or not at all, so a
 * new plan gets a lift for each muscle short of two days, on a day without
 * one. The time fit (`sessionFit.ts`) then keeps each muscle's second day
 * while anything else can give way; time still wins in the end.
 */
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";
import { exerciseDisplayName } from "./variationBank";
import {
  JUDGEMENT_MUSCLE_ORDER,
  primaryJudgementForExercise,
  weeklyVolumeByJudgementMuscle,
  type JudgementMuscle,
  type VolumeDay,
} from "./volumeModel";
import type { ProgramExercise, WorkoutDay } from "./programTypes";

/** The days a week each muscle is worked on, at least. */
export const WEEKLY_FREQUENCY = 2;

/** The days of a week each muscle is worked on. */
export function daysPerMuscle(
  days: readonly VolumeDay[]
): Map<JudgementMuscle, number> {
  const counts = new Map<JudgementMuscle, number>();
  for (const day of days) {
    for (const { muscle } of weeklyVolumeByJudgementMuscle([day])) {
      counts.set(muscle, (counts.get(muscle) ?? 0) + 1);
    }
  }
  return counts;
}

/** The lift a muscle gets when the week has none to repeat: simple, common,
 *  and a muscle's own (the equipment and injury passes swap it like any
 *  other). */
const DIRECT_LIFT: Record<JudgementMuscle, string> = {
  Chest: "db-bench",
  FrontDelts: "db-shoulder-press",
  SideDelts: "lateral-raise",
  RearDelts: "face-pulls",
  Triceps: "rope-tricep-pushdown",
  Lats: "lat-pulldown",
  UpperBack: "seated-row",
  LowerBack: "romanian-deadlift",
  Biceps: "db-curl",
  Quads: "leg-press",
  Hamstrings: "seated-leg-curl",
  Glutes: "hip-thrust",
  Calves: "standing-calf-raise",
  Abs: "cable-crunch",
};

const LOWER_BODY: ReadonlySet<JudgementMuscle> = new Set([
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "LowerBack",
]);

/** Whether a day of this type is where the muscle's work belongs: an
 *  upper-body muscle on an upper, push, pull or full-body day, a lower-body
 *  one on a lower, legs or full-body day, and abs on any. */
function belongsOn(dayType: string, muscle: JudgementMuscle): boolean {
  if (muscle === "Abs" || dayType === "full_body") return true;
  const lower = dayType === "lower" || dayType === "legs";
  return LOWER_BODY.has(muscle) ? lower : !lower;
}

/** What the plan reads of a lift here. */
type PlannedLift = Pick<
  ProgramExercise,
  "exerciseId" | "movementCategory" | "sets" | "isAccessory"
>;

const workingSets = (lifts: readonly PlannedLift[]) =>
  lifts.reduce((n, e) => n + (e.sets ?? 0), 0);

/**
 * The lifts a new plan needs for every muscle to be worked twice a week:
 * which day each goes on and what it is. A muscle short of two days gets a
 * lift on each day it lacks, up to two: a day of its own kind first, then
 * the day with the fewest working sets. The lift is the week's own direct
 * assistance lift for the muscle where it has one, so one lift comes round
 * twice, and otherwise `DIRECT_LIFT`'s.
 */
export function twiceWeeklyAdditions(
  days: readonly Pick<WorkoutDay, "dayType" | "exercises">[]
): Array<{ day: number; exerciseId: string }> {
  if (days.length < WEEKLY_FREQUENCY) return [];
  const additions: Array<{ day: number; exerciseId: string }> = [];
  // The week with the additions so far, so a muscle an earlier addition
  // reaches isn't given a lift of its own as well.
  const planned: PlannedLift[][] = days.map((d) => [...d.exercises]);
  for (const muscle of JUDGEMENT_MUSCLE_ORDER) {
    const lacking = planned
      .map((lifts, i) => ({ lifts, i }))
      .filter(
        ({ lifts }) =>
          !weeklyVolumeByJudgementMuscle([{ exercises: lifts }]).some(
            (v) => v.muscle === muscle
          )
      );
    const short = WEEKLY_FREQUENCY - (planned.length - lacking.length);
    if (short <= 0) continue;
    const own = planned
      .flat()
      .find(
        (e) =>
          e.isAccessory === true && primaryJudgementForExercise(e) === muscle
      );
    const lift: PlannedLift = own ?? {
      exerciseId: DIRECT_LIFT[muscle],
      movementCategory: inferMovementCategory(
        exerciseDisplayName(DIRECT_LIFT[muscle]),
        DIRECT_LIFT[muscle]
      ),
      sets: 3,
      isAccessory: true,
    };
    const chosen = [...lacking]
      .filter(
        ({ lifts }) => !lifts.some((e) => e.exerciseId === lift.exerciseId)
      )
      .sort(
        (a, b) =>
          Number(belongsOn(days[b.i].dayType, muscle)) -
            Number(belongsOn(days[a.i].dayType, muscle)) ||
          workingSets(a.lifts) - workingSets(b.lifts) ||
          a.i - b.i
      )
      .slice(0, short);
    for (const { lifts, i } of chosen) {
      additions.push({ day: i, exerciseId: lift.exerciseId });
      lifts.push(lift);
    }
  }
  return additions;
}

/**
 * The table is a ceiling (Lift4 (5)), and a lift added for the two days
 * doesn't take a muscle past one: in a settled week, the latest added lift
 * that works a muscle over its ceiling, if any (its `instanceId`). A lateral
 * raise counts toward the upper back as well as the side delts, so a week
 * whose rows already fill the upper back's ceiling keeps its side delts on
 * one day.
 */
export function extraPastCeiling(
  workouts: readonly WorkoutDay[],
  extras: ReadonlySet<string>,
  ceiling: (muscle: JudgementMuscle) => number
): string | undefined {
  const over = new Set(
    weeklyVolumeByJudgementMuscle(workouts)
      .filter((v) => v.sets > ceiling(v.muscle))
      .map((v) => v.muscle)
  );
  if (over.size === 0) return undefined;
  return workouts
    .flatMap((d) => d.exercises)
    .filter(
      (ex) =>
        ex.instanceId !== undefined &&
        extras.has(ex.instanceId) &&
        weeklyVolumeByJudgementMuscle([{ exercises: [ex] }]).some((v) =>
          over.has(v.muscle)
        )
    )
    .at(-1)?.instanceId;
}
