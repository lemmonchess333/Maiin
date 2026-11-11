/** The name saved for a programme/routine workout, shared by its calendar
 * and detail surfaces. Legacy/freeform entries may have no notes. */
export function workoutTitle(workout: { notes?: string }): string {
  return workout.notes?.split(" — ")[0]?.trim() || "Workout";
}

/**
 * A typed name as a saved workout's notes line keeps it whole: an em dash
 * beside a space becomes an en dash, so `workoutTitle`, which reads up to
 * the first " — ", never cuts inside the name. A phone's keyboard makes a
 * typed "--" an em dash, and two in a row ("Legs — — heavy") share the
 * space between them, so each dash is matched on its own side.
 */
export function keepTitleWhole(name: string): string {
  return name.replace(/ —|— /g, (dash) => dash.replace("—", "–"));
}
