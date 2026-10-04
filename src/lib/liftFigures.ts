/**
 * How a lift session's three headline figures are written: on the finish
 * screen as the session ends, and on the saved session's page when you
 * come back to it. One rule for both, so the page you return to says
 * what the finish said.
 *
 * Each figure is its number plus how to write it, so the finish can count
 * up to it (DS3) and still write every step as the static figure is
 * written.
 */
export interface LiftFigure {
  to: number;
  format: (n: number) => string;
  unit: string;
}

/** Whole numbers with grouped thousands: "6,155". */
export const groupedFigure = (n: number) =>
  Math.round(n).toLocaleString("en-GB");

/** "54" minutes, and "1:05" once past an hour. "1:00" is an hour and no
 *  minutes; under the word "hours" it read as one figure in hours, so it
 *  says hr:min. */
export function durationFigure(minutes: number): LiftFigure {
  const clock = (m: number) => {
    const whole = Math.round(m);
    return whole >= 60
      ? `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
      : String(whole);
  };
  return {
    to: minutes,
    format: clock,
    unit: minutes >= 60 ? "hr:min" : minutes === 1 ? "minute" : "minutes",
  };
}

/** The work done: kg lifted. A bodyweight session lifts no load the app
 *  can weigh, and "0 kg lifted" over a set of pull-ups reads as nothing
 *  done, so its reps take the place. The caller leaves holds out of both:
 *  their `reps` are seconds. */
export function workFigure(volumeKg: number, reps: number): LiftFigure {
  return volumeKg > 0 || reps === 0
    ? { to: volumeKg, format: groupedFigure, unit: "kg lifted" }
    : { to: reps, format: groupedFigure, unit: reps === 1 ? "rep" : "reps" };
}

/** The sets that count. Warm-ups are not the session's work, and are
 *  left out by the caller. */
export function setsFigure(sets: number): LiftFigure {
  return {
    to: sets,
    format: groupedFigure,
    unit: sets === 1 ? "set" : "sets",
  };
}
