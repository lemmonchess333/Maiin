/**
 * A run's elapsed time (Run28 calls 2 and 4): the wall clock from when its
 * clock started to when it was finished, `recordingEndedAt` less
 * `recordingStartedAt` on the saved run. No field of its own: a run saved
 * without both stamps has none.
 *
 * Its duration is moving time: what the clock counted, with auto-pause's
 * stops, a manual pause and, with auto-pause off, the stops its trace
 * shows taken out (`runMovingTime.ts`). As on Strava, pace is on moving
 * time and a race is on elapsed time.
 */

/** Elapsed time is shown beside moving time from this many seconds more. A
 *  Tropos heuristic: a run with no stops, or a few seconds at a crossing,
 *  stays one figure. */
export const ELAPSED_SHOWN_FROM_S = 60;

/** An instant as epoch ms: a number, a Date, a Firestore Timestamp, or a
 *  Timestamp that lost its class on the way (`{ seconds, nanoseconds }`).
 *  Null for anything else. */
export function epochMsOf(value: unknown): number | null {
  let ms: number | null = null;
  if (typeof value === "number") ms = value;
  else if (value instanceof Date) ms = value.getTime();
  else if (value && typeof value === "object") {
    const v = value as {
      toMillis?: unknown;
      seconds?: unknown;
      nanoseconds?: unknown;
    };
    if (typeof v.toMillis === "function") ms = (v.toMillis as () => number)();
    else if (typeof v.seconds === "number")
      ms =
        v.seconds * 1000 +
        (typeof v.nanoseconds === "number" ? v.nanoseconds / 1e6 : 0);
  }
  return ms !== null && Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** Whole seconds from `startedAt` to `endedAt` (each as `epochMsOf` reads
 *  it), or null when either is missing or the end is not after the
 *  start. */
export function elapsedSecondsOf(
  startedAt: unknown,
  endedAt: unknown
): number | null {
  const start = epochMsOf(startedAt);
  const end = epochMsOf(endedAt);
  if (start === null || end === null || end <= start) return null;
  return Math.floor((end - start) / 1000);
}

/** The elapsed time to show beside `movingSeconds`, or null when there is
 *  none or the two are within `ELAPSED_SHOWN_FROM_S`. */
export function shownElapsedSeconds(
  movingSeconds: number,
  elapsedSeconds: number | null
): number | null {
  if (elapsedSeconds === null || !Number.isFinite(movingSeconds)) return null;
  return elapsedSeconds - movingSeconds >= ELAPSED_SHOWN_FROM_S
    ? elapsedSeconds
    : null;
}

/** The goal race's time (Run28 call 4): its elapsed time, as Strava times
 *  a run tagged Race; its duration for a run saved without both stamps. */
export function goalRaceSeconds(
  durationSeconds: number,
  elapsedSeconds: number | null | undefined
): number {
  return typeof elapsedSeconds === "number" &&
    Number.isFinite(elapsedSeconds) &&
    elapsedSeconds > 0
    ? elapsedSeconds
    : durationSeconds;
}

/** The time figure of a run's stats: "Time" alone, or "Moving time" with
 *  its elapsed time beside it (`shownElapsedSeconds`). */
export function runTimeStat(
  movingSeconds: number,
  elapsedSeconds: number | null,
  format: (seconds: number) => string
): { label: string; value: string; detail?: { label: string; value: string } } {
  const elapsed = shownElapsedSeconds(movingSeconds, elapsedSeconds);
  if (elapsed === null) return { label: "Time", value: format(movingSeconds) };
  return {
    label: "Moving time",
    value: format(movingSeconds),
    detail: { label: "Elapsed time", value: format(elapsed) },
  };
}
