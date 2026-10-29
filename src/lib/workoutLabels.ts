/** The name saved for a programme/routine workout, shared by its calendar
 * and detail surfaces. Legacy/freeform entries may have no notes. */
export function workoutTitle(workout: { notes?: string }): string {
  return workout.notes?.split(" — ")[0]?.trim() || "Workout";
}
