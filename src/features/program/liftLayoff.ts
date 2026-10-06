/**
 * How long a lifter has been away, and whether to say anything about it.
 *
 * The run side has had this since Run15: `layoffDetection` measures the gap,
 * `FellBehindSheet` greets the runner who comes back. A lifter returning
 * after three weeks got nothing — the programme carried on prescribing the
 * loads of someone who had never stopped.
 *
 * The MEASUREMENT is new; the POLICY is not. `classifyLayoff` and its two
 * thresholds already take a plain day count and are not run-specific, so
 * they are reused rather than copied — a second set of thresholds would be
 * the classic mirror drift: two numbers meaning the same thing, only one of
 * them tested, diverging the first time someone tuned one.
 *
 * ONE exported function, deliberately. The first draft exported the three
 * pieces separately and the caller composed them, which walked the workout
 * list twice and left one export reachable only from its own test — the
 * reachability gate refused it, correctly. A single assessment is also the
 * honest API: every caller wants all three answers together.
 *
 * This module REPORTS. It prescribes nothing: it says whether the Welcome
 * back sheet is offered and what its "Ease back in" would take off, and
 * the plan changes only when the person chooses it there (Lift4 (11),
 * `easeBackIn`).
 */
import { parseLocalDate } from "@/lib/dateHelpers";
import { classifyLayoff, type LayoffClass } from "./layoffDetection";

/** Days away from which the Welcome back sheet is offered: two weeks
 *  (Lift4 (11)). A week away is a missed week, not a break. */
export const WELCOME_BACK_DAYS = 14;

/** Days away past which easing back takes 20% off the loads, not 10%:
 *  eight weeks (Lift4 (11)). */
export const LONG_BREAK_DAYS = 56;

/** What "Ease back in" takes off the loads: 10%, or 20% after a long
 *  break (Lift4 (11)). */
export const EASE_BACK_SHARE = 0.1;
export const LONG_BREAK_EASE_BACK_SHARE = 0.2;

/** A logged session, as far as this module is concerned. */
export interface DatedWorkout {
  date?: string;
  /** Absent or empty on a programme day that was opened and abandoned
   *  rather than completed. */
  exercises?: ReadonlyArray<{ sets?: ReadonlyArray<unknown> }>;
}

export interface LiftReturnAssessment {
  /**
   * Whole days since the most recent session with work in it, or null when
   * there has never been one.
   *
   * `null` is NOT a layoff — a brand-new account has no history to be away
   * from, and treating it as one would greet every first-time lifter with
   * "welcome back" on the day they signed up. Same trap the run side
   * documents for `daysSinceLastRun`.
   */
  daysAway: number | null;
  /** The gap under the shared policy. `none` for a null `daysAway`. */
  layoff: LayoffClass;
  /**
   * Dismissal identity for THIS absence: the date of the last real session.
   *
   * Dismissing settles this return for good, and a later gap — which has a
   * different last-session date — asks again on its own merits. A key based
   * on today would re-ask tomorrow; a constant one would silence the
   * feature permanently after a single dismissal.
   */
  dismissKey: string | null;
  /** Whether the Welcome back sheet is offered: two weeks away or more. */
  welcomeBack: boolean;
  /**
   * Whether "Ease back in" is the choice the sheet puts first: three weeks
   * away or more, the shared `detrained` line, past which the plan's loads
   * are no longer the person's.
   */
  easeBackFirst: boolean;
  /** What easing back takes off the loads: 10%, or 20% after more than
   *  eight weeks away. */
  easeBackShare: number;
}

/**
 * Did this session represent work actually done?
 *
 * The run side gates on `isVolumeEligible` for the same reason: a document
 * existing is not the same as a session happening, and counting an empty
 * one would tell a lifter who opened the app and closed it again that they
 * had trained — masking a real gap behind an abandoned day.
 */
function isTrainedSession(workout: DatedWorkout): boolean {
  return (workout.exercises ?? []).some((ex) => (ex?.sets?.length ?? 0) > 0);
}

/** Everything the return surface needs, from one pass over the history. */
export function assessLiftReturn(
  workouts: readonly DatedWorkout[],
  todayKey: string
): LiftReturnAssessment {
  let latest: string | null = null;
  for (const workout of workouts ?? []) {
    if (!workout?.date || !isTrainedSession(workout)) continue;
    // Lexicographic max is safe and cheap for "YYYY-MM-DD".
    if (latest === null || workout.date > latest) latest = workout.date;
  }
  if (latest === null) {
    return {
      daysAway: null,
      layoff: "none",
      dismissKey: null,
      welcomeBack: false,
      easeBackFirst: false,
      easeBackShare: EASE_BACK_SHARE,
    };
  }

  const last = parseLocalDate(latest).getTime();
  const today = parseLocalDate(todayKey).getTime();
  // A session dated in the future (clock skew, a back-filled entry) is not a
  // layoff. Clamp at 0 rather than reporting negative days away.
  const daysAway = Math.max(0, Math.round((today - last) / 86_400_000));

  const layoff = classifyLayoff(daysAway);
  return {
    daysAway,
    layoff,
    dismissKey: latest,
    welcomeBack: daysAway >= WELCOME_BACK_DAYS,
    easeBackFirst: layoff === "detrained",
    easeBackShare:
      daysAway > LONG_BREAK_DAYS ? LONG_BREAK_EASE_BACK_SHARE : EASE_BACK_SHARE,
  };
}
