import { prescribedRepRange } from "./programEngine";

/**
 * The prescription target as the user should read it: the range a lift
 * climbs through (`prescribedRepRange`), or its fixed target, and a timed
 * hold in seconds, since a plank was rendering as a bare "30",
 * indistinguishable from thirty repetitions (backlog #7's time axis).
 */
export function formatRepTarget(
  ex: Parameters<typeof prescribedRepRange>[0]
): string {
  const { bottom, top } = prescribedRepRange(ex);
  const reps = top > bottom ? `${bottom}–${top}` : String(ex.reps);
  return ex.repUnit === "seconds" ? `${reps}s` : reps;
}
