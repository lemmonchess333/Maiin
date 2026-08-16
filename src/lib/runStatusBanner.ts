/**
 * Which single status the live run screen is allowed to shout about.
 *
 * The screen used to render its status elements as an unconditional stack:
 * a nav-aid chip, then auto-paused, then the background-gap notice, then the
 * background-permission card, then GPS-recovering — each rendering whenever
 * its own condition held, in source order. Three consequences, all visible on
 * a real device (owner, 2026-08-16, on the orange banner: "does this look
 * weird?"):
 *
 * 1. UP TO FOUR BANNERS AT ONCE, over the map, growing downward into the
 *    stats. A previous fix had already stacked them to stop them overlapping
 *    at hand-picked `top-*` offsets — which solved the collision and left the
 *    volume.
 *
 * 2. SOURCE ORDER IS NOT PRIORITY. The least urgent thing on the screen (a
 *    back-to-start chip) rendered ABOVE the most urgent (your GPS is gone and
 *    your track is being damaged right now). A runner glancing down for half
 *    a second reads the top item.
 *
 * 3. TWO OF THEM PULSED. An orange bar and a red bar both animating, on a
 *    surface you look at while moving.
 *
 * So: one lane, one banner, chosen by severity. This module is the choice,
 * kept pure and out of the 1800-line page so it can actually be tested —
 * the old logic lived in an IIFE inside JSX and nothing asserted any of it.
 *
 * The nav-aid chips are deliberately NOT in here. They are an aid, not a
 * status: they answer "which way home" continuously rather than reporting
 * that something is wrong, and they are the one element that should survive
 * alongside a warning.
 */

export type RunStatusKind = "gps-lost" | "auto-paused" | "background-gap";

export interface RunStatus {
  kind: RunStatusKind;
  /** Drives the token set — `critical` is the only one that pulses. */
  severity: "warning" | "critical";
  message: string;
}

/** No fix has ARRIVED for this long during an active run. */
export const GPS_LOST_AFTER_SECONDS = 8;

export interface RunStatusInput {
  /** Run phase; only an active run reports status. */
  phase: string;
  /** Timestamp of the last ARRIVED fix, or null before the first one. */
  lastFixAt: number | null;
  /** Wall clock, passed in so this stays pure and testable. */
  now: number;
  /** Suppress the GPS banner until this timestamp (post-resume cold start). */
  gpsBannerSuppressedUntil: number;
  autoPaused: boolean;
  /** Copy for the background-recording gap, or null when there is none. */
  backgroundGapMessage: string | null;
}

/**
 * The one status worth a banner, or null for a quiet screen.
 *
 * Priority is by what the runner can still affect:
 *
 *   gps-lost        your track is being damaged RIGHT NOW
 *   auto-paused     your timer is stopped and you may not want it to be
 *   background-gap  your track WAS damaged — true, but already in the past
 *
 * The gap notice losing to the other two is the deliberate part. It is the
 * least actionable of the three mid-run and the most useful afterwards,
 * where the summary already carries route quality.
 */
export function resolveRunStatus(input: RunStatusInput): RunStatus | null {
  if (input.phase !== "active") return null;

  if (
    input.lastFixAt !== null &&
    input.now >= input.gpsBannerSuppressedUntil
  ) {
    const gapSeconds = (input.now - input.lastFixAt) / 1000;
    if (gapSeconds >= GPS_LOST_AFTER_SECONDS) {
      return {
        kind: "gps-lost",
        severity: "critical",
        message: `GPS recovering · last fix ${Math.round(gapSeconds)}s ago`,
      };
    }
  }

  if (input.autoPaused) {
    return {
      kind: "auto-paused",
      severity: "warning",
      message: "Auto-paused · start moving to resume",
    };
  }

  if (input.backgroundGapMessage) {
    return {
      kind: "background-gap",
      severity: "warning",
      message: input.backgroundGapMessage,
    };
  }

  return null;
}
