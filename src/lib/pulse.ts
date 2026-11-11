/**
 * The live pulse (Soc15): how many sessions were saved today across all of
 * Tropos, shown on Social's Feed as "Today: 14 sessions on Tropos".
 *
 * The server keeps one count per day, `pulse/{YYYY-MM-DD}` = { sessions,
 * updatedAt, expiresAt }, adding each saved session the challenges would
 * credit on the local day it started (functions/lib/pulse.js). The viewer
 * reads their own local today, the same day key the app saves sessions
 * under (`localDateString`).
 */

/** Where each day's count is kept, `pulse/{YYYY-MM-DD}`: the server's
 *  COLLECTION in functions/lib/pulse.js (pulse.cross.test.ts). */
export const PULSE_COLLECTION = "pulse";

/**
 * The fewest sessions the line is shown for. Below it the line is not
 * drawn at all: "Today: 1 session" reads as an empty room, which is worse
 * than saying nothing, and every new Tropos lives there first.
 */
export const PULSE_MIN_SESSIONS = 10;

/** The day's count off its document: a whole number of sessions, or 0
 *  for anything that is not one. */
export function pulseSessions(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const n = (raw as { sessions?: unknown }).sessions;
  return typeof n === "number" && Number.isFinite(n) && n > 0
    ? Math.floor(n)
    : 0;
}

/** Whether a day's count is shown. */
export function showsPulse(sessions: number | null): sessions is number {
  return sessions !== null && sessions >= PULSE_MIN_SESSIONS;
}
