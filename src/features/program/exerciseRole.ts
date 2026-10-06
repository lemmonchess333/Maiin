/**
 * An exercise's role in the plan (Lift4): a main lift, another compound, or
 * an isolation. Ranges, rests and effort cues follow it.
 *
 * Two facts decide it, and neither alone can. The movement says whether
 * one joint moves (the catalogue's `mechanic`): a curl or a lateral raise is
 * an isolation in any slot. The slot says whether a compound is the day's
 * main lift or supporting work (`isAccessory`): a Romanian deadlift or a leg
 * press in an accessory slot is another compound. The movement category
 * can't stand in for the first, since it puts the lateral raise and the
 * overhead press together (`exerciseMovementCategory.ts`), and the slot can't stand in
 * for the second on its own, since it can't tell a raise from a deadlift.
 *
 * A row with no slot recorded (an older plan, or one added from the picker)
 * counts its compounds as main lifts, as the rest of the engine does.
 */
import { getExerciseById } from "@/lib/exercises";

export type ExerciseRole = "main" | "compound" | "isolation";

export function exerciseRole(exercise: {
  exerciseId: string;
  isAccessory?: boolean;
}): ExerciseRole {
  if (getExerciseById(exercise.exerciseId)?.mechanic === "isolation")
    return "isolation";
  return exercise.isAccessory ? "compound" : "main";
}
