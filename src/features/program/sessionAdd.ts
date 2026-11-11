/**
 * "Add exercise" in a session (Mob1 call 1): an exercise the person adds
 * while lifting, for this session only.
 *
 * It takes the numbers an exercise added on Train takes (Lift5 (b)): its
 * role's sets, reps and progression at the plan's goal and the lifter's
 * level, an isolation an isolation's and a compound a main lift's
 * (`withRoleNumbers`). Its first weight is the one it was last lifted at,
 * else Train's first guess for an added lift (`addedExerciseWeight`).
 *
 * It is saved with the session and never reaches the plan: it has a slot
 * of its own (`instanceId`) that no plan day holds, and no progression
 * baseline, so `applySessionProgression` finds nothing of the plan's to
 * move with its sets.
 */
import { getExerciseById } from "@/lib/exercises";
import {
  normalizeExercise,
  type Experience,
  type PrimaryGoal,
  type ProgramExercise,
} from "./programTypes";
import { repUnitForExerciseId } from "./repUnits";
import { withRoleNumbers } from "./represcribe";
import { addedExerciseWeight, type StartingLoadContext } from "./startingLoads";

export interface AddedToday {
  /** A slot no plan day holds: the session's own. */
  instanceId: string;
  goal: PrimaryGoal | undefined;
  experience: Experience | undefined;
  loadContext?: StartingLoadContext;
  /** The weight the exercise was last lifted at, when it has been. */
  lastWeight?: number | null;
}

/** The exercise as the session runs it once it is added. */
export function exerciseAddedToday(
  exerciseId: string,
  added: AddedToday
): ProgramExercise {
  const repUnit = repUnitForExerciseId(exerciseId);
  const weight =
    added.lastWeight !== undefined &&
    added.lastWeight !== null &&
    added.lastWeight > 0
      ? added.lastWeight
      : addedExerciseWeight(exerciseId, added.loadContext, repUnit);
  const exercise = normalizeExercise({
    name: getExerciseById(exerciseId)?.name ?? exerciseId,
    exerciseId,
    instanceId: added.instanceId,
    sets: 3,
    reps: repUnit === "seconds" ? 30 : 10,
    weight,
    ...(repUnit !== undefined ? { repUnit } : {}),
  });
  // The role table works on a day; a day of its own gives the exercise
  // its role's numbers and nothing else's.
  const [day] = withRoleNumbers(
    [
      {
        dayName: "",
        dayType: "lift",
        exercises: [exercise],
        completed: false,
      },
    ],
    0,
    added.instanceId,
    added.goal ?? "general",
    added.experience
  );
  const numbered = day?.exercises[0] ?? exercise;
  // The role table moves a load to its reps; a weight the person has
  // lifted stays as lifted, as a swapped-in exercise's does.
  return added.lastWeight && added.lastWeight > 0
    ? { ...numbered, weight: added.lastWeight }
    : numbered;
}
